---
title: Constellation을 Tauri 데스크톱 앱으로
slug: desktop-app
stage: plan
status: accepted
intent: .intent/intent_desktop-app.md
spec: .intent/spec_desktop-app.md
date: 2026-09-17
---

# Constellation을 Tauri 데스크톱 앱으로 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `Cargo.toml`(신규, 루트), `.gitignore` | 워크스페이스, `target/` 제외 |
| `crates/constellation-core/{Cargo.toml,src/lib.rs,src/error.rs,src/db.rs,src/queries/*.rs,tests/queries.rs}`(신규) | 질의 계층과 테스트 |
| `crates/constellation-serve/{Cargo.toml,src/main.rs}`(신규) | axum 개발 서버 |
| `src-tauri/{Cargo.toml,build.rs,tauri.conf.json,capabilities/default.json,icons/*,src/main.rs,src/lib.rs,src/commands.rs,src/settings.rs}`(신규) | Tauri 앱 |
| `frontend/src/api.ts` | 전송 계층 `call()` — invoke / fetch |
| `frontend/src/components/AppShell.tsx` | Tauri 모드의 DB 없음 안내와 "데이터베이스 열기" |
| `frontend/package.json`, `package-lock.json`, `vite.config.ts`, `playwright.config.ts` | Tauri 의존·스크립트, 감시 제외, E2E 서버 명령 |
| `scripts/compare-api.py`(신규) | Python vs Rust 응답 대조 |
| `backend/constellation/api/`, `backend/constellation/db/queries.py`, `backend/tests/{test_api,test_queries}.py`(삭제), `backend/constellation/cli.py`, `pyproject.toml` | 서빙 계층 제거 |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/DESKTOP-APP-QA.md`(신규), `.claude/launch.json` | 실행 방법·검증 기록 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. **워크스페이스와 core 뼈대** — `Cargo.toml`, `constellation-core`에 `Database`·`Error`·`runs`·`health`. `cargo build`로 DuckDB 컴파일을 시작해 둔다. 테스트 하네스(임시 DB + schema.sql)까지.
2. **질의 이식** — `map`·`clusters`·`tree`·`flow`·`flow_papers`·`cluster_detail`·`work` → `works`·`matches`(필터 검증) → `lineage`(BFS). 엔드포인트마다 테스트 하나 이상. `cargo test`.
3. **개발 서버** — `constellation-serve`. 실데이터로 띄우고 `curl`로 11개 확인. `scripts/compare-api.py`로 Python(8001)과 대조해 차이 0.
4. **프론트 전송 계층** — `api.ts`의 `call()`. Vite 프록시를 Rust 서버로 두고 브라우저에서 다섯 화면 확인. Playwright webServer를 Rust 서버로 바꿔 9개 통과.
5. **Tauri 앱** — `npx tauri init`, 명령·상태·설정·dialog, 아이콘. `npm run tauri dev`로 실데이터 열기 확인(데이터베이스 열기 → `data/constellation.duckdb`). `AppShell` 안내 버튼.
6. **Python 정리** — api 패키지·queries·테스트·serve·extra 삭제. `unittest` 통과.
7. **빌드·문서** — `tauri build --bundles app`, 결과물 실행, QA 문서, README·ARCHITECTURE·launch.json. 커밋은 1·2·3·4·5·6·7 단위.

## 가장 위험한 단계

2단계의 동등성. SQL은 그대로지만 NULL 처리(`year`·`cited_by_count`·`z`)와 정렬 동률, `lineage`의 BFS 순서가 Python과 어긋나면 화면이 미세하게 달라진다. 3단계의 대조 스크립트가 이를 잡는다. 깨지면 Rust 쪽을 고친다 — Python은 기준이고 바꾸지 않는다. 5단계의 첫 `tauri build`는 DuckDB 정적 링크가 실패할 수 있다. 실패하면 `libduckdb-sys`의 프리빌트 dylib를 `bundle.macOS.frameworks`로 싣는 길로 바꾸고 plan을 고친다.

## 검증

```sh
cargo test --workspace
cargo run -p constellation-serve -- --db data/constellation.duckdb
python3 scripts/compare-api.py
cd frontend && npm run test -- --run && npm run build && npm run lint && npm run test:e2e
npm run tauri build -- --bundles app && open src-tauri/target/release/bundle/macos/Constellation.app
```

앱: 첫 실행 빈 상태 → 데이터베이스 열기 → 지도 → 목록 → 논문 → 계층·갈래·계보·3D → 종료 후 재실행 시 같은 DB로 바로 열림.

## 구현 중 계획에서 더한 것 — 2026-09-17

- 루트 `Cargo.toml`의 `[profile.release] strip/lto`를 지웠다. proc-macro dylib가 깨져 `E0463`이 났다.
- `src-tauri/tests/commands.rs`를 더했다. MockRuntime으로 프론트의 인자 모양을 검사한다. 이를 위해 `lib.rs`에 `configure(builder, db_path)`를 두고 경로를 알면 빌드 시점에 상태를 `manage`한다.
- `tauri` 명령은 루트에서 `npx --prefix frontend tauri …`로 부른다. Tauri CLI가 현재 폴더 아래에서 `src-tauri`를 찾기 때문이다.
- `frontend/src/index.css`에 `.stage-notice`를 더했다. 오류 안내와 데이터베이스 열기 버튼을 가운데 모은다.
- 결과물 `.app`은 `/Applications/Constellation.app`으로 복사해 설치한다(사용자 요청 "로컬 앱으로 설치").
