//! 작업 실행기. 앱(Tauri)과 개발용 서버(`constellation-serve`)가 같이 쓴다.
//!
//! 새 지도 만들기는 Python 파이프라인(`constellation build --events`)을 자식
//! 프로세스로 띄운다. 표준 출력의 JSON 이벤트로 상태를 갱신하고, 로그와 상태를
//! 분석 DB 옆 `jobs/`에 남긴다. 실행하는 동안에는 [`Gate`]를 닫아 앱의 조회가
//! DB를 열지 않게 한다. 파이프라인이 단계마다 쓰기 연결을 열기 때문이다.
//!
//! 비동기 런타임에 묶이지 않도록 `std::process`와 스레드로 만든다. Tauri와 axum이
//! 각자 런타임을 갖고 있다.

mod job;
mod process;

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use constellation_core::{Database, Error, Gate};
use serde_json::Value;

pub use job::{valid_id, Job, JobError, Kind, Progress, Status, Store, KEEP, LOG_TAIL, STAGE_COUNT};

type Result<T> = std::result::Result<T, Error>;

/// 앱 조회가 돌려주는 문구. `/api/health`의 reason도 같다.
pub const BUSY: &str = "새 지도를 만드는 중입니다. 끝나면 다시 열립니다.";
/// 논문 추가·빼기 동안의 문구.
pub const BUSY_PAPERS: &str = "지도에 논문을 반영하는 중입니다. 끝나면 다시 열립니다.";

/// 종류별 파이프라인 인자. `file`은 요청을 쓴 파일, `mode`는 `--check` 또는 `--events`.
fn pipeline_args(kind: Kind, definition: &Value, file: &str, mode: &'static str) -> Vec<String> {
    let map = definition
        .get("map_id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let papers = |verb: &str| {
        vec!["papers".into(), verb.into(), "--map".into(), map.clone(), "-i".into(), file.into(), mode.into()]
    };
    match kind {
        Kind::Build => vec!["build".into(), "-d".into(), file.into(), mode.into()],
        Kind::Add => papers("add"),
        Kind::Remove => papers("remove"),
    }
}

fn busy_message(kind: Kind) -> &'static str {
    match kind {
        Kind::Build => BUSY,
        Kind::Add | Kind::Remove => BUSY_PAPERS,
    }
}
/// 실행 중인 조회가 끝나기를 기다리는 시간.
const IDLE_WAIT: Duration = Duration::from_secs(5);
/// SIGTERM 뒤 강제 종료까지 기다리는 시간.
const TERM_GRACE: Duration = Duration::from_secs(10);

#[derive(Debug, Clone)]
pub struct Runner {
    inner: Arc<Inner>,
}

#[derive(Debug)]
struct Inner {
    db: Database,
    pipeline: PathBuf,
    store: Store,
    current: Mutex<Option<Current>>,
    /// 실행 스레드가 끝날 때 알린다. 종료 처리가 기다린다.
    finished: Condvar,
}

#[derive(Debug, Clone)]
struct Current {
    id: String,
    pid: Option<u32>,
    cancelled: bool,
}

impl Runner {
    /// `db`는 앱의 조회와 같은 [`Gate`]를 가진 핸들이어야 한다.
    /// `pipeline`은 `constellation` CLI 실행 파일 경로다.
    pub fn new(db: Database, pipeline: impl Into<PathBuf>) -> Self {
        let dir = db
            .path()
            .parent()
            .map(|p| p.join("jobs"))
            .unwrap_or_else(|| PathBuf::from("jobs"));
        Self {
            inner: Arc::new(Inner {
                db,
                pipeline: pipeline.into(),
                store: Store::new(dir),
                current: Mutex::new(None),
                finished: Condvar::new(),
            }),
        }
    }

    pub fn store(&self) -> &Store {
        &self.inner.store
    }

    fn gate(&self) -> &Gate {
        self.inner.db.gate()
    }

    fn command(&self, args: &[&str]) -> Result<Command> {
        let inner = &self.inner;
        if !inner.pipeline.is_file() {
            return Err(Error::unavailable(format!(
                "파이프라인을 찾을 수 없습니다: {}. 저장소에서 `uv venv --python 3.12 .venv` 와 \
                 `uv pip install --python .venv/bin/python -e '.[embed]'` 로 설치하세요.",
                inner.pipeline.display()
            )));
        }
        let db = absolute(inner.db.path());
        let data = db.parent().map(Path::to_path_buf).unwrap_or_default();
        let mut cmd = Command::new(&inner.pipeline);
        cmd.args(args)
            .env("CONSTELLATION_DB", &db)
            .env("CONSTELLATION_DATA_DIR", &data)
            .env("PYTORCH_ENABLE_MPS_FALLBACK", "1")
            .env("PYTHONUNBUFFERED", "1")
            .env("PATH", cli_path())
            // 로그 파일에 rich의 색 코드가 섞이지 않게 한다.
            .env("NO_COLOR", "1")
            .env("TERM", "dumb")
            .stdin(Stdio::null());
        Ok(cmd)
    }

    /// 짧은 명령(검증·예상·토픽 검색)을 실행하고 표준 출력의 JSON을 돌려준다.
    /// 종료 코드 2는 정의 오류(422), 그 밖의 실패는 502다.
    fn run_json(&self, args: &[&str]) -> Result<Value> {
        let out = self
            .command(args)?
            .output()
            .map_err(|e| Error::unavailable(format!("파이프라인을 실행하지 못했습니다: {e}")))?;
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        match out.status.code() {
            Some(0) => serde_json::from_str(&stdout).map_err(|e| {
                Error::new(502, format!("파이프라인 출력이 JSON이 아닙니다: {e}"))
            }),
            Some(2) => Err(Error::invalid(last_line(&stderr, &stdout))),
            _ => Err(Error::new(502, last_line(&stderr, &stdout))),
        }
    }

    fn with_definition<T>(&self, id: &str, definition: &Value, f: impl FnOnce(&str) -> Result<T>) -> Result<T> {
        let path = self.store().definition_path(id);
        std::fs::create_dir_all(self.store().dir())
            .and_then(|_| std::fs::write(&path, definition.to_string()))
            .map_err(|e| Error::new(500, format!("정의를 저장하지 못했습니다: {e}")))?;
        f(&path.to_string_lossy())
    }

    /// 수집 예상 편수.
    pub fn estimate(&self, definition: &Value) -> Result<Value> {
        let id = format!("estimate-{}-{}", job::now_ms(), std::process::id());
        let r = self.with_definition(&id, definition, |p| self.run_json(&["estimate", "-d", p]));
        let _ = std::fs::remove_file(self.store().definition_path(&id));
        r
    }

    /// OpenAlex 토픽·서브필드·필드 검색.
    pub fn topics(&self, q: &str) -> Result<Value> {
        let q = q.trim();
        if q.is_empty() {
            return Err(Error::invalid("q 값이 필요합니다."));
        }
        self.run_json(&["topics", q])
    }

    /// 실행 중이거나 제출을 검증하는 중인 작업이 있는지.
    pub fn busy(&self) -> bool {
        self.inner.current.lock().unwrap().is_some()
    }

    pub fn jobs(&self) -> Vec<Job> {
        self.store().list()
    }

    pub fn job(&self, id: &str) -> Result<Job> {
        self.store()
            .load(id)
            .ok_or_else(|| Error::not_found("작업을 찾을 수 없습니다."))
    }

    pub fn log(&self, id: &str) -> Result<Vec<String>> {
        self.job(id)?;
        Ok(self.store().log_tail(id).unwrap_or_default())
    }

    /// 지도 정의를 검증하고 새 지도 만들기를 시작한다. 실행 중인 작업이 있으면 409.
    pub fn submit(&self, definition: Value) -> Result<Job> {
        self.submit_job(Kind::Build, definition)
    }

    /// 지도에 논문을 추가한다. `ids`는 검색 결과 id(`openalex:W…`) 또는 DOI·arXiv·OpenAlex 식별자.
    pub fn add_papers(&self, map_id: &str, ids: Value) -> Result<Job> {
        self.submit_job(Kind::Add, serde_json::json!({ "map_id": map_id, "ids": ids }))
    }

    /// 추가한 논문을 지도에서 뺀다.
    pub fn remove_papers(&self, map_id: &str, ids: Value) -> Result<Job> {
        self.submit_job(Kind::Remove, serde_json::json!({ "map_id": map_id, "ids": ids }))
    }

    /// 외부 논문 검색. `run`을 주면 결과마다 그 지도에 있는지(`in_map`)·추가한 논문인지
    /// (`added`)를 붙인다. 작업 중이라 DB를 열 수 없으면 둘 다 null이다.
    pub fn search(&self, q: &str, page: u32, run: Option<&str>) -> Result<Value> {
        let q = q.trim();
        if q.is_empty() {
            return Err(Error::invalid("q 값이 필요합니다."));
        }
        let page = page.to_string();
        let mut out = self.run_json(&["papers", "search", q, "--page", &page])?;
        let ids: Vec<String> = out["items"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|i| i["id"].as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        let flags = match run.filter(|r| !r.is_empty()) {
            Some(run) => match constellation_core::queries::membership(&self.inner.db, run, &ids) {
                Ok(m) => Some(m),
                Err(e) if e.status == 503 => None,
                Err(e) => return Err(e),
            },
            None => None,
        };
        if let Some(items) = out["items"].as_array_mut() {
            for (i, item) in items.iter_mut().enumerate() {
                let m = flags.as_ref().and_then(|f| f.get(i));
                item["in_map"] = m.map_or(Value::Null, |m| Value::Bool(m.in_map));
                item["added"] = m.map_or(Value::Null, |m| Value::Bool(m.added));
            }
        }
        Ok(out)
    }

    fn submit_job(&self, kind: Kind, definition: Value) -> Result<Job> {
        let id = {
            let mut cur = self.inner.current.lock().unwrap();
            if cur.is_some() {
                return Err(Error::new(409, "이미 실행 중인 작업이 있습니다."));
            }
            let mut id = format!("job-{}", job::now_ms());
            while self.store().load(&id).is_some() {
                id = format!("job-{}", job::now_ms() + 1);
            }
            *cur = Some(Current {
                id: id.clone(),
                pid: None,
                cancelled: false,
            });
            id
        };
        let checked = self.with_definition(&id, &definition, |p| {
            let args = pipeline_args(kind, &definition, p, "--check");
            self.run_json(&args.iter().map(String::as_str).collect::<Vec<_>>())
        });
        let checked = match checked {
            Ok(v) => v,
            Err(e) => {
                let _ = std::fs::remove_file(self.store().definition_path(&id));
                self.inner.current.lock().unwrap().take();
                return Err(e);
            }
        };
        let job = Job::new(id.clone(), kind, checked);
        if let Err(e) = self.store().save(&job) {
            self.inner.current.lock().unwrap().take();
            return Err(Error::new(500, format!("작업 상태를 저장하지 못했습니다: {e}")));
        }
        self.store().prune();
        let runner = self.clone();
        thread::spawn(move || runner.execute(id));
        Ok(job)
    }

    /// 실행 중인 작업을 취소한다. SIGTERM을 보내고, 시간 안에 끝나지 않으면 강제 종료한다.
    pub fn cancel(&self, id: &str) -> Result<Job> {
        let pid = {
            let mut cur = self.inner.current.lock().unwrap();
            match cur.as_mut() {
                Some(c) if c.id == id => {
                    c.cancelled = true;
                    c.pid
                }
                _ => {
                    let job = self.job(id)?;
                    return if job.status.is_active() {
                        Err(Error::new(409, "작업이 이 실행기에서 돌고 있지 않습니다."))
                    } else {
                        Ok(job)
                    };
                }
            }
        };
        if let Some(pid) = pid {
            process::terminate(pid);
            thread::spawn(move || {
                if !process::wait_exit(pid, TERM_GRACE) {
                    process::kill(pid);
                }
            });
        }
        self.job(id)
    }

    /// 앱·서버가 끝날 때 부른다. 실행 중인 작업을 취소하고 정리가 끝나기를 기다린다.
    pub fn shutdown(&self) {
        let id = self.inner.current.lock().unwrap().as_ref().map(|c| c.id.clone());
        let Some(id) = id else { return };
        let _ = self.cancel(&id);
        let cur = self.inner.current.lock().unwrap();
        let _ = self
            .inner
            .finished
            .wait_timeout_while(cur, TERM_GRACE + Duration::from_secs(20), |c| c.is_some());
    }

    /// 앱·서버가 시작할 때 부른다. 지난 실행에서 끝나지 않은 작업의 프로세스를
    /// 끝내고 실패로 바꾼 뒤, 만들다 만 코퍼스를 지운다.
    pub fn recover(&self) {
        for mut job in self.jobs().into_iter().filter(|j| j.status.is_active()) {
            if let Some(pid) = job.pid.filter(|&p| process::is_pipeline(p)) {
                process::terminate(pid);
                if !process::wait_exit(pid, TERM_GRACE) {
                    process::kill(pid);
                }
            }
            job.status = Status::Failed;
            job.ended_at = Some(job::now_ms());
            job.error = Some(JobError {
                stage: job.stage.clone(),
                message: "앱이 종료되어 중단됨".into(),
            });
            job.pid = None;
            let _ = self.store().save(&job);
            if let Some(corpus) = job.corpus_id.clone().filter(|_| job.kind == Kind::Build) {
                if self.gate().close(BUSY, IDLE_WAIT) {
                    self.drop_corpus(&job.id, &corpus);
                    self.gate().open();
                }
            }
        }
    }

    fn drop_corpus(&self, id: &str, corpus: &str) {
        let store = self.store();
        store.append_log(id, &format!("[정리] 만들다 만 코퍼스 {corpus}를 지운다"));
        match self
            .command(&["corpus", "drop", "--id", corpus, "--only-building"])
            .and_then(|mut c| {
                c.output()
                    .map_err(|e| Error::new(500, e.to_string()))
            }) {
            Ok(out) => {
                for line in String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .chain(String::from_utf8_lossy(&out.stderr).lines())
                {
                    store.append_log(id, &format!("[정리] {line}"));
                }
            }
            Err(e) => store.append_log(id, &format!("[정리] 실패: {}", e.message)),
        }
    }

    /// 작업 스레드. 여기서 끝나는 경로는 모두 Gate를 열고 current를 비운다.
    fn execute(&self, id: String) {
        struct Finish<'a>(&'a Runner);
        impl Drop for Finish<'_> {
            fn drop(&mut self) {
                // 패닉이 나도 조회가 계속 막히지 않게 한다.
                self.0.gate().open();
                self.0.inner.current.lock().unwrap().take();
                self.0.inner.finished.notify_all();
            }
        }
        let _finish = Finish(self);
        let store = self.store();
        let mut job = store.load(&id).expect("submit이 저장했다");

        let fail = |job: &mut Job, message: String| {
            job.status = Status::Failed;
            job.ended_at = Some(job::now_ms());
            job.error.get_or_insert(JobError {
                stage: job.stage.clone(),
                message,
            });
            let _ = store.save(job);
        };

        if !self.gate().close(busy_message(job.kind), IDLE_WAIT) {
            return fail(&mut job, "진행 중인 조회가 끝나지 않아 작업을 시작하지 못했습니다.".into());
        }
        if self.cancelled(&id) {
            job.status = Status::Cancelled;
            job.ended_at = Some(job::now_ms());
            let _ = store.save(&job);
            return;
        }
        let def = store.definition_path(&id).to_string_lossy().to_string();
        let args = pipeline_args(job.kind, &job.definition, &def, "--events");
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let child = self.command(&args).and_then(|mut c| {
            process::own_group(&mut c);
            c.stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| Error::unavailable(format!("파이프라인을 실행하지 못했습니다: {e}")))
        });
        let mut child = match child {
            Ok(c) => c,
            Err(e) => return fail(&mut job, e.message),
        };
        let pid = child.id();
        let cancelled_early = {
            let mut cur = self.inner.current.lock().unwrap();
            let c = cur.as_mut().expect("실행 중");
            c.pid = Some(pid);
            c.cancelled
        };
        if cancelled_early {
            process::terminate(pid);
        }
        job.status = Status::Running;
        job.pid = Some(pid);
        let _ = store.save(&job);

        // 표준 오류: 라이브러리 출력과 진행 막대. 로그에만 남긴다.
        let stderr = child.stderr.take().expect("piped");
        let err_store = store.clone();
        let err_id = id.clone();
        let err_tail = Arc::new(Mutex::new(Vec::<String>::new()));
        let tail = err_tail.clone();
        let err_thread = thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(std::result::Result::ok) {
                // 진행 막대는 \r로 같은 줄을 고쳐 쓴다. 마지막 상태만 남긴다.
                let line = line.rsplit('\r').next().unwrap_or("").trim_end().to_string();
                if line.is_empty() {
                    continue;
                }
                err_store.append_log(&err_id, &line);
                let mut t = tail.lock().unwrap();
                t.push(line);
                if t.len() > 20 {
                    t.remove(0);
                }
            }
        });

        let stdout = child.stdout.take().expect("piped");
        for line in BufReader::new(stdout).lines().map_while(std::result::Result::ok) {
            let Ok(ev) = serde_json::from_str::<Value>(&line) else {
                store.append_log(&id, &line);
                continue;
            };
            match ev.get("event").and_then(Value::as_str) {
                Some("log") => {
                    let stage = ev.get("stage").and_then(Value::as_str).unwrap_or("");
                    let msg = ev.get("message").and_then(Value::as_str).unwrap_or("");
                    store.append_log(&id, &format!("[{stage}] {msg}"));
                }
                Some("stage") => {
                    let stage = ev.get("stage").and_then(Value::as_str).unwrap_or("");
                    store.append_log(&id, &format!("── {stage} ──"));
                }
                Some("error") => {
                    let msg = ev.get("message").and_then(Value::as_str).unwrap_or("");
                    store.append_log(&id, &format!("[오류] {msg}"));
                }
                _ => {}
            }
            if job.apply(&ev) {
                let _ = store.save(&job);
            }
        }
        let status = child.wait();
        let _ = err_thread.join();
        job.pid = None;
        job.ended_at = Some(job::now_ms());
        let ok = matches!(&status, Ok(s) if s.success()) && job.map_id.is_some();
        if self.cancelled(&id) {
            job.status = Status::Cancelled;
            job.error = None;
            store.append_log(&id, "[취소] 작업을 취소했다");
        } else if ok {
            job.status = Status::Succeeded;
        } else {
            job.status = Status::Failed;
            if job.error.is_none() {
                let tail = err_tail.lock().unwrap().join("\n");
                let code = status
                    .ok()
                    .and_then(|s| s.code())
                    .map_or("신호".to_string(), |c| c.to_string());
                job.error = Some(JobError {
                    stage: job.stage.clone(),
                    message: if tail.is_empty() {
                        format!("파이프라인이 종료 코드 {code}로 끝났습니다.")
                    } else {
                        format!("파이프라인이 종료 코드 {code}로 끝났습니다.\n{tail}")
                    },
                });
            }
        }
        let _ = store.save(&job);
        // add·remove는 마지막 단계에서 한 트랜잭션으로 쓰므로 정리할 것이 없다.
        if job.status != Status::Succeeded && job.kind == Kind::Build {
            if let Some(corpus) = job.corpus_id.clone() {
                self.drop_corpus(&id, &corpus);
            }
        }
    }

    fn cancelled(&self, id: &str) -> bool {
        self.inner
            .current
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|c| c.id == id && c.cancelled)
    }
}

/// 이름 짓기가 부르는 `codex`·`claude` CLI를 찾을 수 있는 PATH.
///
/// Finder로 연 `.app`은 셸 설정을 읽지 않아 PATH가 `/usr/bin:/bin:/usr/sbin:/sbin`
/// 뿐이다. 두 CLI의 설치 위치(claude 설치기 `~/.local/bin`, Homebrew, npm 전역)를
/// 뒤에 덧붙인다. 이미 있는 항목은 다시 넣지 않는다.
pub fn cli_path() -> std::ffi::OsString {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let extra = [
        home.as_ref().map(|h| h.join(".local/bin")),
        Some(PathBuf::from("/opt/homebrew/bin")),
        Some(PathBuf::from("/usr/local/bin")),
        home.as_ref().map(|h| h.join(".npm-global/bin")),
    ];
    for d in extra.into_iter().flatten() {
        if !dirs.contains(&d) {
            dirs.push(d);
        }
    }
    std::env::join_paths(dirs).unwrap_or_default()
}

fn absolute(p: &Path) -> PathBuf {
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir().map(|d| d.join(p)).unwrap_or_else(|_| p.to_path_buf())
    }
}

fn last_line(stderr: &str, stdout: &str) -> String {
    let text = if stderr.is_empty() { stdout } else { stderr };
    text.lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("파이프라인이 실패했습니다.")
        .trim()
        .to_string()
}
