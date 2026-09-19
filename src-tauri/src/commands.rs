//! 프론트가 `invoke`로 부르는 명령. 이름·인자는 `frontend/src/api.ts`의 `call()`과 같다.
//! 인자는 JS camelCase → Rust snake_case 기본 변환을 따른다(`clusterId` → `cluster_id`).

use std::path::PathBuf;
use std::sync::Mutex;

use constellation_core::queries::{self, Order, PaperFilter, Sort};
use constellation_core::{Database, Error};
use serde::Serialize;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use crate::settings::{self, Settings};

/// 현재 DB 경로. 설정 파일에서 읽고, "데이터베이스 열기"로 바뀐다.
pub struct AppState {
    pub db_path: Mutex<PathBuf>,
}

impl AppState {
    fn db(&self) -> Database {
        Database::new(self.db_path.lock().unwrap().clone())
    }
}

type Reply<T> = Result<T, Error>;

#[tauri::command]
pub fn runs(state: State<AppState>) -> Reply<Vec<queries::RunInfo>> {
    queries::runs(&state.db())
}

#[tauri::command]
pub fn map(state: State<AppState>, run: Option<String>) -> Reply<queries::MapData> {
    queries::map(&state.db(), run.as_deref())
}

#[tauri::command]
pub fn clusters(state: State<AppState>, run: String) -> Reply<Vec<queries::ClusterInfo>> {
    queries::clusters(&state.db(), &run)
}

#[tauri::command]
pub fn edges(state: State<AppState>, run: String) -> Reply<queries::EdgesData> {
    queries::edges(&state.db(), &run)
}

#[tauri::command]
pub fn cluster_detail(
    state: State<AppState>,
    run: String,
    cluster_id: i32,
) -> Reply<queries::ClusterDetail> {
    queries::cluster_detail(&state.db(), &run, cluster_id)
}

#[tauri::command]
pub fn tree(state: State<AppState>, run: String) -> Reply<queries::TreeData> {
    queries::tree(&state.db(), &run)
}

#[tauri::command]
pub fn flow(state: State<AppState>, run: String) -> Reply<queries::FlowData> {
    queries::flow(&state.db(), &run)
}

#[tauri::command]
pub fn flow_papers(
    state: State<AppState>,
    run: String,
    window: i32,
    cluster: i32,
    limit: Option<u32>,
) -> Reply<Vec<queries::WorkBrief>> {
    queries::flow_papers(&state.db(), &run, window, cluster, limit.unwrap_or(15))
}

#[tauri::command]
pub fn lineage(
    state: State<AppState>,
    run: String,
    seed: Option<String>,
    depth: Option<u32>,
    limit: Option<u32>,
) -> Reply<queries::LineageData> {
    queries::lineage(
        &state.db(),
        &run,
        seed.as_deref(),
        depth.unwrap_or(2),
        limit.unwrap_or(240),
    )
}

#[tauri::command]
pub fn works(
    state: State<AppState>,
    filter: PaperFilter,
    sort: Option<String>,
    order: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
) -> Reply<queries::PaperPage> {
    let sort = Sort::parse(sort.as_deref().unwrap_or("cited"))?;
    let order = Order::parse(order.as_deref().unwrap_or("desc"))?;
    queries::works(
        &state.db(),
        filter,
        sort,
        order,
        page.unwrap_or(1),
        page_size.unwrap_or(25),
    )
}

#[tauri::command]
pub fn matches(state: State<AppState>, filter: PaperFilter) -> Reply<queries::Matches> {
    queries::matches(&state.db(), filter)
}

#[tauri::command]
pub fn work(state: State<AppState>, id: String, run: Option<String>) -> Reply<queries::Work> {
    queries::work(&state.db(), &id, run.as_deref())
}

#[derive(Debug, Serialize)]
pub struct DbStatus {
    pub path: String,
    pub exists: bool,
}

fn status(state: &AppState) -> DbStatus {
    let path = state.db_path.lock().unwrap().clone();
    DbStatus {
        exists: path.is_file(),
        path: path.display().to_string(),
    }
}

#[tauri::command]
pub fn citations(
    state: State<AppState>,
    run: String,
    id: String,
    direction: Option<String>,
    limit: Option<u32>,
) -> Reply<queries::Citations> {
    let direction = queries::Direction::parse(direction.as_deref().unwrap_or("both"))?;
    queries::citations(&state.db(), &run, &id, direction, limit.unwrap_or(20))
}

#[tauri::command]
pub fn db_status(state: State<AppState>) -> DbStatus {
    status(&state)
}

/// 네이티브 파일 대화상자로 `.duckdb`를 고르고 설정에 저장한다.
/// 취소하면 현재 상태를 그대로 돌려준다.
#[tauri::command]
pub async fn choose_database<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<DbStatus, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("DuckDB", &["duckdb", "db"])
        .set_title("Constellation 데이터베이스 열기")
        .blocking_pick_file();
    if let Some(file) = picked {
        let path = file.into_path().map_err(|e| e.to_string())?;
        settings::save(
            &app,
            &Settings {
                db_path: Some(path.clone()),
            },
        )?;
        *state.db_path.lock().unwrap() = path;
    }
    Ok(status(&state))
}
