# Constellation

학술 데이터베이스에서 논문 초록을 수집해, 한 연구 분야의 지형을 2D/3D 공간에 지도로 그리는 도구.

## 무엇에 답하는가

| 질문 | 뷰 |
|---|---|
| 이 분야에는 어떤 주제 덩어리들이 있는가 | **Map** — 의미 공간 2D 지도 |
| 그 덩어리들은 시간에 따라 어떻게 갈라지고 합쳐졌는가 | **Flow** — 갈래 흐름도 |
| 어떤 연구가 어떤 연구에서 뻗어 나왔는가 | **Lineage** — 인용 계보 |
| 각 갈래는 무엇을 대상으로, 어떤 방법으로 연구하는가 | **Facets** — 대상/방법/응용 패싯 |
| 전체 구조를 한눈에 | **Sky** — 3D 별자리 |

## 현재 상태

**M4 완료.** 다섯 개 뷰가 모두 동작한다 — 지도·계층 트리·갈래 흐름·인용 계보·3D. 남은 것은 M5(Scopus 연결, 권한 대기).

## 문서

- [기획서](docs/PLAN.md) — 목표, 시각화 컨셉, "갈래"의 계산 방법, 마일스톤, 리스크
- [아키텍처](docs/ARCHITECTURE.md) — 기술 스택, 모듈 구조, 데이터 스키마, API
- [M2 결과](docs/M2-RESULTS.md) — 클러스터링 공간 선택과 지도가 찾아낸 코퍼스 오염
- [M1 모델 비교](docs/M1-MODEL-COMPARISON.md) — 네 임베딩 모델을 세 지표로 비교한 기록
- [M0 결과](docs/M0-RESULTS.md) — RAG/IR 코퍼스 실측치와 그 과정에서 고친 것
- [데이터 소스](docs/DATA-SOURCES.md) — Scopus / OpenAlex / Semantic Scholar 비교와 어댑터 설계

## 실행

```bash
# 1) 환경
python -m venv .venv
.venv/Scripts/python.exe -m pip install -e .

# 2) API 키 — .env.example을 .env로 복사하고 OPENALEX_API_KEY를 채운다
cp .env.example .env

# 3) 수집 → 측정
constellation sets                      # 정의된 쿼리 세트
constellation collect --set rag-ir      # 연도별 할당량 + 피인용순으로 수집
constellation stats                     # 초록 커버리지 · 내부 인용 밀도
constellation backfill                  # 자주 인용되는 코퍼스 밖 논문 보강
```

`constellation stats`가 M0의 관문이다. 두 숫자를 본다:

- **초록 커버리지** — 90%↑ 진행 / 70–90% 보강 / 70%↓ 분야 교체 검토
- **내부 인용 밀도** — 양 끝이 모두 코퍼스 안에 있는 엣지. Flow와 Lineage가
  이 값에 직접 의존한다. 편당 3개 미만이면 `backfill`로 올린다.

## 지도 띄우기

```bash
# 임베딩 → 좌표 (최초 1회, RTX 5080 기준 임베딩 26초 + UMAP 약 2분)
constellation embed --model scincl --batch 128
constellation project --model scincl

# 백엔드와 프론트를 각각 띄운다
constellation serve                 # http://127.0.0.1:8000
npm --prefix frontend run dev       # http://localhost:5173
```

프론트는 항상 `/api`로 부르고 Vite가 백엔드로 프록시한다.

## 임베딩 모델 고르기

`constellation evaluate` 는 **인용 이웃 일치도**로 모델을 비교한다. 코퍼스 내부
인용 엣지 62,703개를 정답지로 삼아, 인용으로 연결된 논문이 임베딩 공간에서도
가까운지 잰다.

| 모델 | recall@10 | 무작위 대비 | 효과크기 | 지도 분리비 |
|---|---:|---:|---:|---:|
| **scincl** | 0.199 | **211×** | **1.99** | 0.763 |
| specter2 | 0.195 | 207× | 1.76 | 0.682 |
| specter | 0.172 | 182× | 1.64 | **0.887** |
| bge-m3 | 0.170 | 180× | 1.55 | 0.627 |

**SciNCL을 쓴다.** 다만 "관련 논문을 잘 찾는 것"과 "읽을 수 있는 지도를 만드는
것"은 다른 능력이라, SPECTER v1이 지도 분리도에서는 앞선다. 프론트 상단
선택기로 모델별 지도를 전환해 눈으로 비교할 수 있다.

자세한 근거와 한계는 [M1 모델 비교](docs/M1-MODEL-COMPARISON.md).

## 임베딩 환경 (M1)

RTX 5080은 Blackwell(sm_120)이라 CUDA 12.8 이상 빌드가 필요하다.

```bash
uv pip install --python .venv/Scripts/python.exe torch --index-url https://download.pytorch.org/whl/cu128
```

`pip`으로 이 인덱스를 쓰면 의존성 해석에서 오래 멈춘다 — `uv`를 쓸 것.
CUDA 툴킷(nvcc)은 필요 없다. PyTorch 휠이 런타임을 번들한다.
