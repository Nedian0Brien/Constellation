---
title: 앱에서 새 논문 지도를 만든다
slug: new-map
stage: spec
status: accepted
intent: .intent/intent_new-map.md
date: 2026-10-06
---

# 앱에서 새 논문 지도를 만든다 — 명세

## 요구사항

1. **지도 정의(JSON).** 공통 필드는 `name`(표시 이름)과 `model`(`embed/encoder.py`의 `MODELS` 키, 기본 `scincl`)이다. `kind`에 따라 다음 필드를 받는다.
   - `terms`: `terms`(1개 이상), `year_from`, `year_to`, `per_year`. 수집 필터는 지금 `QuerySet.filter_for_year`와 같다.
   - `topics`: `topics`(`T10181`, `subfields/1702`, `fields/17` 형식, 1개 이상), `year_from`, `year_to`, `per_year`. 수집 필터는 `primary_topic.id` / `primary_topic.subfield.id` / `primary_topic.field.id` 가운데 하나에 id를 OR로 묶는다. OpenAlex는 서로 다른 필터를 AND로 묶으므로 수준을 섞은 정의는 422다.
   - `seeds`: `dois`(1–50개), `limit`(기본 3000). 시드의 `referenced_works`와 시드를 인용한 논문(`cites:W…`)을 모아 피인용 수 상위 `limit`편과 시드를 수집한다. 확장은 한 단계만 한다. 해석하지 못한 DOI는 로그에 남기고, 하나도 해석하지 못하면 실패한다.
   - 잘못된 정의(빈 목록, `year_from > year_to`, 모르는 모델, `per_year` 1–2000 밖)는 실행 전에 422와 이유를 돌려준다.
2. **예상 편수.** `estimate`는 정의를 받아 `{expected, per_year?, api_calls, warning?}`를 돌려준다. terms·topics는 연도마다 OpenAlex `count`를 `per_year`로 자른 합이고, seeds는 시드의 참고문헌 수와 피인용 수 합을 `limit`로 자른 값이다. 예상이 1,000편 미만이면 `warning`에 지도 품질이 떨어질 수 있다는 문구를 넣는다.
3. **토픽 검색.** `topics?q=`는 OpenAlex `/topics`, `/subfields`, `/fields`를 `search`로 조회해 `{id, name, level(topic|subfield|field), path, works_count}` 목록을 돌려준다.
4. **작업 실행.** 정의를 제출하면 작업이 만들어지고 다음 단계를 차례로 실행한다.
   `collect → backfill → enrich → embed → project → cluster → hierarchy → name → flow → lineage`
   - 코퍼스 id는 이름에서 ASCII kebab-case로 만들고, 비거나 겹치면 `map-<UTC 시각>`을 쓴다. 코퍼스 이름은 정의의 `name`이고, 지도 이름은 기존 지도와 같이 `<이름> · <모델>`이다(`project`가 채운다).
   - embed는 새 코퍼스 소속 논문만 계산한다. CLI `embed` 명령은 지금처럼 `works` 전체를 계산한다.
   - name은 CLI 기본값과 같은 `codex` 백엔드로 실행한다.
   - flow의 시작 연도는 terms·topics면 `year_from`, seeds면 코퍼스 출판 연도의 5백분위수다.
   - `name` 단계가 실패하면(CLI 없음, 로그인 없음, 시간 초과) c-TF-IDF 라벨을 그대로 두고 다음 단계로 간다. 작업 결과의 `naming`을 `ctfidf`로, 성공하면 `llm`으로 둔다.
5. **작업 상태.** `{id, status(queued|running|succeeded|failed|cancelled), definition, stage, stage_index, stage_count, progress?{done,total}, started_at, ended_at, error?{stage,message}, corpus_id, map_id?, naming?}`. progress는 편수를 셀 수 있는 collect·backfill·embed에서만 채우고 나머지 단계는 비워 둔다. 로그는 별도 조회로 마지막 500줄을 돌려준다.
6. **취소.** 실행 중인 작업을 취소하면 파이프라인 프로세스에 SIGTERM을 보내고 10초 안에 끝나지 않으면 강제 종료한다. 상태는 `cancelled`다.
7. **정리.** 실패·취소된 작업의 코퍼스는 지도 목록에 나오지 않는다.
   - 코퍼스에 `status`(`building`|`ready`, NULL은 `ready`)를 둔다. 작업이 시작할 때 `building`, 끝날 때 `ready`로 바꾼다. 지도 목록은 `building` 코퍼스의 지도를 뺀다.
   - 실패·취소 뒤 실행기가 `corpus drop --id C --only-building`을 실행해 그 코퍼스의 소속, run과 run 산출물, 수집 이력, 투영 모델 폴더를 지운다. 다른 코퍼스가 쓰는 `works`·`citations`·임베딩 캐시는 지우지 않는다.
8. **DB 잠금(intent 결정 (나)).** 작업 동안 지도·논문 조회 API는 DB를 열지 않고 503과 "새 지도를 만드는 중입니다" 문구를 돌려준다. 작업 API(`jobs*`, `estimate`, `topics`)는 계속 응답한다. `/api/health`는 503 대신 `{ok:false, reason:"새 지도를 만드는 중"}`을 돌려준다. 작업 시작 전에 진행 중인 조회가 끝나기를 기다린다(최대 5초).
9. **작업 기록과 종료 처리.** 작업 상태와 로그를 분석 DB 옆 `jobs/<id>.json`, `jobs/<id>.log`에 쓴다. 최근 20개를 남긴다.
   - 상태 파일에 파이프라인 프로세스의 `pid`를 남긴다.
   - 앱(Tauri `RunEvent::Exit`)이나 serve(SIGINT·SIGTERM)가 끝날 때 실행 중인 작업을 6과 같이 취소한다.
   - 앱·서버가 시작할 때 `running`으로 남은 작업이 있으면, 그 `pid`가 살아 있는지 확인해 살아 있으면 종료시킨 뒤 `failed`("앱이 종료되어 중단됨")로 바꾸고 7의 정리를 실행한다.
10. **한 번에 하나.** 실행 중인 작업이 있으면 새 제출은 409다.
11. **두 실행 환경.**
    - 브라우저 모드(`constellation-serve`): `POST /api/maps/estimate`, `GET /api/openalex/topics?q=`, `POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/{id}`, `GET /api/jobs/{id}/log`, `POST /api/jobs/{id}/cancel`.
    - 데스크톱 앱(Tauri 명령): `estimate_map`, `search_topics`, `create_map`, `jobs`, `job`, `job_log`, `cancel_job`.
    - `frontend/src/api.ts`에 같은 이름의 클라이언트 함수와 타입을 더한다.
12. **CLI 재현.** `constellation build --definition FILE`이 같은 정의로 같은 단계를 실행한다. 코퍼스 `definition_json`에 정의 전체를 남긴다. 기존 `collect --set`은 그대로 동작한다.

## 설계

- **Python이 OpenAlex를 맡는다.** 예상 편수, 토픽 검색, 수집은 모두 `OpenAlexSource`(키, 속도 제한, 원본 보관)를 거친다. 예상 편수와 실제 수집이 같은 필터 함수를 쓰게 하려는 것이다. Rust는 프로세스를 띄우고 결과를 읽기만 한다.
- **정의.** `backend/constellation/ingest/definition.py`를 새로 만든다. `parse(dict) -> TermsDef | TopicsDef | SeedsDef`로 검증한다. terms·topics는 `years`, `per_year`, `target`, `filter_for_year(year)`를 제공해 기존 `collect()`가 그대로 받게 한다. `QuerySet`도 같은 모양이다. `collect()`의 `ensure_corpus`는 정의 dict를 인자로 받는다.
- **시드 확장.** `ingest/seeds.py`. `doi:` OR 필터(50개씩)로 시드를 찾고, `referenced_works`와 `cites:` 조회(시드마다 피인용순 최대 `limit`편)로 후보를 모은 뒤 피인용 수 상위 `limit`편을 `fetch_by_ids`로 받는다. 후보 조회는 `select=id,cited_by_count`만 받는다. 지금 `search()`는 초록까지 받는 `SELECT`가 고정이라 `select` 인자를 더한다.
- **파이프라인.** `backend/constellation/pipeline.py`의 `build(defn, emit)`가 기존 함수를 차례로 부른다. 대상은 `--corpus`·`--map`과 같은 값을 명시적으로 넘긴다. 각 함수의 `log` 콜백을 이벤트로 바꾼다. collect·backfill·embed의 반복문에는 progress 콜백 인자를 더한다.
- **이벤트.** `build --events`는 표준 출력에 한 줄에 JSON 하나를 쓴다. 종류는 `stage`, `progress`, `log`, `done{corpus_id,map_id,naming}`, `error{stage,message}`다. rich 콘솔 출력은 이 모드에서 표준 오류로 보낸다. `estimate`·`topics`는 `--json`으로 결과 하나를 쓴다.
- **코퍼스 단위 임베딩.** `embed_corpus(model_key, work_ids=None)`에 논문 id 인자를 더한다. 주면 그 논문만 계산하고, `works.parquet`(논문 id → 텍스트 해시)는 기존 행에 그 논문의 행을 합쳐 다시 쓴다. 다른 코퍼스의 `load_matrix`가 같은 파일을 읽기 때문이다.
- **DB 경로.** `config.py`에 `CONSTELLATION_DB` 환경 변수를 더해 `DB_PATH`를 직접 지정한다. 실행기는 `CONSTELLATION_DB=<앱 DB 경로>`와 `CONSTELLATION_DATA_DIR=<그 폴더>`, `PYTORCH_ENABLE_MPS_FALLBACK=1`을 넘긴다.
- **실행기 크레이트.** `crates/constellation-jobs`를 새로 만든다. serve와 Tauri가 같은 코드를 쓴다. 비동기 런타임에 묶이지 않게 `std::process`와 스레드로 구현한다. 표준 출력 읽기 스레드가 이벤트를 상태에 반영하고, 상태 파일과 로그 파일을 쓴다.
- **잠금.** `constellation_core::Database`에 공유 `Gate`를 둔다. 구성은 작업 사유 `Mutex<Option<String>>`과 진행 중 연결 수 `AtomicUsize`다. `connect()`는 사유가 있으면 503을 돌려주고, 없으면 연결 수를 올리고 drop할 때 내리는 래퍼를 돌려준다. 래퍼는 `Deref<Target=Connection>`이라 질의 함수는 바뀌지 않는다. 실행기는 사유를 세우고 연결 수가 0이 되기를 기다린 뒤 프로세스를 띄운다. 프로세스가 끝나고 정리가 끝나면 사유를 내린다.
- **지도 목록.** `queries::runs`가 `corpora.status` 컬럼이 있으면 `building`을 뺀다. `has_corpus_columns`와 같은 방식으로 컬럼 존재를 확인한다.
- **파이프라인 경로.** serve는 `--pipeline`(환경 변수 `CONSTELLATION_PIPELINE`, 기본 `.venv/bin/constellation`)을 받는다. Tauri는 `settings.json`의 `pipeline_path`를 쓰고, 없으면 빌드 시점 저장소 경로(`CARGO_MANIFEST_DIR/../.venv/bin/constellation`)를 쓴다. 파일이 없으면 제출 시 503과 설치 안내를 돌려준다.
- **CORS.** serve의 CORS 허용 메서드에 POST를 더한다.

## 버린 대안

- **Rust에서 OpenAlex 직접 호출.** Python 시작 시간(약 1초)을 줄일 수 있다. 하지만 필터를 만드는 코드가 두 언어로 나뉘어 예상 편수와 실제 수집이 어긋날 수 있다.
- **DB 복사본에서 실행 후 교체.** 사용자가 (나)를 골랐다(intent 열린 질문 1).
- **Tauri 이벤트로 진행률 전달.** 브라우저 모드에는 없는 경로라서 두 환경의 코드가 갈린다. 두 환경 모두 1초 폴링으로 조회한다.
- **실패 시 코퍼스를 남기고 목록에서만 숨김.** 실패한 코퍼스가 쌓이고 같은 이름을 다시 쓸 수 없다. `status`로 숨기고 drop으로 지운다. drop이 실패해도 목록에는 나오지 않는다.

## 함정

- `embed`는 코퍼스가 아니라 `works` 전체를 임베딩한다(캐시 재사용). 다른 코퍼스의 결손분도 이때 계산된다.
- `works.parquet`는 모델별로 하나다. 코퍼스 단위 임베딩이 이 파일을 새 코퍼스 논문만으로 덮어쓰면 다른 코퍼스의 지도를 다시 투영할 때 행이 빠진다.
- `std::process::Child::kill`은 Unix에서 SIGKILL이다. SIGTERM은 `libc::kill`로 보낸다.
- 토픽 검색은 호출마다 Python 프로세스를 띄운다(약 1초). 3번 intent의 화면은 입력을 debounce해서 부른다.
- `Database`는 질의마다 연결을 연다(`db.rs`). 파이프라인 단계 사이에 앱이 연결을 열면 다음 단계의 쓰기 연결이 실패한다. 그래서 잠금은 단계마다가 아니라 작업 전체에 건다.
- 같은 DB를 여는 다른 프로세스(다른 워크트리의 serve, CLI)가 있으면 파이프라인이 쓰기 연결을 얻지 못한다. 이때는 실패 메시지에 "다른 프로세스가 DB를 열고 있음"을 넣는다.
- `hierarchy`는 클러스터가 3개 미만이면 실패한다(`hierarchy.py:83`). 작은 코퍼스에서는 실패 단계와 이유가 그대로 보여야 한다.
- OpenAlex `doi:` 필터는 arXiv DOI(`10.48550/arxiv.*`)에 다른 논문을 돌려준 사례가 있다(2026-10-06 실측). 시드는 해석한 제목을 로그에 남긴다.
- OpenAlex 무료 키 한도는 하루 $1이다. 429는 기존 `_get`의 재시도에 맡기고, 한도 초과는 실패 메시지로 보인다.
- SIGTERM을 받은 Python은 `finally`를 실행하고 끝나도록 신호 처리기를 둔다. DuckDB 쓰기 도중 강제 종료되면 WAL이 남지만, 다음 연결에서 재생된다.

## 완료 기준

- `pytest backend/tests`: 정의 검증, 종류별 필터, 시드 확장(가짜 소스), 이벤트 출력, `corpus drop --only-building`, `status` 기록 테스트가 통과한다.
- `cargo test --workspace`: Gate(작업 중 503, 연결 수 대기), `runs`의 `building` 제외, 실행기(가짜 파이프라인 스크립트로 성공·실패·취소·재시작 복구·409) 테스트가 통과한다.
- 스크래치 데이터(`CONSTELLATION_DATA_DIR`) 위의 serve로 terms 정의(5개 연도 × 300편)를 `POST /api/jobs`로 제출한다. 다음을 확인한다.
  - `GET /api/jobs/{id}`가 10단계를 지나 `succeeded`가 된다.
  - 실행 중 `/api/map`이 503이다.
  - 끝난 뒤 `/api/runs`에 새 지도가 있다.
  - 브라우저에서 그 지도의 다섯 뷰가 열린다.
- 같은 환경에서 topics·seeds 정의로 `estimate`가 값을 돌려주고, seeds 작은 정의(시드 3편, `limit` 1500) 작업이 성공한다.
- 실행 중 취소하면 `cancelled`가 되고, `/api/runs`와 `corpora`에 그 코퍼스가 남지 않는다.
- `npx --prefix frontend tsc -b`, 기존 E2E가 통과한다.
