---
title: 분석 DB 하나에 코퍼스와 지도를 여러 개 둔다
slug: corpus-model
stage: spec
date: 2026-09-30
---

# 분석 DB 하나에 코퍼스와 지도를 여러 개 둔다 — spec

## 요구사항

1. 스키마(`backend/constellation/db/schema.sql`)에 다음을 더한다. 기존 DB에는 `ADD COLUMN IF NOT EXISTS`로 적용한다.
   - `corpora(id TEXT PK, name TEXT NOT NULL, definition_json TEXT, created_at TIMESTAMP NOT NULL)`
   - `corpus_works(corpus_id, work_id, via TEXT NOT NULL, added_at TIMESTAMP NOT NULL, PK(corpus_id, work_id))`. `via`는 `collect | backfill | import | adopt`다.
   - `runs.corpus_id TEXT`, `runs.name TEXT`
   - `collections.corpus_id TEXT`
2. 코퍼스 id는 ASCII kebab-case다(`rag-ir`, `physical-ai`). 표시 이름은 `name`이다.
3. 파이프라인 명령의 대상 지정
   - `collect --set S [--corpus C]`: C를 생략하면 S와 같은 id를 쓴다. 코퍼스가 없으면 만든다(이름은 세트 id, 수집 정의는 세트 내용). 수집한 논문은 `via='collect'`로 소속시킨다.
   - `backfill --corpus C`: 후보는 C 소속 논문이 2회 이상 인용했지만 C에 속하지 않은 논문이다. 이미 `works`에 있는 후보는 가져오지 않고 소속만 더한다. 없는 후보만 OpenAlex에서 가져온다. 둘 다 `via='backfill'`이다.
   - `enrich --corpus C`, `stats --corpus C`, `evaluate --corpus C`: C 소속 논문만 대상이다.
   - `embed`: 전과 같이 `works` 전체를 임베딩한다. 캐시가 코퍼스 사이에서 공유된다.
   - `project --corpus C -m M`: C 소속 논문만 투영한다. 새 run에 `corpus_id=C`를 기록하고, 이름은 `"<코퍼스 이름> · <모델>"`로 채운다.
   - `cluster | hierarchy | name | flow | lineage`: `--map RUN`으로 대상 지도를 받는다. 생략하면 `--corpus C`와 `-m M`으로 그 코퍼스·모델의 최신 지도를 쓴다. 둘 다 생략하면 코퍼스가 하나일 때만 그 코퍼스를 쓰고, 여럿이면 코퍼스 목록을 출력하고 종료 코드 1로 끝난다.
4. 투영 모델 파일은 `data/models/<corpus>/<model>/`에 둔다.
5. 코퍼스 관리 명령 `constellation corpus`
   - `list`: id, 이름, 논문 수, 지도 수
   - `adopt --id C --name N`: 현재 DB에서 아직 어느 코퍼스에도 속하지 않은 논문과 `corpus_id`가 빈 run·수집 이력을 C에 배정한다. `data/models/<model>/`을 `data/models/C/<model>/`로 옮긴다.
   - `import PATH --id C --name N`: 다른 분석 DB와 그 옆의 `embeddings/`·`models/`를 현재 DB로 옮긴다. 원본은 읽기만 한다.
     - `works`: 같은 id가 있으면 초록이 있는 쪽을 남긴다.
     - `authors`·`work_authors`·`citations`·`work_topics`: 합집합.
     - 원본의 논문 전부를 `via='import'`로 C에 소속시킨다.
     - `runs`와 run_id 키 산출물(projections, clusters, cluster_meta, cluster_tree, tree_levels, flow_*, citation_spc, naming_audit)은 그대로 복사하고 `corpus_id=C`로 둔다. run_id가 이미 있으면 그 run은 건너뛰고 알린다.
     - `collections`는 `corpus_id=C`로 복사한다.
     - 임베딩 캐시: 원본 `index.parquet`·`vectors.npy`에서 현재 캐시에 없는 해시만 더한다. `works.parquet`는 합친 `works` 기준으로 다시 쓴다.
     - 모델 파일: 원본 `models/<model>/`을 `data/models/C/<model>/`로 복사한다.
   - `adopt`와 `import`는 다시 실행해도 결과가 같다.
6. Rust 질의 계층(`crates/constellation-core`)
   - `RunInfo`에 `corpus_id`, `corpus_name`, `name`, `analyzed`(해당 run의 `|cluster` run이 있는지)를 더한다.
   - `runs()` 정렬 순서: 코퍼스 이름 → 분석된 지도 먼저 → 기본 모델 먼저 → 최신순.
   - 논문 상세의 코퍼스 안 참고문헌·피인용 수와 인용 목록(`works.rs`)을 "현재 지도에 있는 논문"으로 좁힌다. 지금은 `works` 전체와 조인한다.
7. 앱 헤더 선택기가 지도 선택기가 된다.
   - 접근성 이름은 "지도"다.
   - 트리거는 선택한 지도의 `코퍼스 이름 · 모델`을 보여 준다.
   - 항목은 `코퍼스 이름 · 모델 · N편`이고, 분석 산출물이 없는 지도에는 "분석 없음"을 붙인다. 목록에는 모든 지도를 보여 준다(사용자 결정).
   - 코퍼스별 `SelectGroup`과 `SelectLabel`로 묶는다.
8. 코퍼스가 없는 기존 DB(이전 전)도 앱이 연다. `corpus_id`가 비면 코퍼스 이름 자리에 "코퍼스 미지정"을 쓴다.

## 설계

- **대상 해석은 한 곳에서 한다.** `backend/constellation/db/scope.py`를 새로 만든다.
  - `resolve_corpus(conn, corpus)`: 코퍼스 id를 확정한다.
  - `resolve_map(conn, map_id, corpus, model)`: 지도 run_id를 확정한다.
  - `corpus_work_ids(conn, corpus)`: 코퍼스 소속 논문 id 목록.
  - 각 분석 모듈에 흩어진 "최신 run" 질의 다섯 곳을 이 함수 호출로 바꾼다.
- **임베딩 행렬.** `load_matrix(model_key, work_ids=None)`에 논문 id 목록 인자를 더한다. `works.parquet`에서 그 id만 골라 행렬을 만든다. project와 evaluate가 코퍼스 소속 id를 넘긴다.
- **분석 단계의 인용 질의.** cluster·flow·lineage의 인용 질의는 이미 파이썬 쪽에서 run의 논문 id로 거른다(`lineage.py:64-70` 등). 그대로 둔다.
- **스키마 적용.** 스키마는 `store.connect()`가 매번 실행한다. `ALTER TABLE … ADD COLUMN IF NOT EXISTS`를 `schema.sql` 끝에 두면 기존 DB에도 자동으로 적용된다. Rust 쪽은 읽기 전용이다. 따라서 이전 전 DB처럼 컬럼이 없는 DB도 열 수 있도록, 질의 시작 시 컬럼 존재를 확인해 없으면 NULL을 쓴다.
- **Rust 지도 이름.** `runs.name`이 비어 있으면 Rust에서 `코퍼스 이름 · 모델`로 만든다.
- **실제 데이터 이전.** 개발과 검증은 `CONSTELLATION_DATA_DIR`로 `data/`의 복사본(스크래치)을 가리켜 한다. 실제 `data/`에는 사용자 확인 뒤 다음을 한 번 실행한다.
  1. `corpus adopt --id rag-ir --name "RAG/IR"`
  2. `corpus import data/physical-ai/constellation.duckdb --id physical-ai --name "Physical AI"`
  - 실행 전에 `data/constellation.duckdb`를 `constellation.duckdb.bak-20260930`으로 백업한다.

## 수용 기준

- 이전한 DB에서 두 코퍼스의 기존 지도 모두 `/api/map`, `/api/clusters`, `/api/tree`, `/api/flow`, `/api/lineage` 응답이 이전 전 각 DB의 응답과 같다(JSON 비교).
- 허용하는 차이는 두 가지다.
  - 두 DB에 같이 있는 논문의 `works` 필드(초록 보유 여부 등)가 서로 달랐던 경우. `import`가 초록이 있는 쪽을 남기기 때문이다. 차이 난 논문 수를 기록한다.
  - 인용 목록·개수가 "현재 지도 안"으로 좁혀지는 변화. 이전 전에는 DB와 지도가 1:1이었으므로 이 변화는 나타나지 않아야 한다.
- 헤더 선택기로 RAG/IR와 Physical AI 지도를 오간다. 브라우저 모드와 데스크톱 앱 모두 같다.
- `adopt`·`import`를 두 번 실행해도 행 수가 같다.
- 스크래치 DB에서 `project --corpus physical-ai`가 physical-ai 소속 논문 수만큼만 투영한다. 모델 파일은 `models/physical-ai/scincl/`에서 읽는다.
- 기존 E2E와 백엔드 단위 테스트가 통과한다. E2E의 선택기 이름은 "지도"로 바꾼다.

## 열린 질문

없음.
