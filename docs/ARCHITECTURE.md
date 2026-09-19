# 아키텍처

> 기획 단계 문서. 구현 전 합의용이며 M1 이후 실물을 보고 수정한다.

## 1. 기술 스택과 선택 근거

### 백엔드 — Python 3.12

| 라이브러리 | 용도 | 선택 이유 |
|---|---|---|
| ~~FastAPI + uvicorn~~ | ~~API 서버~~ | 2026-09-17 Rust 질의 계층으로 대체. 아래 "데스크톱 앱 업데이트" |
| **httpx** | HTTP 클라이언트 | 비동기 + 커넥션 풀. 소스별 rate limit을 세마포어로 제어 |
| **pydantic v2** | 스키마 검증 | 소스마다 다른 응답을 통일 스키마로 강제하는 경계 |
| **DuckDB** | 저장 + 쿼리 | 1만 편 규모에서 서버 불필요, parquet 직접 쿼리, 집계가 SQLite보다 빠름 |
| **sentence-transformers** | 임베딩 | 모델 교체가 설정 한 줄 |
| **umap-learn** | 차원 축소 | 사실상 표준. `transform()`으로 좌표 안정성 확보 가능 |
| **hdbscan** | 클러스터링 | 밀도 기반이라 클러스터 개수를 미리 정할 필요 없음. condensed tree를 계층 구조로 재활용 |
| **pyarrow** | DuckDB 벌크 삽입 | 선택이 아니라 필수 — 아래 측정 참조 |
| **scikit-learn** | PCA, TF-IDF | c-TF-IDF 라벨링 |

> **CUDA 주의** — RTX 5080은 Blackwell(sm_120)이라 CUDA 12.8 이상 빌드가 필요하다.
> `pip install torch --index-url https://download.pytorch.org/whl/cu128`
> 기본 PyPI 휠을 쓰면 `sm_120 is not compatible with the current PyTorch installation` 에러가 난다.

### 프론트엔드 — Vite + React + TypeScript

| 라이브러리 | 용도 | 선택 이유 |
|---|---|---|
| **deck.gl** | Map(2D) + Sky(3D) 렌더링 | 2D와 3D를 **같은 API로** 처리한다 (`OrthographicView` / `OrbitView`). three.js를 따로 쓰면 좌표계·선택 로직·색상 스케일을 두 번 만들게 된다 |
| **d3** | Flow(Sankey), 컨투어, 스케일 | `d3-sankey`, `d3-contour`, `d3-scale` — 필요한 모듈만 |
| **zustand** | 상태 관리 | 네 뷰가 공유하는 selection/filter 상태. Redux는 이 규모에 과함 |
| **Tailwind** | 스타일 | 빠른 UI 조립 |

> 1만 점은 Canvas로도 되지만, deck.gl은 3D·컨투어·피킹·시간 필터를 이미 갖고 있어 직접 만드는 비용을 아낀다. 이후 10만 점으로 늘려도 그대로 간다.

## 2. 디렉터리 구조

```
Constellation/
├─ backend/
│  └─ constellation/
│     ├─ sources/          # 소스 어댑터 (DATA-SOURCES.md 참조)
│     │   ├─ base.py        #   PaperSource 프로토콜 + 통일 스키마
│     │   ├─ openalex.py    #   1차 소스
│     │   ├─ scopus.py      #   권한 확보 시
│     │   └─ crossref.py    #   초록 보강용
│     ├─ ingest/
│     │   ├─ collect.py     # 수집 → raw JSON (불변)
│     │   ├─ normalize.py   # 통일 스키마 변환
│     │   └─ dedupe.py      # DOI → 정규화 제목 순으로 중복 제거
│     ├─ embed/
│     │   ├─ encoder.py     # 모델 로딩 + 배치 인코딩
│     │   └─ cache.py       # hash(title+abstract+model_id) → 벡터
│     ├─ analyze/
│     │   ├─ project.py     # PCA → UMAP 2D/3D, 모델 저장
│     │   ├─ cluster.py     # HDBSCAN + c-TF-IDF 라벨
│     │   ├─ temporal.py    # 시간 슬라이스 + 흐름 가중치
│     │   └─ lineage.py     # 인용 DAG, SPC 메인패스
│     ├─ db/
│     │   ├─ schema.sql
│     │   └─ store.py       # DuckDB 접근 계층
│     └─ (api/ 는 2026-09-17 제거 — crates/constellation-core 로 이동)
│     └─ cli.py             # typer 기반 CLI
├─ frontend/
│  └─ src/
│     ├─ views/{Map,Sky,Flow,Lineage}/
│     ├─ panels/{Search,Facets,Detail,Timeline}/
│     ├─ store/             # zustand — selection, filter, colorBy
│     └─ api/               # 백엔드 클라이언트
├─ data/                    # gitignore
│  ├─ raw/                  # 소스 원본 JSON (불변, 재현성 보장)
│  ├─ constellation.duckdb
│  ├─ embeddings/*.npy
│  └─ models/               # 저장된 UMAP 모델
└─ docs/
```

**`data/raw/`를 불변으로 두는 이유** — 파싱 로직이 바뀌거나 새 필드가 필요해질 때 API를 다시 때리지 않아도 된다. Scopus는 주간 쿼터가 있어 재수집 비용이 실제로 존재한다.

## 3. 데이터 스키마 (DuckDB)

```sql
-- 논문 본체
works(
  id            TEXT PRIMARY KEY,  -- 내부 ID (source:native_id)
  doi           TEXT,
  title         TEXT,
  abstract      TEXT,              -- NULL 가능 → has_abstract로 구분
  year          INTEGER,
  venue         TEXT,
  cited_by_count INTEGER,
  source        TEXT,              -- 'openalex' | 'scopus' | ...
  raw_ref       TEXT               -- data/raw/ 내 원본 위치
)

authors(id, name, orcid)
work_authors(work_id, author_id, position)

-- 인용: Flow와 Lineage의 근거
citations(citing_id, cited_id)

-- 주제 태그 (OpenAlex topics / Scopus subject areas / 저자 키워드)
work_topics(work_id, topic, score, kind)   -- kind: 'topic'|'concept'|'keyword'

-- 분석 산출물은 run_id로 버전 관리 (파라미터 바꿔가며 비교하기 위해)
runs(run_id, created_at, params_json)      -- 모델명, UMAP/HDBSCAN 파라미터
projections(run_id, work_id, x, y, z)
clusters(run_id, work_id, cluster_id)      -- cluster_id = -1 은 noise
cluster_meta(run_id, cluster_id, label, keywords, size, centroid_ref)
flows(run_id, t_from, cluster_from, t_to, cluster_to, weight, w_citation, w_semantic, w_author)
```

`flows`에 결합 가중치와 함께 **세 성분을 따로 저장**하는 이유 — UI에서 "인용 기준으로만 보기" 토글을 만들 수 있고, 흐름이 이상할 때 어느 신호 때문인지 디버깅할 수 있다.

임베딩은 DB가 아니라 `.npy` + work_id 매핑 parquet으로 둔다. 1만 × 768차원 float32 ≈ 30MB.

### DuckDB 삽입 — Arrow 경로가 아니면 못 쓴다

수집 단계에서 실측한 값 (인용 29,266행 + 논문 700편):

| 방식 | 시간 |
|---|---:|
| `executemany` | 매우 느림 (연도당 분 단위) |
| 다중 행 `VALUES` (플레이스홀더 1만 개) | 47.5초 |
| 기본키 제거 + plain INSERT | 47.5초 |
| **Arrow 테이블 등록 + `INSERT ... SELECT`** | **12.0초** |

진단을 두 번 틀렸다. `executemany`의 행별 실행 계획이 원인이라 생각해
다중 행 VALUES로 바꿨지만 그대로였고, 그다음엔 기본키 충돌 검사를 의심했지만
제약조건을 떼도 같았다. 실제 병목은 **파라미터 바인딩 자체**였고,
그걸 통째로 우회하는 Arrow 경로만이 효과가 있었다.

그래서 `pyarrow`가 선택이 아니라 필수 의존성이다. 앞으로 삽입하는
모든 경로는 `_bulk_insert()`를 거친다.

## 4. API

```
GET  /api/runs                        분석 run 목록
GET  /api/map?run=&format=arrow       좌표 + 클러스터 (Arrow로 압축 전송)
GET  /api/works/{id}                  논문 상세 (초록, 저자, 인용)
GET  /api/search?q=&limit=            제목/초록 텍스트 검색
GET  /api/similar?id=&k=              임베딩 최근접 이웃
GET  /api/clusters/{run}/{id}         클러스터 상세 (대표 논문, 키워드, 연도 분포)
GET  /api/flow?run=                   Flow 뷰 데이터
GET  /api/flow/edges?from=&to=        특정 흐름을 만든 실제 인용 목록
GET  /api/lineage?seed=&depth=        인용 DAG + 메인패스
POST /api/collect                     수집 작업 시작 (비동기, 진행률 폴링)
GET  /api/collect/{job_id}            진행 상황
```

`/api/map`은 1만 행 × (id, x, y, z, cluster, year, cited) — JSON이면 수 MB, Arrow면 수백 KB. 초기 로딩 체감이 달라진다.

## 5. CLI

웹 UI 없이도 파이프라인 전체를 돌릴 수 있어야 한다. 디버깅과 재현성 양쪽에 필요하다.

```bash
constellation collect --source openalex --query "topic:..." --limit 5000
constellation build --model scincl --umap-neighbors 15 --min-cluster-size 25
constellation build --refit          # UMAP 전체 재학습 (좌표가 바뀜)
cargo run -p constellation-serve -- --db data/constellation.duckdb   # 개발용 HTTP 서버 (Rust)
constellation stats                  # 초록 커버리지, 연도 분포, 중복률
```

`constellation stats`를 M0에 넣는 이유 — OpenAlex 초록 커버리지가 이 프로젝트의 최대 미지수다. 첫 수집 직후 바로 측정할 수단이 있어야 한다.

## 제품 기반 업데이트 — 2026-09-12

프론트의 서버 데이터는 TanStack Query가 관리한다. `app/navigation.ts`가 URL 입력을 검증하고 `use-exploration.ts`가 탐색 상태를 변경한다. 기본 run을 처음 결정할 때 기존 링크의 선택과 필터를 보존하며, 사용자가 모델을 바꿀 때만 run 종속 선택을 해제한다. Zustand에는 run별 카메라 등 일시 상태를 둔다.

`AppShell`은 shadcn `SidebarProvider` 아래에 좌측 `Sidebar collapsible="icon"`(탐색)과 우측 `Sidebar side="right" collapsible="none"`(`Inspector`)을 둔다. 공식 좌·우 사이드바 블록처럼 우측은 앱이 렌더링 여부로 열고 닫는다. 논문 목록은 지도 위의 오버레이이고 두 패널의 열림 상태는 버전이 있는 로컬 저장 값(`constellation.layout.v2`)으로 복원한다. `views/map/labels.ts`는 실제 계층 트리와 가시 영역을 사용하며 라벨 중첩을 줄인다.

- `GET /api/works`: run·q·year_from·year_to·sort·order·page·page_size를 받아 `{items,total,page,page_size}` 반환.
- `GET /api/matches`: 동일한 run·검색·연도 조건의 `{ids,total}` 반환.
- `GET /api/works/{id}?run=...`: 선택 논문이 해당 run에 포함되는지 검증.

두 목록 조회는 `db/queries.py`의 조건을 공유한다. 검색은 제목·초록의 부분 문자열이며, SQL 매개변수로 전달한다. 연도 미상은 기간 필터에 포함한다. 기본 데이터 경로는 저장소의 `data/`; `CONSTELLATION_DATA_DIR`로 재정의할 수 있다. API는 읽기 전용이고 테스트는 임시 DB를 사용한다.

## 데스크톱 앱 업데이트 — 2026-09-17

서빙 계층을 Python에서 Rust로 옮기고 Tauri 2 데스크톱 앱으로 묶었다.

```
Cargo.toml                         # 워크스페이스
crates/constellation-core/         # 질의 계층 (lib). Database::open → queries::{runs, map, clusters, tree, flow, flow_papers, lineage, cluster_detail, works, matches, work, health}
crates/constellation-serve/        # 개발용 HTTP 서버 (axum). /api/* 를 FastAPI와 같은 경로·인자로 노출
src-tauri/                         # Tauri 앱. 명령(invoke)·설정(settings.json)·파일 대화상자
frontend/src/api.ts                # 전송 계층: isTauri() 이면 invoke, 아니면 fetch("/api/…")
scripts/compare-api.py             # Python 서버와 Rust 서버 응답 대조 (전환 검증용)
```

- `constellation-core`는 `duckdb-rs ~1.10505`(DuckDB 1.5.5 정적 링크)를 쓴다. Python `duckdb` 1.5.5와 같은 버전이라 저장 형식이 같다. 질의마다 읽기 전용 연결을 열고, 파이프라인이 쓰는 동안 잠기면 503으로 돌려 앱은 살려 둔다.
- 반환 구조체·오류 상태·문구는 FastAPI 버전과 같다. 실데이터에서 11개 엔드포인트 × 32개 인자 조합을 대조해 확인했다(`scripts/compare-api.py`). `/api/search`는 프론트가 쓰지 않아 옮기지 않았다.
- 앱의 DB 경로: `<app_config_dir>/settings.json`의 `db_path` → 없으면 `<app_data_dir>/constellation.duckdb`. `choose_database` 명령이 네이티브 대화상자로 파일을 고르고 저장한다.
- Tauri 명령은 AbortSignal이 없다. React Query 키가 run·조건을 포함하므로 늦은 응답이 화면을 덮지 않는다.
- Playwright E2E는 `constellation-serve` 위에서 돈다(WebDriver가 macOS Tauri를 지원하지 않는다). 명령 인자 모양은 `src-tauri/tests/commands.rs`가 MockRuntime으로 검사한다.

## 에이전트 채팅 업데이트 — 2026-09-18

우측 사이드바가 에이전트 채팅이 되고 논문·주제 상세는 선택 시 열리는 `Dialog`(`InspectorDialog`)로 옮겼다. 패널 열림은 `constellation.layout.v3` `{navOpen, chatOpen}`이다.

```
agent/                             # Node 서버 (Hono). agent-chat-framework 의 route.ts·bridge.ts 를 옮긴 것
  src/server.ts                    #   POST /api/agent (assistant-ui 데이터 스트림), POST /api/agent/tool-result
  src/bridge.ts                    #   Agent SDK query() → assistant-stream. 중계 도구는 접두사를 떼고 결과를 서버가 보내지 않는다
  src/relay.ts                     #   요청의 도구 JSON 스키마 → zod → SDK MCP 서버 "ui". tool_use.id 를 이름+인자로 짝짓고 결과를 기다린다
frontend/src/agent/                # 클라이언트
  AgentProvider.tsx                #   useDataStreamRuntime(/api/agent) + 도구 등록(useAssistantTool) + 시스템 프롬프트(useAssistantInstructions)
  tools.ts                         #   도구 12개의 정의(JSON 스키마)와 실행기. 데이터는 api.ts, 지도는 store 의 cameraRequest·annotations
  context.ts                       #   매 턴 시스템 프롬프트: run·화면·선택·필터·확대 단계
  history.ts                       #   run 별 localStorage 대화 저장 (sessionId + 메시지). 서버는 같은 id 로 SDK 세션을 resume
frontend/src/components/assistant-ui/  # @acf 레지스트리 설치본 (NOTE(constellation) 주석이 있는 파일만 손댔다)
```

- 도구는 전부 웹뷰에서 돈다. 서버는 이름·스키마만 알고 MCP 핸들러가 웹뷰의 `tool-result`를 기다린다. 그래서 서버는 지도·DB를 모르고, 데스크톱에서도 `invoke` 경로가 그대로 쓰인다. 서버를 다른 런타임으로 바꿔도 프론트는 바뀌지 않는다.
- SDK 세션 파일은 cwd 해시 아래에 놓이므로 서버 cwd 를 `agent/`로 고정했다. 첫 턴 판별은 `getSessionInfo` 로 한다.
- `MapView`는 `cameraRequest`(run·nonce)를 한 번만 소비하고, 주석은 SVG 오버레이로 점→라벨 지시선을 그린다. 주석은 세션 안에서만 산다.
- 에이전트 실응답은 Claude 로그인이 필요해 E2E에서는 `/api/agent`를 데이터 스트림으로 흉내 내어 프론트 도구 파이프라인(zoom → tool-result → 카메라 변화 → 복원)만 검사한다.

### 모델 선택기·Codex 백엔드 — 2026-09-19

작성창 왼쪽 아래에 레지스트리 `model-selector`(`@acf/model-selector-aui` + `logos`)가 있다. 요청 본문의 `modelName` 접두사(`claude/…` | `codex/…`)로 서버가 백엔드를 고른다.

```
agent/src/
  models.ts                        #   GET /api/agent/models — Claude supportedModels() + Codex model/list (프로세스 수명 캐시), parseModelId
  codex/app-server.ts              #   codex app-server 프로세스 하나(JSON-RPC over stdio). 전용 CODEX_HOME, auth.json 읽기 전용 토큰 로그인
  codex/bridge.ts                  #   item/* 알림 → assistant-stream. ui 서버의 mcpToolCall 은 중계 도구(결과를 서버가 붙이지 않는다)
  codex/protocol.ts                #   generate-ts 출력에서 쓰는 타입만
  mcp-endpoint.ts                  #   /mcp/:sessionId — streamable HTTP MCP. 세션 manifest 로 도구를 만들고 Relay.waitFor 로 답한다
frontend/src/agent/
  settings.ts                      #   모델 선택 저장(constellation.agent.model.v1, useSyncExternalStore)
  AgentModelSelector.tsx           #   프로바이더 그룹(로고)·effort·speed. thread.aui 의 ComposerLeading 슬롯에 들어간다
  use-agent-health.ts              #   health 검사·네트워크 오류 → "서버가 꺼져 있습니다" 안내
```

- `sessionId`는 두 프로바이더 모두 클라이언트 UUID이고 도구 중계 키다. Codex 스레드 id는 app-server가 정하므로 응답 `data-session.codexThreadId`를 히스토리 어댑터가 저장본에 덧쓰고(`patch`) 다음 턴부터 `codexThreadId`로 보낸다. 대화 저장 키는 `constellation.agent.v2:<run>:<provider>`(v1은 Claude 대화로 읽는다).
- Codex 도구 중계: `thread/start.config.mcp_servers.ui.url`로 `/mcp/<sessionId>`를 넘긴다. `approvalPolicy: never`에서 codex는 `readOnlyHint` 없는 MCP 도구를 승인 대상으로 보고 거부하므로 도구에 `annotations.readOnlyHint`를 단다(실측). `arguments`는 `item/started`에 온다.
- speed: Claude는 `settings.fastMode`, Codex는 턴 단위 `serviceTierForTurn`(`priority`). 모델을 바꾸면 그 모델이 받는 effort·speed만 남긴다.
- Codex 격리: `thread/start.config`·`-c`로는 사용자 config.toml의 MCP 서버·플러그인이 빠지지 않아(병합) `CODEX_HOME`을 바꿨다. 근거와 실측은 프레임워크 `DECISIONS.md` 6.

### 인용 추적·논문 비교·웹 접근 — 2026-09-18

- `GET /api/citations?run=&id=&direction=&limit=` / Tauri `citations` — `queries::citations`. `citations` 테이블에서 코퍼스 안 논문만 피인용 순으로 `limit`개(1–500, 기본 20). 총계는 limit·방향과 무관하다. 논문 id에 `/`가 올 수 있어 `/works/{*work_id}` 아래가 아니라 쿼리로 받는다.
- 도구 `get_citations`(주제 라벨 결합), `get_lineage`(`/lineage`의 엣지 `from`=피인용·`to`=인용을 씨앗 기준 `cites`/`cited_by`로), `compare_papers`(논문마다 `fetchWork` + 참고문헌 500개를 받아 집합 안 인용 쌍을 만들고, 투영 좌표 유클리드 거리와 지도 대각선 `map_span`을 함께 준다). 모델이 `W123`으로 부르면 `openalex:W123`으로 맞춘다(`paperId`).
- 서버는 내장 도구 중 `WebSearch`·`WebFetch`만 연다(`tools`·`allowedTools`). 둘은 `claude` 프로세스 안에서 돌고 결과는 브리지가 `setResponse`로 돌려준다(중계 도구와 달리 서버가 결과를 보낸다). 프롬프트가 OpenAlex API(`openalex:` 접두사 제거)와 DOI 리다이렉트 처리를 안내한다.
