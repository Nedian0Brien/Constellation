---
title: 분석 DB 하나에 코퍼스와 지도를 여러 개 둔다
slug: corpus-model
stage: plan
date: 2026-09-30
---

# 분석 DB 하나에 코퍼스와 지도를 여러 개 둔다 — plan

## 순서

1. **기준 응답 채취**: 이전 전 두 DB(`data/constellation.duckdb`, `data/physical-ai/constellation.duckdb`)를 `constellation-serve`로 띄워 각 지도의 응답을 스크래치에 JSON으로 저장한다.
   - 대상 API: `/api/runs`, `/api/map`, `/api/clusters`, `/api/tree`, `/api/flow`, `/api/lineage`, 표본 논문 20편의 `/api/works/{id}`와 `/api/citations`
2. **스키마와 대상 해석**
   - `db/schema.sql`: `corpora`, `corpus_works`, 컬럼 추가
   - `db/store.py`: `add_members(conn, corpus, ids, via)`, `ensure_corpus(conn, id, name, definition)`
   - `db/scope.py`: `resolve_corpus`, `resolve_map`, `corpus_work_ids`
3. **수집 단계**: `ingest/collect.py`의 `collect`·`backfill_citations`·`enrich_abstracts`와 `store.stats`가 코퍼스를 받는다.
4. **임베딩·투영**
   - `analyze/evaluate.load_matrix(model_key, work_ids=None)`
   - `analyze/project.py`: `--corpus`를 받고, 모델 경로를 `models/<corpus>/<model>/`로, run에 `corpus_id`와 `name`을 기록한다.
5. **분석 단계**: `cluster`·`hierarchy`·`naming`·`flow`·`lineage`의 "최신 run" 질의를 `resolve_map`으로 바꾼다. 하류 run(`|cluster` 등)에도 `corpus_id`를 기록한다.
6. **CLI**
   - `cli.py`: 각 명령에 `--corpus`·`--map`을 더한다.
   - 새 명령 `corpus list | adopt | import`. 이전 로직은 `db/migrate.py`에 둔다.
7. **Rust**
   - `queries/runs.rs`: `RunInfo` 필드 추가, 정렬, 컬럼 유무 확인
   - `queries/works.rs`: 인용 개수·목록을 현재 지도로 좁힌다.
   - `queries/map.rs`: 기본 지도 선택을 `runs()`의 첫 항목과 맞춘다.
8. **프런트**
   - `api.ts`의 `RunInfo`
   - `AppShell.tsx`의 지도 선택기
   - `e2e/exploration.spec.ts`의 선택기 이름
9. **테스트**: `backend/tests/test_corpus.py`에서 작은 DuckDB 두 개로 `adopt`, `import`(두 번 실행해도 같음), `resolve_map` 오류 경로, `backfill` 후보 계산을 검사한다.
10. **검증**
    - 스크래치 복사본에 `adopt` → `import`를 실행한다.
    - 1의 기준 응답과 비교한다.
    - `cargo test`, `npx tsc -b`, `npm test`, E2E, 백엔드 단위 테스트를 돌린다.
    - 브라우저에서 지도를 전환해 확인한다.
11. **실제 `data/` 이전**: 사용자 확인 뒤 한 번 실행한다. 전에 `data/constellation.duckdb`를 `constellation.duckdb.bak-20260930`으로 백업한다. 이전 뒤 앱을 다시 빌드·설치할지 묻는다.

## 검증

(구현 후 채운다)
