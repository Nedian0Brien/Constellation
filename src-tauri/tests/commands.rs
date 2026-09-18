//! 프론트가 보내는 모양(camelCase 인자, filter 객체) 그대로 명령을 불러 본다.
//! 창 없이 MockRuntime으로 돈다.

use duckdb::Connection;
use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::WebviewWindowBuilder;

const SCHEMA: &str = include_str!("../../backend/constellation/db/schema.sql");

fn invoke(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    cmd: &str,
    args: Value,
) -> Result<Value, Value> {
    get_ipc_response(
        webview,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            // macOS의 tauri:// 스킴은 dev·release 모두 로컬 출처로 친다.
            url: "tauri://localhost".parse().unwrap(),
            body: InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|b| b.deserialize::<Value>().unwrap())
}

#[test]
fn commands_accept_frontend_argument_shapes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.duckdb");
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(SCHEMA).unwrap();
    conn.execute_batch(
        "INSERT INTO runs (run_id,kind,model,created_at) VALUES ('a','project','scincl',CURRENT_TIMESTAMP);\
         INSERT INTO works (id,title,abstract,year,cited_by_count,has_abstract,source,collected_at) VALUES \
           ('1','Alpha retrieval','First abstract',2020,10,true,'test',CURRENT_TIMESTAMP),\
           ('2','Beta',NULL,NULL,3,false,'test',CURRENT_TIMESTAMP);\
         INSERT INTO projections(run_id,work_id,x,y) VALUES ('a','1',0,0),('a','2',1,1);\
         INSERT INTO clusters(run_id,work_id,cluster_id) VALUES ('a','1',0);\
         INSERT INTO cluster_meta(run_id,cluster_id,label,size) VALUES ('a',0,'retrieval',1);\
         INSERT INTO flow_windows VALUES ('a',0,2019,2020,2,1);\
         INSERT INTO flow_members VALUES ('a',0,0,'1');\
         INSERT INTO citations(citing_id,cited_id) VALUES ('2','1');",
    )
    .unwrap();
    drop(conn);

    let app = constellation_app::configure(mock_builder(), Some(path.clone()))
        .build(tauri::generate_context!())
        .expect("앱 빌드");
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();

    let status = invoke(&webview, "db_status", json!({})).unwrap();
    assert_eq!(status["exists"], true);
    assert_eq!(status["path"], path.display().to_string());

    let map = invoke(&webview, "map", json!({ "run": null })).unwrap();
    assert_eq!(map["n"], 2);

    // api.ts 의 fetchEdges 가 보내는 모양. 인덱스는 map 순서(1 → 0, 2 → 1).
    let edges = invoke(&webview, "edges", json!({ "run": "a" })).unwrap();
    assert_eq!(edges["n"], 2);
    assert_eq!(edges["citing"], json!([1]));
    assert_eq!(edges["cited"], json!([0]));

    let page = invoke(
        &webview,
        "works",
        json!({ "filter": { "run": "a", "q": "retrieval" }, "sort": "cited", "order": "desc", "page": 1, "pageSize": 25 }),
    )
    .unwrap();
    assert_eq!(page["total"], 1);
    assert_eq!(page["items"][0]["id"], "1");

    let matches = invoke(&webview, "matches", json!({ "filter": { "run": "a" } })).unwrap();
    assert_eq!(matches["total"], 2);

    let detail = invoke(
        &webview,
        "cluster_detail",
        json!({ "run": "a", "clusterId": 0 }),
    )
    .unwrap();
    assert_eq!(detail["label"], "retrieval");

    let papers = invoke(
        &webview,
        "flow_papers",
        json!({ "run": "a", "window": 0, "cluster": 0 }),
    )
    .unwrap();
    assert_eq!(papers[0]["id"], "1");

    let work = invoke(&webview, "work", json!({ "id": "2", "run": "a" })).unwrap();
    assert_eq!(work["year"], Value::Null);

    // api.ts 의 fetchCitations 가 보내는 모양 그대로. direction·limit 은 생략할 수 있다.
    let cites = invoke(
        &webview,
        "citations",
        json!({ "run": "a", "id": "1", "direction": "both", "limit": 20 }),
    )
    .unwrap();
    assert_eq!(cites["cited_by"][0]["id"], "2");
    assert_eq!(cites["cited_by_total"], 1);
    let cites = invoke(&webview, "citations", json!({ "run": "a", "id": "2" })).unwrap();
    assert_eq!(cites["references"][0]["cluster"], 0);
    let err = invoke(
        &webview,
        "citations",
        json!({ "run": "a", "id": "1", "direction": "up" }),
    )
    .unwrap_err();
    assert_eq!(err["status"], 422);

    // 오류는 {status, message}로 온다. 프론트의 ApiError가 이 모양을 읽는다.
    let err = invoke(
        &webview,
        "works",
        json!({ "filter": { "run": "a", "q": "x" } }),
    )
    .unwrap_err();
    assert_eq!(err["status"], 422);
    assert_eq!(err["message"], "검색어는 두 글자 이상 입력해주세요.");
    let err = invoke(&webview, "work", json!({ "id": "9", "run": "a" })).unwrap_err();
    assert_eq!(err["status"], 404);
}
