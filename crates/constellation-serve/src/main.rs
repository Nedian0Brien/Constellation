//! 개발용 HTTP 서버. FastAPI 버전과 같은 경로·쿼리 이름으로 `constellation-core`를 노출한다.
//! 브라우저에서 Vite 프록시를 거쳐 오고, Playwright E2E도 이 서버 위에서 돈다.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use clap::Parser;
use constellation_core::queries::{self, Direction, Order, PaperFilter, Sort};
use constellation_core::{Database, Error};
use serde::Serialize;
use tower_http::cors::CorsLayer;

#[derive(Parser)]
#[command(about = "Constellation 개발용 API 서버")]
struct Args {
    /// DuckDB 파일 경로
    #[arg(
        long,
        env = "CONSTELLATION_DB",
        default_value = "data/constellation.duckdb"
    )]
    db: PathBuf,
    #[arg(long, default_value_t = 8000)]
    port: u16,
}

/// FastAPI처럼 `{"detail": message}`로 돌려준다. 프론트의 `ApiError`가 이 모양을 읽는다.
struct ApiError(Error);

impl From<Error> for ApiError {
    fn from(e: Error) -> Self {
        Self(e)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status =
            StatusCode::from_u16(self.0.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        (
            status,
            Json(serde_json::json!({ "detail": self.0.message })),
        )
            .into_response()
    }
}

type Params = Query<HashMap<String, String>>;
type Reply<T> = Result<Json<T>, ApiError>;

fn ok<T: Serialize>(value: T) -> Reply<T> {
    Ok(Json(value))
}

/// 쿼리 값을 읽는다. 형이 안 맞으면 FastAPI처럼 422다.
fn int(p: &HashMap<String, String>, key: &str) -> Result<Option<i64>, ApiError> {
    match p.get(key).filter(|v| !v.is_empty()) {
        None => Ok(None),
        Some(v) => v
            .parse::<i64>()
            .map(Some)
            .map_err(|_| Error::invalid(format!("{key} 값이 잘못되었습니다.")).into()),
    }
}

fn required(p: &HashMap<String, String>, key: &str) -> Result<String, ApiError> {
    p.get(key)
        .filter(|v| !v.is_empty())
        .cloned()
        .ok_or_else(|| Error::invalid(format!("{key} 값이 필요합니다.")).into())
}

fn bounded(value: Option<i64>, default: i64, max: i64, key: &str) -> Result<u32, ApiError> {
    let v = value.unwrap_or(default);
    if v < 0 || v > max {
        return Err(Error::invalid(format!("{key} 값이 잘못되었습니다.")).into());
    }
    Ok(v as u32)
}

async fn runs(State(db): State<Database>) -> Reply<Vec<queries::RunInfo>> {
    ok(queries::runs(&db)?)
}

async fn map(State(db): State<Database>, Query(p): Params) -> Reply<queries::MapData> {
    ok(queries::map(&db, p.get("run").map(String::as_str))?)
}

async fn clusters(
    State(db): State<Database>,
    Query(p): Params,
) -> Reply<Vec<queries::ClusterInfo>> {
    ok(queries::clusters(&db, &required(&p, "run")?)?)
}

async fn tree(State(db): State<Database>, Query(p): Params) -> Reply<queries::TreeData> {
    ok(queries::tree(&db, &required(&p, "run")?)?)
}

async fn flow(State(db): State<Database>, Query(p): Params) -> Reply<queries::FlowData> {
    ok(queries::flow(&db, &required(&p, "run")?)?)
}

async fn flow_papers(
    State(db): State<Database>,
    Query(p): Params,
) -> Reply<Vec<queries::WorkBrief>> {
    let run = required(&p, "run")?;
    let window =
        int(&p, "window")?.ok_or_else(|| ApiError(Error::invalid("window 값이 필요합니다.")))?;
    let cluster =
        int(&p, "cluster")?.ok_or_else(|| ApiError(Error::invalid("cluster 값이 필요합니다.")))?;
    let limit = bounded(int(&p, "limit")?, 15, 60, "limit")?;
    ok(queries::flow_papers(
        &db,
        &run,
        window as i32,
        cluster as i32,
        limit,
    )?)
}

async fn lineage(State(db): State<Database>, Query(p): Params) -> Reply<queries::LineageData> {
    let run = required(&p, "run")?;
    let depth = bounded(int(&p, "depth")?, 2, 4, "depth")?;
    let limit = bounded(int(&p, "limit")?, 240, 600, "limit")?;
    ok(queries::lineage(
        &db,
        &run,
        p.get("seed").map(String::as_str),
        depth,
        limit,
    )?)
}

async fn cluster_detail(
    State(db): State<Database>,
    Path(cluster_id): Path<i32>,
    Query(p): Params,
) -> Reply<queries::ClusterDetail> {
    ok(queries::cluster_detail(
        &db,
        &required(&p, "run")?,
        cluster_id,
    )?)
}

fn paper_filter(p: &HashMap<String, String>) -> Result<PaperFilter, ApiError> {
    Ok(PaperFilter {
        run: required(p, "run")?,
        q: p.get("q").cloned().unwrap_or_default(),
        year_from: int(p, "year_from")?.map(|v| v as i32),
        year_to: int(p, "year_to")?.map(|v| v as i32),
    })
}

async fn works(State(db): State<Database>, Query(p): Params) -> Reply<queries::PaperPage> {
    let filter = paper_filter(&p)?;
    let sort = Sort::parse(p.get("sort").map(String::as_str).unwrap_or("cited"))?;
    let order = Order::parse(p.get("order").map(String::as_str).unwrap_or("desc"))?;
    let page = int(&p, "page")?.unwrap_or(1);
    let page_size = int(&p, "page_size")?.unwrap_or(25);
    if page < 1 || page_size < 1 || page > 1_000_000 || page_size > 100 {
        return Err(Error::invalid("잘못된 페이지 범위입니다.").into());
    }
    ok(queries::works(
        &db,
        filter,
        sort,
        order,
        page as u32,
        page_size as u32,
    )?)
}

async fn matches(State(db): State<Database>, Query(p): Params) -> Reply<queries::Matches> {
    ok(queries::matches(&db, paper_filter(&p)?)?)
}

async fn work(
    State(db): State<Database>,
    Path(work_id): Path<String>,
    Query(p): Params,
) -> Reply<queries::Work> {
    ok(queries::work(
        &db,
        &work_id,
        p.get("run").map(String::as_str),
    )?)
}

/// 논문 id에 `/`가 올 수 있어 `/works/{*work_id}` 아래에 붙이지 않고 쿼리로 받는다.
async fn citations(State(db): State<Database>, Query(p): Params) -> Reply<queries::Citations> {
    let run = required(&p, "run")?;
    let id = required(&p, "id")?;
    let direction = Direction::parse(p.get("direction").map(String::as_str).unwrap_or("both"))?;
    let limit = bounded(int(&p, "limit")?, 20, 500, "limit")?;
    ok(queries::citations(&db, &run, &id, direction, limit)?)
}

async fn health(State(db): State<Database>) -> Reply<queries::Health> {
    ok(queries::health(&db)?)
}

#[tokio::main]
async fn main() {
    let args = Args::parse();
    let db = Database::new(&args.db);
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:5173"),
            HeaderValue::from_static("http://127.0.0.1:5173"),
        ])
        .allow_methods([Method::GET])
        .allow_headers(tower_http::cors::Any);
    let app = Router::new()
        .route("/api/runs", get(runs))
        .route("/api/map", get(map))
        .route("/api/clusters", get(clusters))
        .route("/api/clusters/{cluster_id}", get(cluster_detail))
        .route("/api/tree", get(tree))
        .route("/api/flow", get(flow))
        .route("/api/flow/papers", get(flow_papers))
        .route("/api/lineage", get(lineage))
        .route("/api/works", get(works))
        .route("/api/matches", get(matches))
        .route("/api/works/{*work_id}", get(work))
        .route("/api/citations", get(citations))
        .route("/api/health", get(health))
        .layer(cors)
        .with_state(db);
    let addr = SocketAddr::from(([127, 0, 0, 1], args.port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("포트를 열지 못했다");
    println!(
        "constellation-serve: http://{addr} (db: {})",
        args.db.display()
    );
    axum::serve(listener, app).await.expect("서버 종료");
}
