//! Constellation 질의 계층.
//!
//! `backend/constellation/api/app.py`(FastAPI)가 하던 일을 옮긴 것이다. SQL은 그대로
//! 두고 후처리만 Rust로 쓴다. Tauri 명령과 개발용 HTTP 서버가 같은 함수를 부른다.

mod db;
mod error;
pub mod queries;

pub use db::Database;
pub use error::{Error, Result};

/// 확정된 기본 임베딩 모델. `runs`·`map`이 이 모델의 최신 run을 우선한다.
/// (`backend/constellation/embed/encoder.py`의 DEFAULT_MODEL과 같아야 한다)
pub const DEFAULT_MODEL: &str = "scincl";

/// 쉼표로 이어 붙인 키워드 문자열을 배열로. Python의 `(s or "").split(", ") if s else []`.
pub(crate) fn split_keywords(s: Option<String>) -> Vec<String> {
    match s {
        Some(s) if !s.is_empty() => s.split(", ").map(str::to_string).collect(),
        _ => Vec::new(),
    }
}
