use serde::Serialize;

/// HTTP 상태와 문구를 함께 든다. FastAPI 버전이 쓰던 상태·문구를 그대로 유지해
/// 프론트의 `ApiError` 처리가 바뀌지 않게 한다.
#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[error("{status}: {message}")]
pub struct Error {
    pub status: u16,
    pub message: String,
}

impl Error {
    pub fn new(status: u16, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(404, message)
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(422, message)
    }
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(503, message)
    }
}

impl From<duckdb::Error> for Error {
    fn from(e: duckdb::Error) -> Self {
        Self::new(500, format!("질의 실패: {e}"))
    }
}

pub type Result<T> = std::result::Result<T, Error>;
