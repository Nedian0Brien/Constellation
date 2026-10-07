//! 프론트가 `invoke`로 부르는 명령. 이름·인자는 `frontend/src/api.ts`의 `call()`과 같다.
//! 인자는 JS camelCase → Rust snake_case 기본 변환을 따른다(`clusterId` → `cluster_id`).

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use constellation_core::queries::{self, Order, PaperFilter, Sort};
use constellation_core::{Database, Error, Gate};
use constellation_jobs::{Job, Runner};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use crate::settings;

/// 현재 DB 경로와 작업 실행기. 경로는 설정 파일에서 읽고, "데이터베이스 열기"로 바뀐다.
/// 조회와 실행기는 같은 [`Gate`]를 써서 작업 중에는 조회가 DB를 열지 않는다.
pub struct AppState {
    db_path: Mutex<PathBuf>,
    gate: Arc<Gate>,
    pipeline: PathBuf,
    runner: Mutex<Runner>,
}

impl AppState {
    pub fn new(db_path: PathBuf, pipeline: PathBuf) -> Self {
        let gate = Arc::<Gate>::default();
        let runner = Runner::new(Database::with_gate(&db_path, gate.clone()), &pipeline);
        Self {
            db_path: Mutex::new(db_path),
            gate,
            pipeline,
            runner: Mutex::new(runner),
        }
    }

    fn db(&self) -> Database {
        Database::with_gate(self.db_path.lock().unwrap().clone(), self.gate.clone())
    }

    pub fn runner(&self) -> Runner {
        self.runner.lock().unwrap().clone()
    }

    /// DB 파일을 바꾼다. 작업이 돌고 있으면 그 DB에 쓰는 중이므로 바꾸지 않는다.
    fn set_db_path(&self, path: PathBuf) -> Result<(), String> {
        let mut runner = self.runner.lock().unwrap();
        if runner.busy() {
            return Err("새 지도를 만드는 중에는 데이터베이스를 바꿀 수 없습니다.".into());
        }
        *runner = Runner::new(Database::with_gate(&path, self.gate.clone()), &self.pipeline);
        *self.db_path.lock().unwrap() = path;
        Ok(())
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
        state.set_db_path(path.clone())?;
        let mut s = settings::load(&app);
        s.db_path = Some(path);
        settings::save(&app, &s)?;
    }
    Ok(status(&state))
}

// ── 새 지도 만들기 ─────────────────────────────────────────
// 실행기 호출은 Python 프로세스를 띄우고 기다린다. 창이 멈추지 않도록 async 명령으로
// 두고 blocking 스레드에서 실행한다.

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Reply<T> + Send + 'static,
) -> Reply<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| Error::new(500, e.to_string()))?
}

#[tauri::command]
pub async fn estimate_map(state: State<'_, AppState>, definition: Value) -> Reply<Value> {
    let runner = state.runner();
    blocking(move || runner.estimate(&definition)).await
}

#[tauri::command]
pub async fn search_topics(state: State<'_, AppState>, q: String) -> Reply<Value> {
    let runner = state.runner();
    blocking(move || runner.topics(&q)).await
}

#[tauri::command]
pub async fn create_map(state: State<'_, AppState>, definition: Value) -> Reply<Job> {
    let runner = state.runner();
    blocking(move || runner.submit(definition)).await
}

#[tauri::command]
pub async fn search_papers(
    state: State<'_, AppState>,
    q: String,
    page: Option<u32>,
    run: Option<String>,
) -> Reply<Value> {
    let runner = state.runner();
    let page = page.unwrap_or(1);
    if !(1..=40).contains(&page) {
        return Err(Error::invalid("page 값이 잘못되었습니다."));
    }
    blocking(move || runner.search(&q, page, run.as_deref())).await
}

#[tauri::command]
pub async fn add_papers(state: State<'_, AppState>, run: String, ids: Value) -> Reply<Job> {
    let runner = state.runner();
    blocking(move || runner.add_papers(&run, ids)).await
}

#[tauri::command]
pub async fn remove_papers(state: State<'_, AppState>, run: String, ids: Value) -> Reply<Job> {
    let runner = state.runner();
    blocking(move || runner.remove_papers(&run, ids)).await
}

#[tauri::command]
pub fn jobs(state: State<AppState>) -> Vec<Job> {
    state.runner().jobs()
}

#[tauri::command]
pub fn job(state: State<AppState>, id: String) -> Reply<Job> {
    state.runner().job(&id)
}

#[derive(Debug, Serialize)]
pub struct JobLog {
    pub id: String,
    pub lines: Vec<String>,
}

#[tauri::command]
pub fn job_log(state: State<AppState>, id: String) -> Reply<JobLog> {
    let lines = state.runner().log(&id)?;
    Ok(JobLog { id, lines })
}

#[tauri::command]
pub fn cancel_job(state: State<AppState>, id: String) -> Reply<Job> {
    state.runner().cancel(&id)
}
