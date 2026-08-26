# 아키텍처

> 기획 단계 문서. 구현 전 합의용이며 M1 이후 실물을 보고 수정한다.

## 1. 기술 스택과 선택 근거

### 백엔드 — Python 3.12

| 라이브러리 | 용도 | 선택 이유 |
|---|---|---|
| **FastAPI** + uvicorn | API 서버 | 비동기 수집 작업과 API를 한 프로세스에서. pydantic 스키마 재사용 |
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
│     ├─ api/               # FastAPI 라우트
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
constellation serve --port 8000
constellation stats                  # 초록 커버리지, 연도 분포, 중복률
```

`constellation stats`를 M0에 넣는 이유 — OpenAlex 초록 커버리지가 이 프로젝트의 최대 미지수다. 첫 수집 직후 바로 측정할 수단이 있어야 한다.
