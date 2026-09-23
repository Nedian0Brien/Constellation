---
title: 피지컬 AI 코퍼스 구축
slug: physical-ai-corpus
stage: spec
status: accepted
intent: .intent/intent_physical-ai-corpus.md
date: 2026-09-24
---

# 피지컬 AI 코퍼스 구축 — 명세

## 요구사항

- [ ] 새 코퍼스는 `/Users/minjaepark/code/Constellation/data/physical-ai/`(git 밖)에 생긴다. `constellation.duckdb`, `raw/`, `embeddings/`, `models/`가 모두 이 폴더 안에 있다. 기존 `data/constellation.duckdb`와 `data/embeddings/`·`data/models/`는 수정 시각이 바뀌지 않는다.
- [ ] 수집 세트 두 개를 쓴다. 기간은 2014–2026년이고, 해마다 두 세트를 합쳐 최대 1,200편이다.
  - `physical-ai`(한 해 800편): 로봇 학습·조작, 체화 AI, VLA, sim-to-real, 월드 모델, 모방 학습, 휴머노이드, 다리 보행
  - `physical-ai-driving`(한 해 400편): 자율주행
  - 비율은 OpenAlex 실측으로 정했다. 두 세트를 OR로 묶으면 2019–2024년에 자율주행 논문이 로봇 쪽보다 1.6–1.9배 많아(예: 2024년 10,206 대 5,431편) 피인용순 상위를 차지한다.
- [ ] 넓은 수집어 두 개는 로봇 맥락을 AND로 붙여 좁힌다.
  - `"imitation learning" AND (robot OR robotic)`
  - `"world model" AND (robot OR robotic OR embodied)`
- [ ] backfill은 코퍼스가 두 번 이상 인용한 외부 논문을 피인용순으로 최대 1,500편 더한다. 이어서 `enrich`로 빠진 초록을 채운다.
- [ ] 분석 산출물을 SciNCL로 모두 만든다.
  - 투영(새 폴더라 UMAP을 처음부터 학습한다), 클러스터, 계층 트리(`--levels 8,18`)
  - LLM 분야 이름(`name`, Qwen3-4B), 갈래 흐름, 인용 계보
- [ ] 임베딩과 분야 이름 짓기는 CUDA → MPS → CPU 순서로 장치를 고른다. 이 Mac에서는 MPS로 돈다.
- [ ] `constellation-serve --db data/physical-ai/constellation.duckdb`로 연 앱에서 확인한다.
  - 지도, 상위 분야 이름(LLM 이름), 인용선(호버)이 나온다.
  - run 목록에 scincl 하나가 보인다.
- [ ] `docs/PHYSICAL-AI-RESULTS.md`에 다음을 적는다.
  - 연도·세트별 수집 수, backfill 수, 초록 비율, 코퍼스 안 인용 수
  - 주제 밖 클러스터의 규모
  - 대표 논문 19편의 포함 여부와 들어온 경로(수집 또는 backfill)
  - 각 단계에 걸린 시간
- [ ] README "수집과 분석" 절에 새 코퍼스를 별도 폴더에 만드는 방법을 적는다.
- [ ] `python -m unittest discover -s backend/tests`가 통과한다.

## 설계

**수집 세트 — `backend/constellation/queries.py`.**
- 기존 `PHYSICAL_AI`의 수집어를 다음 18개로 바꾼다. `per_year`는 800으로 하고, 기간 2014–2026은 그대로 둔다.
  `"physical AI"`, `"embodied AI"`, `"embodied intelligence"`, `"embodied agent"`, `"vision-language-action"`, `"robot learning"`, `"robotic manipulation"`, `"robot manipulation"`, `"visuomotor policy"`, `"sim-to-real"`, `"robot foundation model"`, `"manipulation policy"`, `("imitation learning" AND (robot OR robotic))`, `("world model" AND (robot OR robotic OR embodied))`, `"humanoid robot"`, `"legged locomotion"`, `"legged robot"`, `"quadruped robot"`
- 새 세트 `PHYSICAL_AI_DRIVING`을 만든다.
  - 수집어: `"autonomous driving"`, `"self-driving"`, `"end-to-end driving"`
  - `per_year`는 400으로 하고, `SETS`에 등록한다.
- facets에 `humanoid`, `locomotion`, `driving`을 더한다.
- 괄호로 묶은 AND 식이 OpenAlex `title_and_abstract.search`에서 동작하는 것을 실측했다(2026-09-24). 이 수집어로 연도별 걸리는 수:
  - 로봇 쪽: 2014년 1,613편 → 2025년 8,736편
  - 자율주행: 2014년 287편 → 2025년 12,290편
- 수집기(`ingest/collect.py`)는 바꾸지 않는다. 두 세트를 같은 DB에 차례로 모으고, 수집기가 id와 `dedupe_key`로 중복을 거른다.

**장치 선택 — 새 모듈 `backend/constellation/devices.py`.**
- `pick_device(torch) -> "cuda" | "mps" | "cpu"`를 만든다.
- `embed/encoder.py:97`과 `analyze/naming.py:158`이 이 함수를 쓴다.
- `naming.py:173`의 메모리 로그는 CUDA일 때만 `torch.cuda.memory_allocated`를 읽는다.
- 4bit(`--4bit`)는 bitsandbytes가 CUDA 전용이라 MPS에서는 쓰지 않는다. Qwen3-4B는 bf16으로 올려도 약 8GB라 이 Mac의 36GB에 들어간다.
- 단위 테스트는 가짜 torch 모듈로 세 분기를 확인한다.

**실행 환경.**
- `.venv`는 main 체크아웃과 같이 쓴다. `uv pip install -e .`를 워크트리에서 돌리면 editable 설치가 워크트리를 가리키게 되므로 하지 않는다.
- 필요한 패키지만 설치한다: `sentence-transformers umap-learn hdbscan scikit-learn accelerate`
- 파이프라인은 `PYTHONPATH=$PWD/backend ../../.venv/bin/python -m constellation.cli …`로 워크트리 코드를 실행한다. `CONSTELLATION_DATA_DIR`는 명령마다 절대 경로로 준다.
- `accelerate`는 `device_map`에 필요하다. pyproject의 `embed` extra에 추가한다.

**실행 순서.** 명령은 모두 `CONSTELLATION_DATA_DIR=…/data/physical-ai`로 실행한다.

`collect --set physical-ai` → `collect --set physical-ai-driving` → `stats` → `backfill --max 1500` → `enrich` → `stats` → `embed --model scincl --batch 128` → `project --model scincl` → `cluster` → `hierarchy` → `name` → `flow` → `lineage`

**대표 논문 확인.** 수집 전에 19편을 조회했다(OpenAlex, 2026-09-24).
- 수집 단계에서 들어올 논문(12편): RT-2, PaLM-E, OpenVLA, π0, Diffusion Policy, ACT, Open X-Embodiment, VoxPoser, PilotNet, CARLA, nuScenes, UniAD
- 수집어에 걸리지 않아 backfill로 들어와야 하는 논문(4편): RT-1, SayCan, Octo, Code as Policies
- 수집어에는 걸리지만 연도별 순위가 상한 밖인 논문(3편): TransFuser(1,097위), BEVFormer(542위), GAIA-1(742위). OpenAlex가 판본을 나눠 피인용을 세서 순위가 낮다.

결과 문서에는 실제로 들어왔는지를 적는다.

## 버린 대안

- **같은 DB에 모으기.** 파이프라인의 모든 단계가 DB 전체를 읽고 run이 세트를 모른다. RAG 코퍼스와 한 지도로 섞이고, 저장된 UMAP에 끼워 맞춰진다.
- **수집어 하나로 OR.** 자율주행이 해마다 상위 1,200편의 절반 넘게를 차지한다.
- **수집기에 세트 안 할당(strata)을 추가.** 세트 두 개로 같은 결과가 나오고 코드가 바뀌지 않는다.
- **CPU로 돌리기.** Qwen3-4B bf16 생성이 CPU에서는 느리다. MPS 분기는 몇 줄이면 된다.
- **대표 논문을 id로 직접 넣기.** 코퍼스 규칙(수집어 + 피인용 backfill)과 다른 경로로 들어온 논문이 생긴다. 이번에는 결과만 보고하고, 빠지면 수집어를 고친다.

## 함정

- `collect` 기본 세트는 `rag-ir`다. `--set`을 빠뜨리면 새 폴더에 RAG 논문이 들어간다.
- `.env`의 `CONSTELLATION_DATA_DIR` 주석을 풀면 main 체크아웃의 모든 명령이 새 폴더를 쓴다. 폴더는 명령마다 환경 변수로만 준다.
- backfill은 연도 하한이 없다. 1990년대 로봇 고전이 들어올 수 있다. 앱 연도 축이 그만큼 길어진다.
- `name`은 `hierarchy`를 먼저 돌려야 한다. 이름 짓기 결과는 `naming_audit`에 남는다.
- MPS에서 지원되지 않는 연산이 나오면 `PYTORCH_ENABLE_MPS_FALLBACK=1`로 CPU로 넘긴다.

## 완료 기준

- 새 폴더의 DB에 두 세트의 `collections` 행이 13년치씩 있고, `stats`가 작품 수·초록 비율·내부 인용 수를 보고한다.
- `runs`에 `project`·`|cluster`·`|tree`·`|flow`·`|lineage`가 모두 있고, `cluster_tree.label_src`에 `llm`이 있다.
- `constellation-serve`(포트 8003)와 워크트리 프런트엔드로 연 화면을 스크린샷으로 남긴다. 확인할 것은 지도, 상위 분야 이름, 인용선이다.
- 기존 `data/constellation.duckdb`의 수정 시각이 작업 전과 같다.
- `python -m unittest discover -s backend/tests`가 통과한다.
