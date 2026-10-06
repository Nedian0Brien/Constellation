//! 앱 설정. DB 파일 경로와 파이프라인(`constellation` CLI) 경로.
//!
//! `<app_config_dir>/settings.json`에 직접 읽고 쓴다. 값 하나에 플러그인을
//! 들일 이유가 없다.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub db_path: Option<PathBuf>,
    /// 새 지도 만들기가 부르는 `constellation` CLI. 없으면 [`default_pipeline`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pipeline_path: Option<PathBuf>,
}

fn file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("settings.json"))
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> Settings {
    file(app)
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<(), String> {
    let path = file(app).ok_or("설정 폴더를 찾을 수 없습니다.")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

/// 설정에 경로가 없으면 앱 데이터 폴더의 기본 파일.
pub fn default_db_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("constellation.duckdb")
}

/// 앱을 빌드한 저장소의 `.venv/bin/constellation`. 본인 전용 단계에서는 저장소에서
/// 빌드한 앱만 쓰므로 빌드 시점 경로로 충분하다(연구 도구 기획 9절).
pub fn default_pipeline() -> PathBuf {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    if cfg!(windows) {
        root.join(".venv/Scripts/constellation.exe")
    } else {
        root.join(".venv/bin/constellation")
    }
}
