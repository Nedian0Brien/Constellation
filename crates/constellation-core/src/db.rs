use std::path::{Path, PathBuf};

use duckdb::{AccessMode, Config, Connection};

use crate::error::{Error, Result};

/// 읽기 전용 DB 핸들. 경로만 들고 질의마다 연결을 연다.
///
/// DuckDB는 프로세스 간에 '쓰기 1개 또는 읽기 N개'만 허용한다. 파이프라인
/// (collect·cluster·name)이 쓰는 동안 열기가 실패하면 503으로 돌려 앱은 살려 둔다.
#[derive(Debug, Clone)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn exists(&self) -> bool {
        self.path.is_file()
    }

    pub(crate) fn connect(&self) -> Result<Connection> {
        if !self.exists() {
            return Err(Error::unavailable(
                "로컬 논문 데이터가 없습니다. 데이터 폴더를 확인해주세요.",
            ));
        }
        let config = Config::default()
            .access_mode(AccessMode::ReadOnly)
            .map_err(Error::from)?;
        Connection::open_with_flags(&self.path, config).map_err(|e| {
            Error::unavailable(format!(
                "DB가 잠겨 있다 — 쓰기 명령(collect / cluster / name 등)이 도는 중일 수 \
                 있다. 끝난 뒤 새로고침하라. ({e})"
            ))
        })
    }
}
