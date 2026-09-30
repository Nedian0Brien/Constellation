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

계획과 달라진 점:
- `import`의 `works` 병합 규칙을 "초록이 있는 쪽, 같으면 나중에 수집한 쪽"으로 바꿨다(spec 갱신). 처음 규칙은 두 DB에 같이 있는 107편에서 RAG/IR의 8월 값이 남아 Physical AI 지도의 피인용 수와 제목 2건이 달라졌다.
- 클러스터 목록과 대표 논문 정렬에 id를 두 번째 기준으로 더했다. 크기가 같은 클러스터의 순서가 DB마다 달라 비교가 흔들렸다.
- run을 지정하지 않을 때 여는 기본 지도는 `runs()`의 첫 항목(분석된 기본 모델의 최신 지도)이다. 이전한 DB에서는 Physical AI 지도다. E2E는 RAG/IR 코퍼스를 전제로 하므로 RAG/IR 지도를 URL로 명시해 연다. 선택기 이름 "지도"가 "지도 색상"과 부분 일치해 `exact: true`를 붙였다.

결과(스크래치 복사본 기준):
- `corpus adopt` → `import`: RAG/IR 10,604편·run 8개·투영 모델 4개, Physical AI 새 논문 16,447편·기존 논문 갱신 107편·run 6개·임베딩 16,380개. 두 번째 실행에서 모든 테이블 행 수가 같다.
- 기준 응답 비교(지도 5개 × map·clusters·tree·flow·lineage·표본 논문 20편 상세·인용):
  - RAG/IR 지도: 차이는 공유 논문 107편의 `works` 값(피인용 수, 제목 1건 "(제목 없음)" → "Adam: …")뿐이다.
  - Physical AI 지도: 계보 응답의 노드 순서(집합·값·엣지는 같다), 저자 이름 1건(저자 테이블은 기존 값을 남긴다).
- `stats --corpus physical-ai`가 `docs/PHYSICAL-AI-RESULTS.md`의 값(16,554편, 초록 88.1%, 내부 인용 136,442개)과 같다.
- `project --corpus physical-ai`가 `models/physical-ai/scincl/`의 모델로 16,554편만 투영했다. 대상 없는 `hierarchy`는 코퍼스 목록을 출력하고 종료한다.
- 백엔드 단위 테스트 23개 통과, `cargo test -p constellation-core` 12개 통과, `npx tsc -b` 통과, `npm test` 56개 통과.
- E2E 13/13: 이전 전 실제 DB와 이전한 스크래치 DB 둘 다.
- 브라우저: 지도 선택기가 코퍼스별로 묶여 보이고, Physical AI ↔ RAG/IR 전환 시 지도·클러스터 목록이 바뀐다.
- 실제 `data/` 이전은 아직 하지 않았다(11단계, 사용자 확인 대기).
