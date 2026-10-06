use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use duckdb::{AccessMode, Config, Connection};

use crate::error::{Error, Result};

/// 읽기 전용 DB 핸들. 경로만 들고 질의마다 연결을 연다.
///
/// DuckDB는 프로세스 간에 '쓰기 1개 또는 읽기 N개'만 허용한다. 파이프라인
/// (collect·cluster·name)이 쓰는 동안 열기가 실패하면 503으로 돌려 앱은 살려 둔다.
/// 앱이 직접 파이프라인을 실행할 때는 [`Gate`]를 닫아 연결을 아예 열지 않는다.
#[derive(Debug, Clone)]
pub struct Database {
    path: PathBuf,
    gate: Arc<Gate>,
}

/// 앱이 실행하는 작업(새 지도 만들기)이 DB에 쓰는 동안 조회를 막는다.
///
/// 작업은 여러 단계가 각자 쓰기 연결을 연다. 단계 사이에 앱이 읽기 연결을 열면
/// 다음 단계가 실패하므로 작업 전체 동안 닫아 둔다.
#[derive(Debug, Default)]
pub struct Gate {
    reason: Mutex<Option<String>>,
    active: AtomicUsize,
}

impl Gate {
    /// 닫혀 있으면 그 이유.
    pub fn reason(&self) -> Option<String> {
        self.reason.lock().unwrap().clone()
    }

    /// 새 연결을 막고, 열려 있는 연결이 모두 닫히기를 기다린다.
    /// 시간 안에 닫히지 않으면 다시 열고 false.
    pub fn close(&self, reason: impl Into<String>, timeout: Duration) -> bool {
        *self.reason.lock().unwrap() = Some(reason.into());
        let start = Instant::now();
        while self.active.load(Ordering::SeqCst) > 0 {
            if start.elapsed() > timeout {
                self.open();
                return false;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        true
    }

    pub fn open(&self) {
        *self.reason.lock().unwrap() = None;
    }

    /// 연결 수를 먼저 올리고 이유를 본다. `close`는 이유를 먼저 세우고 연결 수를
    /// 본다. 그래서 둘이 겹쳐도 한쪽은 반드시 상대를 본다.
    fn enter(self: &Arc<Self>) -> Result<Active> {
        self.active.fetch_add(1, Ordering::SeqCst);
        let active = Active(self.clone());
        if let Some(reason) = self.reason() {
            return Err(Error::unavailable(reason));
        }
        Ok(active)
    }
}

struct Active(Arc<Gate>);

impl Drop for Active {
    fn drop(&mut self) {
        self.0.active.fetch_sub(1, Ordering::SeqCst);
    }
}

/// 열린 읽기 연결. 닫힐 때 [`Gate`]의 연결 수를 내린다.
pub struct Conn {
    conn: Connection,
    _active: Active,
}

impl Deref for Conn {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        &self.conn
    }
}

impl Database {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self::with_gate(path, Arc::default())
    }

    /// 작업 실행기와 같은 [`Gate`]를 쓰는 핸들.
    pub fn with_gate(path: impl Into<PathBuf>, gate: Arc<Gate>) -> Self {
        Self {
            path: path.into(),
            gate,
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn gate(&self) -> &Arc<Gate> {
        &self.gate
    }

    pub fn exists(&self) -> bool {
        self.path.is_file()
    }

    /// 읽기 연결을 연다. 질의 함수와 테스트가 쓴다.
    pub fn connect(&self) -> Result<Conn> {
        let active = self.gate.enter()?;
        if !self.exists() {
            return Err(Error::unavailable(
                "로컬 논문 데이터가 없습니다. 데이터 폴더를 확인해주세요.",
            ));
        }
        let config = Config::default()
            .access_mode(AccessMode::ReadOnly)
            .map_err(Error::from)?;
        let conn = Connection::open_with_flags(&self.path, config).map_err(|e| {
            Error::unavailable(format!(
                "DB가 잠겨 있다 — 쓰기 명령(collect / cluster / name 등)이 도는 중일 수 \
                 있다. 끝난 뒤 새로고침하라. ({e})"
            ))
        })?;
        Ok(Conn {
            conn,
            _active: active,
        })
    }
}
