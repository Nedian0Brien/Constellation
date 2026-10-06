//! 작업 상태와 그 저장. 분석 DB 옆 `jobs/` 폴더에 작업마다 파일 세 개를 둔다.
//!
//! - `<id>.json`: 상태([`Job`])
//! - `<id>.log`: 파이프라인 로그
//! - `<id>.definition.json`: 제출한 정의(파이프라인에 넘긴 파일)

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 남겨 두는 작업 수. 더 오래된 작업의 파일은 지운다.
pub const KEEP: usize = 20;
/// 로그 조회가 돌려주는 최대 줄 수.
pub const LOG_TAIL: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

impl Status {
    pub fn is_active(self) -> bool {
        matches!(self, Status::Queued | Status::Running)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Progress {
    pub done: u64,
    pub total: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JobError {
    /// 실패한 단계. 파이프라인이 시작하기 전 실패면 None.
    pub stage: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub status: Status,
    /// 정규화한 지도 정의(`constellation build --check` 출력).
    pub definition: Value,
    pub stage: Option<String>,
    pub stage_index: Option<u32>,
    pub stage_count: u32,
    /// 편수를 셀 수 있는 단계(collect·backfill·embed)에서만 채운다.
    pub progress: Option<Progress>,
    /// UNIX 시각(밀리초).
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub error: Option<JobError>,
    pub corpus_id: Option<String>,
    pub map_id: Option<String>,
    /// `llm`(이름 짓기 성공) 또는 `ctfidf`(건너뜀).
    pub naming: Option<String>,
    /// 파이프라인 프로세스. 앱이 꺼진 뒤 다시 켤 때 남은 프로세스를 찾는다.
    pub pid: Option<u32>,
}

/// 파이프라인 단계 수. `backend/constellation/pipeline.py`의 STAGES와 같다.
pub const STAGE_COUNT: u32 = 10;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Job {
    pub fn new(id: String, definition: Value) -> Self {
        Self {
            id,
            status: Status::Queued,
            definition,
            stage: None,
            stage_index: None,
            stage_count: STAGE_COUNT,
            progress: None,
            started_at: now_ms(),
            ended_at: None,
            error: None,
            corpus_id: None,
            map_id: None,
            naming: None,
            pid: None,
        }
    }

    /// 파이프라인 이벤트 한 줄을 반영한다. 반영했으면 true.
    pub fn apply(&mut self, ev: &Value) -> bool {
        let s = |k: &str| ev.get(k).and_then(Value::as_str).map(str::to_string);
        let n = |k: &str| ev.get(k).and_then(Value::as_u64);
        match ev.get("event").and_then(Value::as_str) {
            Some("corpus") => self.corpus_id = s("corpus_id"),
            Some("stage") => {
                self.stage = s("stage");
                self.stage_index = n("index").map(|i| i as u32);
                if let Some(c) = n("count") {
                    self.stage_count = c as u32;
                }
                self.progress = None;
            }
            Some("progress") => {
                self.progress = Some(Progress {
                    done: n("done").unwrap_or(0),
                    total: n("total").unwrap_or(0),
                })
            }
            Some("done") => {
                self.corpus_id = s("corpus_id").or(self.corpus_id.take());
                self.map_id = s("map_id");
                self.naming = s("naming");
            }
            Some("error") => {
                self.error = Some(JobError {
                    stage: s("stage"),
                    message: s("message").unwrap_or_default(),
                })
            }
            _ => return false,
        }
        true
    }
}

/// `jobs/` 폴더.
#[derive(Debug, Clone)]
pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn path(&self, id: &str, ext: &str) -> PathBuf {
        self.dir.join(format!("{id}.{ext}"))
    }

    pub fn log_path(&self, id: &str) -> PathBuf {
        self.path(id, "log")
    }

    pub fn definition_path(&self, id: &str) -> PathBuf {
        self.path(id, "definition.json")
    }

    /// 상태를 임시 파일에 쓰고 이름을 바꾼다. 읽는 쪽이 반쯤 쓴 파일을 보지 않는다.
    pub fn save(&self, job: &Job) -> std::io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        let tmp = self.path(&job.id, "json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(job).expect("Job은 직렬화된다"))?;
        fs::rename(tmp, self.path(&job.id, "json"))
    }

    pub fn load(&self, id: &str) -> Option<Job> {
        if !valid_id(id) {
            return None;
        }
        let bytes = fs::read(self.path(id, "json")).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    /// 최근 작업부터.
    pub fn list(&self) -> Vec<Job> {
        let mut jobs: Vec<Job> = fs::read_dir(&self.dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().into_string().ok()?;
                let id = name.strip_suffix(".json")?;
                if id.ends_with(".definition") {
                    return None;
                }
                self.load(id)
            })
            .collect();
        jobs.sort_by(|a, b| b.started_at.cmp(&a.started_at).then(b.id.cmp(&a.id)));
        jobs
    }

    /// 최근 [`KEEP`]개만 남긴다. 실행 중인 작업은 지우지 않는다.
    pub fn prune(&self) {
        for job in self.list().into_iter().skip(KEEP) {
            if job.status.is_active() {
                continue;
            }
            for ext in ["json", "log", "definition.json"] {
                let _ = fs::remove_file(self.path(&job.id, ext));
            }
        }
    }

    pub fn append_log(&self, id: &str, line: &str) {
        use std::io::Write;
        let _ = fs::create_dir_all(&self.dir);
        if let Ok(mut f) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.log_path(id))
        {
            let _ = writeln!(f, "{line}");
        }
    }

    /// 로그의 마지막 [`LOG_TAIL`]줄.
    pub fn log_tail(&self, id: &str) -> Option<Vec<String>> {
        if !valid_id(id) {
            return None;
        }
        let f = fs::File::open(self.log_path(id)).ok()?;
        let mut lines: Vec<String> = BufReader::new(f).lines().map_while(Result::ok).collect();
        if lines.len() > LOG_TAIL {
            lines.drain(..lines.len() - LOG_TAIL);
        }
        Some(lines)
    }
}

/// 경로 조작을 막는다. 실행기가 만드는 id는 `job-<숫자>`다.
pub fn valid_id(id: &str) -> bool {
    id.strip_prefix("job-")
        .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}
