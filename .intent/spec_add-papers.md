---
title: 외부 출처에서 논문을 찾아 지도에 추가한다
slug: add-papers
stage: spec
status: accepted
intent: .intent/intent_add-papers.md
date: 2026-10-07
---

# 외부 출처에서 논문을 찾아 지도에 추가한다 — 명세

## 요구사항

1. **외부 검색** `search(q, page, run?)`
   - `q`가 식별자면 그 논문 하나를 찾는다. 식별자는 DOI(`10.…`, `doi:`, `https://doi.org/…`), arXiv ID(`2005.11401`, `arXiv:…`, `arxiv.org/abs/…`), OpenAlex ID(`W123`, `https://openalex.org/W123`)다.
   - 그 밖의 `q`는 OpenAlex `search=`로 찾는다. 페이지당 25편, `page`는 1–40이다.
   - 결과 항목: `{id, title, year, authors(최대 5명), venue, cited_by_count, doi, has_abstract, in_map, added}`
     - `id`는 `openalex:W…` 형식이다.
     - `in_map`은 `run`의 지도에 이미 있는지다. `run`이 없거나 작업 중이면 null이다.
     - `added`는 추가한 논문인지다.
   - 응답: `{query, kind(search|doi|arxiv|openalex), total, page, items}`. 식별자를 찾지 못하면 `items`는 빈 목록이다.
2. **arXiv 해석.** OpenAlex의 arXiv DOI(`10.48550/arxiv.*`) 기록은 다른 논문으로 덮인 경우가 있다(2026-10-06 실측: `2005.11401` → W3027879771 "Affordance-Compiled Intelligence…"). 그래서 다음 순서로 찾는다.
   1. Semantic Scholar `/paper/arXiv:{id}`로 제목·연도·외부 ID를 받는다.
   2. 외부 ID의 DOI, 없으면 MAG(→ `W{MAG}`)로 OpenAlex를 단건 조회하고, 정규화한 제목이 같을 때만 쓴다.
   3. 아니면 OpenAlex `title.search`에서 정규화 제목이 같고 연도 차이가 1 이하인 기록 가운데 피인용 수가 가장 큰 것을 쓴다.
   4. 그래도 없으면 찾지 못한 것으로 둔다.
3. **추가 작업** `add_papers(run, ids)`. `ids`는 1–200개이고, 검색 결과의 `id` 또는 1의 식별자다.
   - 작업 실행기에서 `kind = "add"`로 돈다. 단계는 `resolve → fetch → enrich → embed → place`다.
   - 대상 지도는 `run`이다. 지도의 코퍼스·모델·투영 모델 파일(`models/<코퍼스>/<모델>/{pca,umap2,umap3}.pkl`)이 있어야 하고, 없으면 제출 시 422다.
   - 이미 그 지도에 있는 논문은 건너뛰고 결과에 `skipped`로 남긴다.
   - 새 논문은 fetch 단계에서 `works`에 넣는다. 다른 코퍼스가 이미 받은 논문이면 다시 받지 않는다. 코퍼스 소속(`corpus_works`, `via='manual'`)은 place 단계에서 쓴다.
   - 초록이 없으면 Semantic Scholar로 메운다. 기존 `enrich_abstracts`를 논문 id 목록으로도 부를 수 있게 한다. 그래도 없으면 제목만으로 임베딩하고 결과에 `title_only: true`를 남긴다.
   - **좌표.** 지도의 모델로 임베딩하고, 저장된 PCA → UMAP 2D·3D `transform`으로 `projections`에 넣는다.
   - **클러스터.** 지도 안 기존 논문과의 코사인 유사도 상위 k=15편을 이웃으로 잡는다.
     - 이웃 가운데 미분류(-1)가 절반을 넘으면 -1로 둔다.
     - 아니면 미분류가 아닌 이웃의 다수결로 정하고, 같으면 유사도 합이 큰 쪽으로 정한다.
     - `clusters.probability`는 같은 클러스터 이웃의 비율이다.
   - `cluster_meta.size`를 `clusters` 기준으로 다시 센다. 라벨·키워드·중심은 바꾸지 않는다.
   - 결과 `result`: `{map_id, added:[{id,title,cluster,label,title_only}], skipped:[{id,reason}], not_found:[입력], recompute_suggested}`. `recompute_suggested`는 그 지도의 추가 논문 수가 수집 논문 수의 10%를 넘는지다.
4. **빼기** `remove_papers(run, ids)`. `via='manual'`인 논문만 지도에서 뺀다.
   - 지우는 것: 그 지도의 `projections`·`clusters` 행. `cluster_meta.size`는 다시 센다.
   - 같은 코퍼스의 다른 지도에도 없으면 `corpus_works` 소속도 지운다. `works`는 남긴다.
   - 수집으로 들어온 논문이 섞여 있으면 422다.
   - 작업 실행기에서 `kind = "remove"`로 돈다.
5. **추가한 논문 표시**(core 질의). 지도의 코퍼스에서 `via='manual'`인 논문을 "추가한 논문"으로 본다.
   - `MapData.added: bool[]`
   - `PaperFilter.added: Option<bool>`. 목록·일치 질의가 이 조건으로 거른다.
   - `Work.added_at: Option<String>`
6. **작업 상태 확장.** `Job`에 `kind`(build|add|remove)와 `result`(JSON)를 더한다. 기존 `jobs/*.json`(kind 없음)은 build로 읽는다. 제출한 요청은 지금처럼 `definition` 필드에 남긴다.
7. **두 실행 환경.**
   - serve: `GET /api/papers/search?q=&page=&run=`, `POST /api/maps/{run}/papers`(`{ids}`), `POST /api/maps/{run}/papers/remove`(`{ids}`).
   - Tauri: `search_papers`, `add_papers`, `remove_papers`.
   - `api.ts`에 같은 이름의 클라이언트 함수를 더한다.

## 설계

- **OpenAlex·S2 호출은 Python.** 1번과 같은 이유다. `pipeline.search_papers()`와 CLI `constellation papers search QUERY --page N --json`을 둔다. `in_map`·`added`는 Rust가 결과 id로 core 질의(`queries::membership(db, run, ids)`)를 해서 채운다. Python이 DB를 열지 않으므로 작업 중에도 검색할 수 있다(그때 표시는 null).
- **추가·빼기 명령.** `constellation papers add --map RUN -i FILE --events`, `constellation papers remove --map RUN -i FILE --events`. `--check`는 지도와 투영 모델 파일 존재, 입력 형식을 확인한다. 입력 파일은 `{"ids": [...]}`다. 빼기의 수집 논문 검사는 실행 단계에서 하고 422 대신 오류 이벤트로 실패한다.
- **재사용.**
  - `OpenAlexSource.fetch_by_ids`, `to_work`, `store.upsert_works`·`add_members`, `enrich_abstracts`, `embed_corpus(work_ids=…)`, `load_matrix`, `project._paths`
  - 이벤트 형식과 `pipeline.build`의 `stage()` 도우미. 공통 부분을 `pipeline.Stages`로 뽑는다.
- **배치 모듈.** `analyze/place.py`.
  - `place(run_id, work_ids, k=15)`: transform과 kNN 배정
  - `remove(run_id, work_ids)`
  - 이웃 계산은 지도 논문 행렬(정규화 벡터)과의 내적이다. 1만 편 × 768차원은 메모리에 올려 한 번에 계산한다.
- **실행기 일반화.** `Runner::submit(definition)`을 `submit_job(kind, args, payload)` 위의 build 전용 함수로 둔다. 단계 수는 `stage` 이벤트의 `count`를 그대로 쓴다.
- **실패해도 정리할 것이 없게 쓴다.** add는 소속·`projections`·`clusters`·`cluster_meta.size`를 마지막 place 단계에서 한 트랜잭션으로 쓴다. 그 전에 실패하거나 취소되면 남는 것은 어느 지도에도 보이지 않는 `works` 행과 임베딩 캐시뿐이고, 둘 다 다른 코퍼스와 공유하는 자료라 지우지 않는다. 그래서 실패 정리(`corpus drop`)는 build에만 둔다. remove도 한 트랜잭션이다.

## 버린 대안

- **HDBSCAN `approximate_predict`.** intent 결정 1. 기존 지도의 클러스터와 이름이 바뀐다.
- **모든 지도에 배치.** intent 결정 2.
- **arXiv를 OpenAlex DOI로만 해석.** 실측에서 다른 논문이 나왔다.
- **검색을 Rust에서 직접.** 키·속도 제한·변환 코드가 두 벌이 된다.
- **추가한 논문용 새 테이블.** 지도 하나에만 배치하므로 `projections`에 행이 있는지와 `via='manual'`로 충분하다.

## 함정

- `clusters.run_id`는 project run id다(`map.rs`의 조인).
- `cluster` 단계의 PCA는 저장된 `pca.pkl`과 다른 모델이다. 이웃 계산은 PCA를 거치지 않고 원래 임베딩으로 한다.
- 지도가 만들어진 뒤 다른 지도의 `embed`가 `works.parquet`를 바꿔도 `load_matrix`는 지도 논문 id로 고르므로 영향이 없다.
- `umap.transform`은 학습 데이터 밖 점을 기존 점 근처에 둔다. 주제가 크게 다른 논문은 엉뚱한 영역에 놓일 수 있다. 결과의 이웃 유사도(`similarity`)를 함께 남긴다.
- OpenAlex 검색은 1,000회에 $1이다. 식별자 조회와 `fetch_by_ids`(list+filter)는 싸다.
- S2 공용 풀은 429가 잦다(실측). 기존 재시도(지수 대기)를 쓰고, 실패하면 그 arXiv ID를 `not_found`에 둔다.

## 완료 기준

- `unittest`: 식별자 판별, arXiv 해석 순서(가짜 S2·OpenAlex), kNN 배정(미분류 비율·동률), 배치 transform이 기존 행을 바꾸지 않음, 빼기에서 수집 논문 거부, place 전 실패 시 지도·소속 변화 없음.
- `cargo test --workspace`: membership 질의, `added` 열·필터·`added_at`, 실행기 add/remove 종류와 기존 jobs 파일 읽기, Tauri 인자 모양.
- 스크래치 데이터의 serve에서 다음을 확인한다.
  - RAG/IR 지도에서 `search?q=retrieval augmented generation`과 `q=2005.11401`이 결과를 돌려준다.
  - 그 지도에 없는 논문 3편을 추가하면 `/api/map`의 `added`가 true인 점이 3개 늘고, 기존 점의 좌표·클러스터는 바이트 단위로 같다.
  - `/api/works?added=true`가 3편을 돌려준다.
  - 빼면 원래대로 돌아간다.
- 브라우저에서 추가한 논문이 지도와 상세에 보인다.
- 기존 E2E가 통과한다.
