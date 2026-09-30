# 현재 상태 감사 — 연구 도구 확장 기준

조사일 2026-09-30 · 기준 main `e570191` · 조사 대상은 루트 체크아웃(`.worktree/` 제외). 표시 없는 내용은 코드·DB에서 확인한 사실, "추정"은 확인하지 않은 판단이다. 이 문서는 [연구 도구 기획](../RESEARCH-TOOL-PLAN.md)의 근거 자료다.

## 1. 데이터 모델

- **스키마**(`backend/constellation/db/schema.sql`)
  - 원천: `works`(id, doi, title, abstract, has_abstract, year, venue, cited_by_count, type, source, raw_ref, collected_at, :4-17), `authors`/`work_authors`(:19-30), `citations(citing_id, cited_id)`(코퍼스 밖 id 허용, :32-38), `work_topics`(:40-46).
  - 수집 이력: `collections(run_id, query_set, query_name, filter_expr, n_returned, n_new, …)`(:49-60). 여기 run_id는 수집 시각 문자열로 분석 run과 뜻이 다르다(`ingest/collect.py:44`).
  - 분석 산출물(모두 `run_id` 키): `runs(run_id, kind, model, params_json, n_items, created_at)`(:69-76), `projections(x,y,z)`·`clusters`·`cluster_meta`(:78-110), `cluster_tree`·`tree_levels`(:118-144, `label_src`에 'manual' 주석이 있으나(:132) 이 값을 쓰는 코드는 없음), `flow_windows`·`flow_clusters`·`flow_members`·`flows`(:154-195), `citation_spc`(:202-209). `naming_audit`은 `analyze/naming.py:616-619`가 만든다.
- **run / 코퍼스 / 모델**
  - `kind='project'` run 하나가 지도 하나다. run_id는 `project-<model>-<시각>`(`analyze/project.py:95`). 파생 단계는 같은 run_id에 `|cluster`, `|tree`, `|flow`, `|lineage`를 붙여 `runs`에 기록한다(`cluster.py:226`, `hierarchy.py:185`, `flow.py:240`, `lineage.py:140`).
  - 코퍼스 개념은 코드에 없다. DB 파일 하나가 코퍼스 하나다. 폴더는 `CONSTELLATION_DATA_DIR`로 바꾼다(`config.py:24-29`). README:112-115가 "각 단계가 DB 전체를 읽으므로 폴더를 분리해야 한다"고 적는다. embed가 `SELECT … FROM works` 전체를 읽는다(`embed/run.py:26-28`).
  - 폴더마다 `constellation.duckdb`, `embeddings/<model>/`, `models/<model>/`(pkl), `raw/`가 따로 있다.
  - 실제 DB: `data/constellation.duckdb`는 works 10,604편, query_set `rag-ir`, project run은 scincl·specter·specter2·bge-m3 각 1개이고 cluster/tree/flow/lineage는 scincl run에만 있다. `data/physical-ai/constellation.duckdb`는 16,554편, query_set `physical-ai`+`physical-ai-driving`, project run scincl 1개.
- **앱의 run 선택**: `queries/runs.rs:17-22`가 `kind='project'` run만 돌려주고 `DEFAULT_MODEL="scincl"`(`lib.rs:15`)을 앞에 둔 뒤 최신순으로 정렬한다. run이 없으면 `map.rs:25-45`가 기본 모델 최신 run을 쓴다. 헤더 Select는 `r.model`만 표시한다(`AppShell.tsx:233-254`). 이 선택기는 같은 코퍼스 안의 임베딩 모델 전환이다. run을 바꾸면 선택 상태가 초기화된다(`navigation.ts:62-73`). 파이프라인 각 단계도 "해당 모델의 최신 project run"을 고른다(`cluster.py:133-140`, `hierarchy.py:75-82`, `flow.py:79-85`, `lineage.py:44-50`, `naming.py:480-487`).

## 2. 파이프라인

- **CLI**(`cli.py`, typer): `collect --set`(:35), `backfill --max`(:53, 코퍼스 밖 고빈도 피인용 논문), `enrich`(:62, S2로 초록 보강), `embed -m`(:68), `evaluate`(:80), `project`(:127, `--refit`), `sets`(:140), `cluster`(:154), `hierarchy`(:192), `name`(:207), `flow`(:230), `lineage`(:247), `stats`(:260).
- **순서**(README:93-104, :114-127): collect → (backfill → enrich) → embed → project → cluster → hierarchy → name → flow → lineage.

| 단계 | 입력 → 출력 | 외부 의존 |
|---|---|---|
| collect | QuerySet → works 등 + `raw/openalex/<set>/<ts>/` 원본 JSON(`collect.py:37-94`) | `OPENALEX_API_KEY`(없으면 종료, `cli.py:26-32`) |
| embed | works 전체 → `embeddings/<model>/`(vectors.npy, works.parquet, index.parquet). 텍스트 해시 캐시로 새 논문만 계산(`embed/run.py:40-46`, `cache.py`) | torch·sentence-transformers(`[embed]` extra, `pyproject.toml:15-21`), CUDA→MPS→CPU(`devices.py:7-15`) |
| project | PCA50 → UMAP 2D·3D, 모델 pkl 저장(`project.py:27-92`) | umap-learn |
| cluster | HDBSCAN(`umap10`, eom, 30) + c-TF-IDF(`cluster.py:155-199`) | sklearn |
| hierarchy | ward 트리 | — |
| name | LLM 이름(`naming.py:330-432`) | 로그인된 `codex`(기본 gpt-6-luna) 또는 `claude` CLI 서브프로세스(`naming.py:47`, :371, :404) |
| flow / lineage | 창별 HDBSCAN / SPC 메인패스 | — |

- **소요 시간**(M4 Max MPS, 1.6만 편, `docs/PHYSICAL-AI-RESULTS.md:120-133`): collect 135+65초, embed 235초, project 34초, cluster 19초, name 62초, flow 21초, 모델 다운로드 포함 약 15분(:12). 다른 하드웨어는 추정 불가. `PYTORCH_ENABLE_MPS_FALLBACK=1` 없이 도는지는 미확인(:142).
- **수집 쿼리는 코드 상수**: `queries.py`의 `QuerySet`(:15-41)과 `SETS`(:182-184)에 rag-ir, physical-ai, physical-ai-driving, on-device-ai. OpenAlex `title_and_abstract.search` OR + 연도별 할당 + 피인용 순(:27-33).
- **증분 추가**
  - 되는 부분: embed는 캐시로 새 논문만 계산한다. project는 저장된 PCA·UMAP pkl로 `transform()`만 하고 `--refit`일 때만 재학습한다(`project.py:54-73`).
  - 막히는 부분: project는 실행마다 새 run_id를 만든다(`project.py:95`). 하류 산출물은 모두 run_id 키라 새 run에는 클러스터·트리·이름·흐름·계보가 없다. 각 단계는 `DELETE … WHERE run_id` 후 전체를 다시 만든다(`cluster.py:194-195`, `hierarchy.py:153-154`, `flow.py:129-132`, `lineage.py:131`, `naming.py:611`). cluster는 10차원 UMAP을 매번 새로 학습하고 저장하지 않는다(`cluster.py:162-166`, flow도 `flow.py:121`). cluster_id가 실행마다 안정적이지 않다.
  - 추정: 학습 점에 `transform()`을 다시 적용하면 `fit_transform` 결과와 좌표가 조금 달라질 수 있다.
  - 단건 가져오기는 있다: `OpenAlexSource.fetch_by_ids`(`sources/openalex.py:248`). 사용자 논문은 `Work` 필드(`sources/base.py:25-40`)를 채워 `store.upsert_works`로 넣을 수 있다.

## 3. 앱과 파이프라인의 연결

- 앱에서 파이프라인을 실행하는 경로가 없다.
- Tauri 명령(`src-tauri/src/lib.rs:48-64`): runs, map, clusters, cluster_detail, tree, flow, flow_papers, lineage, works, matches, work, citations, db_status, choose_database, edges. `choose_database`를 빼면 모두 읽기다.
- `constellation-serve` 라우트는 모두 GET이고 CORS도 GET만 허용한다(`crates/constellation-serve/src/main.rs:224-240`).
- Rust 연결은 `AccessMode::ReadOnly`(`crates/constellation-core/src/db.rs:35-37`). Tauri capabilities는 `core:default`, 창 드래그, `dialog:allow-open`(`src-tauri/capabilities/default.json`). shell·sidecar 플러그인 없음.
- 앱 설정은 `db_path` 하나(`src-tauri/src/settings.rs:11-15`), 위치 `<app_config_dir>/settings.json`, 기본값 `<app_data_dir>/constellation.duckdb`(:41-46).
- ARCHITECTURE.md:148-149의 `POST /api/collect`, `GET /api/collect/{job_id}`는 계획만 있고 구현되지 않았다.

## 4. 프런트 정보 구조

- **좌측 사이드바**(`components/AppSidebar.tsx`): EXPLORE 그룹(뷰 버튼 5개, :64-85, 이름은 :29-35), RESEARCH CLUSTERS 그룹(개수 뱃지·이름 검색·클러스터 목록, 클릭하면 지도에서 선택, :86-153), 푸터 "OPENALEX · N편 · 로컬 데이터"(:155-160). `Sidebar collapsible="icon"`(:59-62). 계층 탐색·코퍼스 목록·작업 상태 요소는 없다.
- **헤더**(`AppShell.tsx:212-277`): 로고, 고정 문구 "연구 라이브러리"(:231), 모델 Select, 탐색 패널 토글, "논문 목록", 에이전트 토글.
- **본문**: 뷰 5개(:144-150, MapView만 숨김 상태로 계속 마운트), `YearRange`, `StageSearch`, `PaperListOverlay`, 하단 상태 바(:186-199), `InspectorDialog`.
- **우측**: `AgentSidebar` 24rem(:67-69, :282-290), 모바일은 Sheet(:293-315).
- **URL 파라미터**(`app/navigation.ts:4-20`): view, run, q, from, to, selected, cluster, node, list, local, sort, order, page, color.
- **사용자 상태 저장**: 북마크·메모·컬렉션·태그 없음. localStorage는 패널 열림 `constellation.layout.v3`(`hooks/use-persistent-layout.ts:5-10`)과 run별 대화 `constellation.agent.v1:<run>`(`agent/history.ts:20`)뿐. 카메라와 주석은 세션 메모리(zustand, `store.ts:20-21`, :46-47). 대화 키가 run_id 하나라 다른 DB의 같은 run_id와 섞일 수 있다(추정).

## 5. 에이전트 채팅

- 도구(`frontend/src/agent/tools.ts:45-217`, 모두 웹뷰에서 실행)
  - 읽기: list_topics, get_topic, search_papers, get_paper, get_citations, get_lineage, compare_papers
  - 화면 조작: set_filter, select, fly_to, zoom, annotate, clear_annotations, set_view, set_color_by
- 서버(`agent/src/server.ts:106-128`): 내장 도구는 `WebSearch`, `WebFetch`만(:37, :119-121). `permissionMode: "default"`, `settingSources: []`. 파일·셸 도구 없음.
- DB·파이프라인 쓰기 능력 없음. 서버는 별도 Node 프로세스(127.0.0.1:8787)이고 `.app`에 묶이지 않았다(README:49). Claude 로그인 또는 `ANTHROPIC_API_KEY` 필요(README:40).

## 6. 기존 문서의 로드맵·제약

- PLAN.md: M0~M4 완료, M5 Scopus 어댑터만 남음(:160-169). 비목표(:186-193): 전문 수집, 저자·기관 계량서지, 다중 사용자·계정·클라우드, 실시간 자동 갱신("수집은 명시적 실행"). 열린 질문(:195-203): 시간 창 폭, 초록 없는 논문, 수집 시작 연도, 클러스터 해상도(슬라이더로 열지 않기로 결정, :201). "라벨 수동 편집 기능"이 대응책으로만 언급됨(:182).
- ARCHITECTURE.md: `/api/search`, `/api/similar`, `POST /api/collect` 미구현(:136-150). CLI 예시 `collect --query`, `build`는 실제 CLI와 다름(:158-163). "도구 12개"(:213)는 실제 15개.
- README: 코퍼스 추가는 폴더 분리(:110-131), 앱의 코퍼스 전환은 "데이터베이스 열기"뿐(:131), 에이전트 서버 사이드카 미포함(:49).
- DATA-SOURCES.md: OpenAlex 키 필수, 무료 한도 $1/일(:56-59), 키는 헤더(:87). Scopus 초록은 기관 구독 COMPLETE view 필요(:30-33).
- `PHYSICAL-AI-RESULTS.md`: 미분류 30%(:10), 수집어 겹침으로 주제 밖 논문 유입(:91-102).

## 7. 구조적 제약

| 제약 | 근거 | 영향받는 요구 |
|---|---|---|
| DB 파일 = 코퍼스. 코퍼스 목록·메타 테이블 없음 | config.py:24-29, embed/run.py:26-28, README:112 | 지도 전환 |
| 앱 설정 `db_path` 하나, 네이티브 대화상자로만 변경. 브라우저 모드는 `--db` 고정 | settings.rs:11-15, commands.rs:160-181 | 지도 전환 |
| 헤더 Select는 모델 선택기, run 목록은 `kind='project'`·model명만 표시 | runs.rs:17-22, AppShell.tsx:239-251 | 지도 전환 |
| Rust 연결 읽기 전용, serve GET만. DuckDB는 쓰기 1개 또는 읽기 N개 — 쓰는 동안 앱은 503 | db.rs:9-10, :35-43, main.rs:224 | 논문 추가, 수집 |
| 긴 작업 인프라(큐, 진행률, 취소, 사이드카·shell 플러그인) 없음 | capabilities/default.json, lib.rs:48-64, ARCHITECTURE.md:148 | 수집 |
| 파이프라인은 Python CLI + torch, 저장소 `.venv` 전제. `.app`에 Python 런타임 없음 | pyproject.toml:15-21, README:63-66 | 수집 |
| 비밀 값은 저장소 `.env`에만. 앱에 OpenAlex 키 저장 위치 없음 | config.py:8-19, cli.py:26-32 | 수집 |
| 수집 쿼리가 코드 상수 | queries.py:182-184 | 수집 |
| 증분 추가 시 새 run + 하류 전체 재계산, cluster용 UMAP10 미저장 | project.py:95, cluster.py:162-166 | 논문 추가 |
| 이름 짓기가 외부 CLI 로그인에 의존 | naming.py:371, :404 | 논문 추가, 수집 |
| run 선택이 "최신 project run"에 암묵적으로 묶임 | cluster.py:133-140 외 4곳 | 논문 추가, 지도 전환 |
| 사용자 데이터 저장소 없음 | store.ts, history.ts:20, schema.sql:132 | 사이드바, 논문 추가 |
| 사이드바가 뷰 5개 + 평면 클러스터 목록으로 하드코딩 | AppSidebar.tsx:64-160 | 사이드바 |
| 에이전트는 읽기·화면 조작만, 별도 프로세스, 번들 미포함 | tools.ts:45-217, server.ts:119-121, README:49 | 에이전트로 수집·추가 |

기타: pyproject는 `hdbscan` 패키지를 의존성에 두지만(:19) 코드는 `sklearn.cluster.HDBSCAN`을 쓴다(`cluster.py:129`). PLAN.md의 "FastAPI serve" 도식(:155)은 현재 Rust 구조와 다르다.
