---
title: 앱에서 새 논문 지도를 만든다
slug: new-map
stage: plan
status: accepted
spec: .intent/spec_new-map.md
date: 2026-10-06
---

# 앱에서 새 논문 지도를 만든다 — 계획

## 바뀌는 파일

새로 만드는 파일
- `backend/constellation/ingest/definition.py`: 정의 파싱·검증, terms·topics 필터
- `backend/constellation/ingest/seeds.py`: 시드 확장 수집
- `backend/constellation/pipeline.py`: `build(defn, emit)`, 이벤트 출력, 이름 짓기 대체 처리
- `backend/tests/test_definition.py`, `backend/tests/test_pipeline.py`
- `crates/constellation-jobs/{Cargo.toml,src/lib.rs,src/store.rs,src/process.rs,tests/runner.rs,tests/fake-pipeline.sh}`

고치는 파일
- `backend/constellation/config.py`: `CONSTELLATION_DB`
- `backend/constellation/db/schema.sql`: `corpora.status`
- `backend/constellation/db/store.py`: `ensure_corpus(status=…)`, `set_corpus_status`, `drop_corpus`
- `backend/constellation/ingest/collect.py`: 정의 객체 수용, progress 콜백
- `backend/constellation/sources/openalex.py`: `search(select=…)`, 토픽 검색
- `backend/constellation/embed/run.py`: `work_ids`, `works.parquet` 병합, progress
- `backend/constellation/cli.py`: `build`, `estimate`, `topics`, `corpus drop`
- `crates/constellation-core/src/db.rs`, `lib.rs`: `Gate`, 연결 래퍼
- `crates/constellation-core/src/queries/runs.rs`: `building` 제외, health
- `crates/constellation-core/tests/queries.rs`
- `crates/constellation-serve/{Cargo.toml,src/main.rs}`: 작업 라우트, CORS POST, 종료 처리
- `src-tauri/{Cargo.toml,src/lib.rs,src/commands.rs,src/settings.rs,tests/commands.rs}`: 작업 명령, `pipeline_path`, Exit 처리
- `Cargo.toml`: 워크스페이스 멤버
- `frontend/src/api.ts`: 작업 API 타입·함수
- `README.md`, `docs/ARCHITECTURE.md`

## 순서

1. **Python 정의와 수집.** `definition.py`, `openalex.py`의 `select` 인자와 토픽 검색, `seeds.py`, `collect.py`의 정의 수용과 progress를 만든다.
   - 확인: `test_definition.py`(검증 오류, 종류별 필터 문자열, 시드 확장을 가짜 소스로), 기존 `unittest` 통과.
2. **스키마와 정리.** `corpora.status`, `drop_corpus`, `corpus drop --id C --only-building`.
   - 확인: 테스트 DB에 코퍼스 둘을 만든다. building 코퍼스를 drop하면 공유 `works`는 남고 그 코퍼스의 소속·run·산출물·수집 이력은 사라진다. ready 코퍼스는 `--only-building`에서 거부된다.
3. **코퍼스 단위 임베딩.** `embed_corpus(work_ids=…)`와 `works.parquet` 병합.
   - 확인: 가짜 인코더로 두 코퍼스를 차례로 임베딩한다. `works.parquet`에 두 코퍼스 행이 모두 있다.
4. **파이프라인과 CLI.** `pipeline.build`, `build --definition --events`, `estimate --json`, `topics --json`, SIGTERM 처리기, `CONSTELLATION_DB`.
   - 확인: 단계 함수를 가짜로 바꾼 `test_pipeline.py`에서 이벤트 순서, name 실패 시 `naming=ctfidf`, 예외 시 `error` 이벤트와 종료 코드 1, 성공 시 `status=ready`를 본다.
   - 실제 키로 `estimate`(terms·topics·seeds)와 `topics --json "robot"`을 한 번씩 실행해 출력 모양을 본다.
5. **core Gate와 runs.** `Gate`, 연결 래퍼, `runs`의 building 제외, health.
   - 확인: `cargo test -p constellation-core`. 사유가 있으면 503이고, 연결을 들고 있는 동안 `wait_idle`이 기다린다.
6. **실행기 크레이트.** 상태 저장, 프로세스 실행, 이벤트 반영, 취소(`libc::kill` SIGTERM → 10초 → SIGKILL), 정리 명령, 시작 시 복구(pid 생존 확인), 409, 최근 20개 유지.
   - 확인: `cargo test -p constellation-jobs`. 가짜 파이프라인 셸 스크립트로 성공·실패·취소·복구·동시 제출을 검사한다.
7. **serve와 Tauri.** 라우트·명령을 붙이고, serve는 SIGINT·SIGTERM, Tauri는 `RunEvent::Exit`에서 실행 중 작업을 취소한다. serve에 `--pipeline`을 더한다.
   - 확인: `cargo test --workspace`. Tauri MockRuntime 테스트에 `jobs`·`estimate_map` 인자 모양을 더한다.
8. **프론트 API.** `api.ts`에 타입과 함수를 더한다.
   - 확인: `npm --prefix frontend run build`, `npm --prefix frontend test`.
9. **실데이터 검증.** `data/`를 스크래치로 복사하고, 그 복사본을 쓰는 serve(포트 8012)와 Vite로 spec 완료 기준을 실행한다.
   - terms 작업: 5년 × 300편
   - seeds 작업: 시드 3편, `limit` 1500
   - 실행 중 취소
   - 브라우저에서 새 지도의 다섯 뷰
10. **문서.** README의 "수집과 분석"에 `build`와 앱 작업 API, ARCHITECTURE에 실행기와 잠금을 적는다.

## 가장 위험한 단계

- **6–7의 잠금과 프로세스 수명.** 잠금이 풀리지 않으면 앱 조회가 계속 503이다. 그래서 사유는 작업 스레드의 drop 가드에서 내린다. 패닉이 나도 풀리게 하려는 것이다.
- 실데이터 검증은 복사본에서만 한다. 원본 `data/`는 건드리지 않는다.
- 되돌리기: 기능 전체가 새 API와 새 명령 뒤에 있다. 브랜치를 버리면 기존 동작으로 돌아간다. 스키마 변경은 `ADD COLUMN IF NOT EXISTS` 하나이고, NULL은 ready로 취급하므로 기존 DB와 호환된다.

## 검증 명령

```sh
PYTHONPATH=$PWD/backend ../../.venv/bin/python -m unittest discover -s backend/tests   # 워크트리. 저장소 venv는 원래 checkout을 설치본으로 쓴다
cargo test --workspace
npm --prefix frontend run build
npm --prefix frontend test
npm --prefix frontend run test:e2e
```

실데이터 검증은 9단계의 serve 위에서 `curl`로 작업을 제출하고 `GET /api/jobs/{id}`로 상태를 확인한다. 브라우저 확인은 Browser pane으로 한다.

## 검증 결과 (2026-10-06)

- Python `unittest` 39개, `cargo test --workspace` 25개(core 14, jobs 9, Tauri 2), vitest 56개, `npm run build` 통과. Playwright E2E 13/13(워크트리 serve, 실제 DB 조회 전용).
- 스크래치 데이터(`data/` 복사본) 위의 serve(8012)에서:
  - terms "Graph Neural Networks" 2020–2024 × 300편: 예상 1,500편 → 10단계 성공(3분 23초). backfill 후 3,047편, 클러스터 18개. 실행 중 `/api/map` 503, `/api/health` `ok:false`. 이 기계의 `~/.local/bin/codex`가 사라진 경로를 가리켜 이름 짓기를 건너뛰었다(`naming: ctfidf`). 이 결과로 codex → claude 순서와 PATH 보강을 더했다.
  - seeds(ResNet·AlexNet·AlphaGo DOI, `limit` 1500): 시드 3편 해석, 후보 3,971편 중 1,500편 → 2,911편, 클러스터 29개, claude로 이름 57개(`naming: llm`). 브라우저에서 다섯 뷰가 열린다.
  - backfill 중 취소: `cancelled`, 코퍼스·소속 1,992편·`models/cancel-test` 삭제, 남은 프로세스 없음.
  - serve 정상 종료(SIGTERM): 실행 중 작업이 `cancelled`로 끝나고 정리된다.
  - serve 강제 종료(SIGKILL) 뒤 재시작: 남은 파이프라인 프로세스를 끝내고 `failed`("앱이 종료되어 중단됨")로 바꾼 뒤 코퍼스를 지운다.
  - 수준을 섞은 topics 정의는 422, 토픽 검색은 `/topics` 결과를 경로와 함께 돌려준다.
- 남은 한계: 작업 중 열려 있던 화면은 작업이 끝난 뒤 새로고침해야 갱신된다. 작업 진행 표시와 조회 재시도는 3번 intent(사이드바 개편) 화면에서 다룬다.
