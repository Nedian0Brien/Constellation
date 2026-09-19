# 데스크톱 앱 검증 — 2026-09-17

## 결과

Python 서빙 계층(FastAPI)을 Rust 질의 계층(`constellation-core`)으로 옮기고 Tauri 2 앱으로 묶었다. 실데이터(논문 10,604편·투영 run 4개)에서 앱 창이 지도·목록·인스펙터를 그린다. 실행 시점에 Python·Node·터미널이 필요 없다.

| 검사 | 결과 |
|---|---|
| `cargo test --workspace` | core 9개 + 앱 명령 1개 통과 |
| `scripts/compare-api.py` (Python 8001 vs Rust 8002) | 32/32 일치. FastAPI의 프레임워크 검증 422 본문(pydantic 목록) 2건만 상태로 비교 |
| Vitest / build / lint | 11개 통과 / 성공 / 종료 코드 0 |
| Playwright E2E (Rust 서버 위) | 9개 통과, 23.0초 |
| `tauri build --bundles app` | `target/release/bundle/macos/Constellation.app`, 50 MB, `Signature=adhoc` (linker-signed) |
| Python `unittest` | 남은 1개(config) 통과 |

## 실행 환경

- macOS 27.0 (arm64), Rust 1.97.0, Node 26.5.0, Tauri CLI 2.11.4 / crate 2.11.5, duckdb-rs 1.10505.0 (DuckDB 1.5.5), Python duckdb 1.5.5.
- 첫 `cargo build`(DuckDB 소스 컴파일) 1분 9초, 앱 릴리스 빌드 1분 51초.

## 앱에서 확인한 것

1. `tauri dev` 첫 실행: DB가 없어 "데이터를 불러오지 못했습니다 — 로컬 논문 데이터가 없습니다" 안내와 찾는 경로(`~/Library/Application Support/io.github.nedian0brien.constellation/constellation.duckdb`), **데이터베이스 열기** 버튼이 보인다.
2. `settings.json`에 실데이터 경로를 넣고 재실행: 지도가 10,604편·45개 주제로 뜬다(`invoke` 경로, HTTP 서버 없음).
3. 릴리스 `.app`을 `open`으로 실행: 같은 화면. 헤더의 **논문 목록** 버튼으로 목록 카드(1/425)가 열린다.
4. 명령 인자 모양(`filter` 객체, `pageSize`, `clusterId`)과 오류 모양(`{status, message}`)은 `src-tauri/tests/commands.rs`가 MockRuntime으로 검사한다.

## 확인하지 못한 것

- 앱 창 안에서 목록 행 클릭·주제 선택 같은 세부 조작. 배경 자동화 도구가 WebView에 원시 클릭을 넣지 못했다. 같은 프론트 코드는 브라우저 E2E 9개로 확인했고, 앱에서는 헤더 버튼 클릭까지만 확인했다.
- 파일 대화상자로 실제 파일을 고르는 흐름. 자동화가 네이티브 대화상자에 닿지 않아 설정 파일을 직접 써서 같은 결과를 확인했다.
- 다른 Mac·Windows 빌드, Gatekeeper 경고. ad-hoc 서명이라 다른 Mac으로 옮기면 우클릭 → 열기가 필요할 수 있다.

## 구현 중 고친 것

- `[profile.release] strip = true, lto = "thin"`이 proc-macro 크레이트(`ctor`, `tauri-macros`)의 dylib를 깨뜨려 `E0463: can't find crate`가 났다. 프로필을 지우고 `target/release`를 비운 뒤 빌드했다.
- 2026-09-19: 프로필이 없어도 cargo 기본 release의 `strip = "debuginfo"`로 같은 E0463(`ctor-proc-macro`)이 났다. 워크스페이스 `Cargo.toml`에 `[profile.release] strip = "none"`을 두어 고쳤다. `target/release`를 비운 뒤 다시 빌드했다.
- Tauri CLI는 현재 폴더 아래에서 `src-tauri`를 찾는다. `src-tauri`가 루트에 있으므로 `npx --prefix frontend tauri …`를 루트에서 부른다. `beforeDevCommand`는 `frontend/`에서 도는 `npm run dev`다.
- Tauri의 `setup`은 `run()`에서야 돌아 테스트에서 상태가 없었다. 경로를 아는 경우 빌드 시점에 `manage`한다.
- 실행 중인 `.workspace-stage`가 `width: 100%`라 인스펙터를 밀어내던 문제와 같은 이유로, 오류 안내(`.stage-notice`)는 CSS 클래스로 가운데 둔다.

## 재현

```sh
cargo test --workspace
cargo run -p constellation-serve -- --db data/constellation.duckdb
cd frontend && npm run test -- --run && npm run build && npm run lint && npm run test:e2e
cd .. && npx --prefix frontend tauri build --bundles app && open target/release/bundle/macos/Constellation.app
```
