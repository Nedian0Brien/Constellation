---
title: 외부 출처에서 논문을 찾아 지도에 추가한다
slug: add-papers
stage: plan
status: accepted
spec: .intent/spec_add-papers.md
date: 2026-10-07
---

# 외부 출처에서 논문을 찾아 지도에 추가한다 — 계획

## 바뀌는 파일

새로 만드는 파일
- `backend/constellation/ingest/identify.py`: 식별자 판별, arXiv 해석, 외부 검색
- `backend/constellation/analyze/place.py`: transform, kNN 배정, 빼기
- `backend/tests/test_papers.py`

고치는 파일
- `backend/constellation/sources/openalex.py`: 단건 조회 `get_work`, `search=` 검색
- `backend/constellation/sources/semanticscholar.py`: arXiv 단건 조회
- `backend/constellation/ingest/collect.py`: `enrich_abstracts(work_ids=…)`
- `backend/constellation/pipeline.py`: `Stages` 도우미, `add_papers`, `remove_papers`, `search_papers`
- `backend/constellation/cli.py`: `papers search|add|remove`
- `crates/constellation-core/src/queries/{map,works,mod}.rs`, `tests/queries.rs`: `added`, `membership`
- `crates/constellation-jobs/src/{lib,job}.rs`, `tests/{runner.rs,fake-pipeline.sh}`: kind·result, add/remove/search
- `crates/constellation-serve/src/main.rs`, `src-tauri/src/{lib,commands}.rs`, `src-tauri/tests/commands.rs`
- `frontend/src/api.ts`
- `README.md`, `docs/ARCHITECTURE.md`

## 순서

1. **식별자와 검색(Python).** `identify.py`, OpenAlex 단건·검색, S2 arXiv 조회, `papers search --json`.
   - 확인: 식별자 판별 표 테스트, arXiv 해석 세 경로(MAG 일치, 제목 검색, 실패)를 가짜 소스로 검사.
   - 실제 키로 `papers search "retrieval augmented generation"`과 `papers search 2005.11401`을 실행해 W3098425262가 나오는지 본다.
2. **배치(Python).** `place.py`, `enrich_abstracts(work_ids)`, `pipeline.add_papers/remove_papers`, `papers add|remove --events|--check`.
   - 확인: 작은 테스트 DB와 가짜 인코더·투영 모델(실제 PCA·UMAP를 작은 행렬로 학습해 pickle)로 테스트한다.
     - 기존 행 불변
     - 배정 규칙(미분류 과반, 동률)
     - `cluster_meta.size` 재계산
     - 빼기에서 수집 논문 거부와 다른 지도 소속 유지
     - place 전 실패 시 변화 없음
3. **core.** `MapData.added`, `PaperFilter.added`, `Work.added_at`, `membership(db, run, ids)`.
   - 확인: `cargo test -p constellation-core`.
4. **실행기.** `Job.kind`(serde 기본 build)·`result`, `done` 이벤트의 `result` 반영, `submit_job`, `add`/`remove`/`search` 메서드. 정리 명령은 build만 한다.
   - 확인: 가짜 스크립트에 `papers` 분기를 더해 add 성공·실패, 예전 jobs 파일 읽기를 검사한다.
5. **serve·Tauri·api.ts.** 라우트·명령·클라이언트 함수.
   - 확인: `cargo test --workspace`, `npm --prefix frontend run build`, `npm --prefix frontend test`.
6. **실데이터 검증.** `data/` 복사본의 serve(8012)와 Vite(5178)로 spec 완료 기준을 확인한다. 기존 점 좌표·클러스터 비교는 추가 전후 `/api/map` JSON을 비교한다.
7. **문서.** README "지도에 논문 추가", ARCHITECTURE 절.

## 가장 위험한 단계

- **2의 배치 쓰기.** 기존 지도 행을 건드리면 되돌릴 수 없다.
  - `place`는 `INSERT`만 하고, 새 논문 id로 범위를 좁힌 `DELETE`(빼기)만 허용한다.
  - 테스트로 기존 행 해시를 비교하고, 실데이터는 복사본에서만 다룬다.
- 되돌리기: 추가한 논문은 `papers remove`로 뺀다. 스키마 변경은 없다.

## 검증 명령

```sh
PYTHONPATH=$PWD/backend ../../.venv/bin/python -m unittest discover -s backend/tests
cargo test --workspace
npm --prefix frontend run build
npm --prefix frontend test
E2E_PORT=5181 npm --prefix frontend run test:e2e   # 워크트리 serve를 8000에 띄운 뒤
```
