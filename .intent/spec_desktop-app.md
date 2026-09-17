---
title: Constellation을 Tauri 데스크톱 앱으로
slug: desktop-app
stage: spec
status: accepted
intent: .intent/intent_desktop-app.md
date: 2026-09-17
---

# Constellation을 Tauri 데스크톱 앱으로 — 명세

## 요구사항

- [x] Cargo 워크스페이스(루트 `Cargo.toml`)에 `crates/constellation-core`(lib), `crates/constellation-serve`(bin), `src-tauri`(Tauri 앱)가 있다. `cargo build --workspace`가 통과한다.
- [x] `constellation-core`는 `Database::open(path)`(읽기 전용)와 다음 질의를 제공한다: `runs`, `map(run?)`, `clusters(run)`, `tree(run)`, `flow(run)`, `flow_papers(run, window, cluster, limit≤60)`, `lineage(run, seed?, depth 1..=4, limit≤600)`, `cluster_detail(run, id)`, `works(filter, sort, order, page, page_size)`, `matches(filter)`, `work(id, run?)`, `health`. 반환 구조체는 `serde::Serialize`이며 필드 이름·값이 `backend/constellation/api/app.py`의 JSON과 같다. `search`는 프론트가 쓰지 않아 옮기지 않는다.
- [x] 오류는 `Error { status: u16, message: String }`이며 Python과 같은 상태·문구를 쓴다: DB 없음 503 "로컬 논문 데이터가 없습니다…", 잠김 503, 없는 run 404 "분석 실행을 찾을 수 없습니다.", 1자 검색 422 "검색어는 두 글자 이상 입력해주세요.", 연도 역전 422, 잘못된 정렬·페이지 422, run 밖 논문 404 "현재 분석에 포함되지 않은 논문입니다.".
- [x] `constellation-serve`는 axum으로 `/api/*`를 FastAPI와 같은 경로·쿼리 이름으로 노출한다. 오류 본문은 `{"detail": message}`. `--db <path>`(기본 `CONSTELLATION_DB` 또는 `data/constellation.duckdb`), `--port`(기본 8000), CORS는 `localhost:5173`·`127.0.0.1:5173`.
- [x] Tauri 앱(`src-tauri`)은 위 질의를 `#[tauri::command]`로 노출한다(`runs`, `map`, `clusters`, `tree`, `flow`, `flow_papers`, `lineage`, `cluster_detail`, `works`, `matches`, `work`). 인자 이름은 JS camelCase → Rust snake_case 기본 변환을 따른다. 오류는 `Error`를 그대로 직렬화한다.
- [x] DB 경로: `<app_config_dir>/settings.json`의 `db_path`가 있으면 그것, 없으면 `<app_data_dir>/constellation.duckdb`. `db_status` 명령이 `{path, exists}`를 주고, `choose_database` 명령이 네이티브 파일 대화상자(`tauri-plugin-dialog`)로 `.duckdb`를 고르게 한 뒤 저장한다. 프론트는 Tauri 모드에서 runs 요청이 503이면 안내와 "데이터베이스 열기" 버튼을 보인다.
- [x] `frontend/src/api.ts`: 함수 이름·반환 타입은 그대로. 전송은 `isTauri()`(`@tauri-apps/api/core`)면 `invoke`, 아니면 `fetch("/api/…")`. `ApiError(status, message)` 유지.
- [x] `frontend/package.json`: `tauri` 스크립트, `@tauri-apps/cli`·`@tauri-apps/api`·`@tauri-apps/plugin-dialog`. `vite.config.ts`는 `src-tauri` 감시 제외. `playwright.config.ts` webServer는 `cargo run -p constellation-serve -- --db ../data/constellation.duckdb`.
- [x] `src-tauri/tauri.conf.json`: `productName` "Constellation", `identifier` `io.github.nedian0brien.constellation`, `build.devUrl` `http://localhost:5173`, `frontendDist` `../frontend/dist`, `beforeDevCommand`/`beforeBuildCommand`는 npm. 아이콘은 `AppShell`의 브랜드 SVG로 만든 1024px PNG에서 `tauri icon`으로 생성한다.
- [x] Python: `backend/constellation/api/`, `backend/constellation/db/queries.py`, `backend/tests/test_api.py`, `backend/tests/test_queries.py`, `cli.py`의 `serve`, `pyproject.toml`의 `api` extra를 지운다. `test_config.py`와 파이프라인은 그대로 통과한다.
- [x] 테스트: `crates/constellation-core/tests/queries.rs`가 `backend/constellation/db/schema.sql`(`include_str!`)로 임시 DB를 만들고 Python 테스트와 같은 표본으로 목록·일치·run 격리·정렬·페이지·연도 미상·잘못된 입력·상세 범위를 검사한다. `cargo test --workspace` 통과.
- [x] 동등성: 실데이터에서 Python API와 Rust 서버의 응답을 11개 엔드포인트 × 대표 인자로 비교하는 스크립트(`scripts/compare-api.py`)가 차이 0을 보고한다. 부동소수는 1e-9 허용.
- [x] `npm run tauri build -- --bundles app`이 `.app`을 만들고 더블클릭으로 실행돼 실데이터 지도가 뜬다. 결과물 경로와 서명 상태를 QA 문서에 적는다.
- [x] Playwright 9개가 Rust 서버 위에서 통과한다. README·ARCHITECTURE·`.claude/launch.json` 갱신.

## 설계

- `constellation-core`: `duckdb = { version = "~1.10505", features = ["bundled"] }`, `serde`, `thiserror`. `Database`는 경로만 들고 질의마다 `Connection::open_with_flags(read_only)`를 연다(Python과 같은 패턴 — 파이프라인이 쓰는 동안 잠금을 만나면 503). 질의는 SQL을 그대로 옮기고 후처리(열 단위 map, lineage BFS, tree levels)는 Rust로 쓴다.
- `constellation-serve`: axum 0.8 + tokio + tower-http(cors). 핸들러는 쿼리 구조체를 core 타입으로 바꿔 부른다. 검증 실패는 422.
- `src-tauri`: `tauri 2.11`, `tauri-plugin-dialog`. `AppState { db_path: Mutex<PathBuf> }`. 설정 파일은 `serde_json`으로 직접 읽고 쓴다(플러그인 없이).
- 프론트: `api.ts`에 `call<T>(command, path, args)` 하나를 두고 각 `fetchX`가 그것을 부른다. `AppShell`의 runs 오류 분기에 Tauri 전용 버튼을 붙인다(`isTauri()`).
- 아이콘: 브랜드 SVG를 `qlmanage -t -s 1024`로 PNG로 만들고 `npx tauri icon`.

## 버린 대안

- FastAPI를 PyInstaller 사이드카로: intent에서 사용자가 버렸다.
- Tauri 명령 대신 앱 안에서 axum을 띄우고 `fetch` 유지: 포트 충돌·프로세스 관리가 생기고 IPC가 더 단순하다.
- 커스텀 URI 스킴(`app://api/...`)으로 `fetch`를 그대로 두기: 요청·응답 직렬화를 손으로 해야 하고 Tauri 명령이 같은 일을 해 준다.
- `search` 이식: 프론트가 쓰지 않는다.

## 함정

- DuckDB `bundled`는 첫 컴파일이 오래 걸린다. `cargo build`를 먼저 돌려 두고 나머지를 작업한다.
- Python `contains(lower(w.title), ?)`·`NULLS LAST`·`coalesce`는 DuckDB SQL이라 Rust에서도 그대로 쓴다. `IN (?, ?, …)`는 자리표시자를 개수만큼 만든다.
- `works`의 `has_abstract`는 BOOLEAN, `year`는 INTEGER NULL. duckdb-rs에서 `Option<i32>`·`bool`로 받는다. `x, y, z`는 DOUBLE(z NULL 가능).
- Tauri 명령은 AbortSignal이 없다. React Query 키가 run·조건을 포함하므로 늦은 응답이 화면을 덮지 않는다(기존 설계). E2E "늦은 응답" 시나리오는 HTTP 서버에서만 돈다.
- 앱 데이터 폴더에 DB가 없으면 첫 실행은 빈 상태다. 실데이터는 `data/constellation.duckdb`를 "데이터베이스 열기"로 고른다.
- Vite 개발 서버의 `/api` 프록시는 Rust 서버(8000)를 가리킨다. `tauri dev`에서는 프록시를 쓰지 않는다(`invoke`).

## 완료 기준

```sh
cargo test --workspace
cargo run -p constellation-serve -- --db data/constellation.duckdb   # 별도 터미널
python3 scripts/compare-api.py                                        # Python 서버 8001 vs Rust 8000, 차이 0
cd frontend && npm run test -- --run && npm run build && npm run lint && npm run test:e2e
npm run tauri build -- --bundles app                                  # .app 생성, 실행 확인
```

구현·검증 완료: 2026-09-17. 결과와 확인하지 못한 것은 `docs/DESKTOP-APP-QA.md`.
