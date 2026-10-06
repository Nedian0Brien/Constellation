//! 가짜 파이프라인(`fake-pipeline.sh`)으로 실행기의 상태 전이, 잠금, 정리를 본다.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use constellation_core::{queries, Database};
use constellation_jobs::{Job, Runner, Status, BUSY};
use duckdb::Connection;
use serde_json::json;

const SCHEMA: &str = include_str!("../../../backend/constellation/db/schema.sql");

struct Fx {
    dir: tempfile::TempDir,
    db: Database,
    runner: Runner,
}

fn fake() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fake-pipeline.sh")
}

fn setup() -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("constellation.duckdb");
    Connection::open(&path).unwrap().execute_batch(SCHEMA).unwrap();
    let db = Database::new(&path);
    let runner = Runner::new(db.clone(), fake());
    Fx { dir, db, runner }
}

fn def(mode: &str) -> serde_json::Value {
    json!({"kind": "terms", "name": "x", "mode": mode})
}

fn wait(runner: &Runner, id: &str) -> Job {
    let start = Instant::now();
    loop {
        let job = runner.job(id).unwrap();
        if !job.status.is_active() && runner.submit(def("bad")).unwrap_err().status != 409 {
            return job;
        }
        assert!(start.elapsed() < Duration::from_secs(30), "작업이 끝나지 않는다: {job:?}");
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn read(dir: &Path, name: &str) -> String {
    std::fs::read_to_string(dir.join(name)).unwrap_or_default()
}

#[test]
fn successful_job_records_stages_and_reopens_queries() {
    let fx = setup();
    let job = fx.runner.submit(def("ok")).unwrap();
    assert_eq!(job.status, Status::Queued);
    assert_eq!(job.definition["mode"], "ok");
    let done = wait(&fx.runner, &job.id);
    assert_eq!(done.status, Status::Succeeded, "{done:?}");
    assert_eq!(done.map_id.as_deref(), Some("project-fake"));
    assert_eq!(done.naming.as_deref(), Some("ctfidf"));
    assert_eq!((done.stage.as_deref(), done.stage_index), (Some("s9"), Some(9)));
    assert!(done.pid.is_none() && done.ended_at.is_some());
    let log = fx.runner.log(&job.id).unwrap();
    assert!(log.contains(&"[s9] 로그 한 줄".to_string()), "{log:?}");
    assert!(log.contains(&"bar 100%".to_string()), "{log:?}");
    // 실행기가 앱의 DB 경로를 그대로 넘긴다.
    assert_eq!(read(fx.dir.path(), "db-env.txt").trim(), fx.db.path().to_str().unwrap());
    assert!(read(fx.dir.path(), "drops.txt").is_empty());
    assert!(queries::runs(&fx.db).is_ok());
    assert_eq!(fx.runner.jobs()[0].id, job.id);
}

#[test]
fn failed_job_names_stage_and_drops_corpus() {
    let fx = setup();
    let job = fx.runner.submit(def("fail")).unwrap();
    let done = wait(&fx.runner, &job.id);
    assert_eq!(done.status, Status::Failed);
    let err = done.error.unwrap();
    assert_eq!((err.stage.as_deref(), err.message.as_str()), (Some("cluster"), "클러스터가 없다"));
    assert_eq!(read(fx.dir.path(), "drops.txt").trim(), "dropped fake --only-building");
}

#[test]
fn crash_without_error_event_reports_exit_code_and_stderr() {
    let fx = setup();
    let job = fx.runner.submit(def("crash")).unwrap();
    let done = wait(&fx.runner, &job.id);
    let err = done.error.unwrap();
    assert_eq!(err.stage.as_deref(), Some("embed"));
    assert!(err.message.contains("종료 코드 3") && err.message.contains("메모리 부족"), "{err:?}");
}

#[test]
fn running_job_blocks_queries_and_second_submit_then_cancels() {
    let fx = setup();
    let job = fx.runner.submit(def("slow")).unwrap();
    let start = Instant::now();
    while !fx.dir.path().join("ready.txt").exists() {
        assert!(start.elapsed() < Duration::from_secs(10));
        std::thread::sleep(Duration::from_millis(20));
    }
    let err = queries::runs(&fx.db).unwrap_err();
    assert_eq!((err.status, err.message.as_str()), (503, BUSY));
    assert_eq!(fx.runner.submit(def("ok")).unwrap_err().status, 409);
    // 작업 API는 계속 응답한다.
    assert_eq!(fx.runner.estimate(&def("ok")).unwrap()["expected"], 123);

    fx.runner.cancel(&job.id).unwrap();
    let done = wait(&fx.runner, &job.id);
    assert_eq!(done.status, Status::Cancelled);
    assert!(done.error.is_none());
    assert!(fx.dir.path().join("term.txt").exists(), "SIGTERM으로 끝내야 한다");
    assert_eq!(read(fx.dir.path(), "drops.txt").trim(), "dropped fake --only-building");
    assert!(queries::runs(&fx.db).is_ok());
}

#[test]
fn invalid_definition_is_422_and_leaves_no_job() {
    let fx = setup();
    let err = fx.runner.submit(def("bad")).unwrap_err();
    assert_eq!((err.status, err.message.as_str()), (422, "terms 값이 하나 이상 필요합니다."));
    assert!(fx.runner.jobs().is_empty());
    let job = fx.runner.submit(def("ok")).unwrap();
    wait(&fx.runner, &job.id);
}

#[test]
fn recover_kills_leftover_pipeline_and_fails_job() {
    let fx = setup();
    // 지난 실행이 남긴 파이프라인 프로세스와 running 상태 파일.
    let defn = fx.runner.store().definition_path("job-1");
    std::fs::create_dir_all(defn.parent().unwrap()).unwrap();
    std::fs::write(&defn, def("slow").to_string()).unwrap();
    let mut child = std::process::Command::new(fake())
        .args(["build", "-d", defn.to_str().unwrap(), "--events"])
        .env("CONSTELLATION_DATA_DIR", fx.dir.path())
        .stdout(std::process::Stdio::null())
        .spawn()
        .unwrap();
    // 신호 처리기를 건 뒤에 신호를 보낸다.
    let start = Instant::now();
    while !fx.dir.path().join("ready.txt").exists() {
        assert!(start.elapsed() < Duration::from_secs(10));
        std::thread::sleep(Duration::from_millis(20));
    }
    let mut job = Job::new("job-1".into(), def("slow"));
    job.status = Status::Running;
    job.pid = Some(child.id());
    job.corpus_id = Some("fake".into());
    fx.runner.store().save(&job).unwrap();

    fx.runner.recover();
    let status = child.wait().unwrap();
    assert_eq!(status.code(), Some(143), "{status:?}");
    let job = fx.runner.job("job-1").unwrap();
    assert_eq!(job.status, Status::Failed);
    assert_eq!(job.error.unwrap().message, "앱이 종료되어 중단됨");
    assert_eq!(read(fx.dir.path(), "drops.txt").trim(), "dropped fake --only-building");
    assert!(queries::runs(&fx.db).is_ok());
}

#[test]
fn missing_pipeline_is_503_and_bad_ids_are_404() {
    let fx = setup();
    let runner = Runner::new(fx.db.clone(), fx.dir.path().join("nope"));
    let err = runner.submit(def("ok")).unwrap_err();
    assert_eq!(err.status, 503);
    assert!(err.message.contains("uv venv"));
    assert_eq!(runner.job("../etc/passwd").unwrap_err().status, 404);
    assert_eq!(runner.topics(" ").unwrap_err().status, 422);
    assert_eq!(fx.runner.topics("robot").unwrap()[0]["name"], "robot");
}

#[test]
fn keeps_only_recent_jobs() {
    let fx = setup();
    for i in 0..25u64 {
        let mut job = Job::new(format!("job-{}", 100 + i), json!({}));
        job.status = Status::Succeeded;
        job.started_at = 100 + i;
        fx.runner.store().save(&job).unwrap();
    }
    fx.runner.store().prune();
    let jobs = fx.runner.jobs();
    assert_eq!(jobs.len(), constellation_jobs::KEEP);
    assert_eq!(jobs[0].id, "job-124");
}

#[test]
fn cli_path_appends_install_dirs_once() {
    let path = constellation_jobs::cli_path();
    let dirs: Vec<_> = std::env::split_paths(&path).collect();
    let local = PathBuf::from(std::env::var("HOME").unwrap()).join(".local/bin");
    let before = std::env::split_paths(&std::env::var_os("PATH").unwrap())
        .filter(|d| *d == local)
        .count();
    assert_eq!(dirs.iter().filter(|d| **d == local).count(), before.max(1));
    assert!(dirs.contains(&PathBuf::from("/opt/homebrew/bin")));
    assert!(dirs.contains(&PathBuf::from("/usr/bin")));
}
