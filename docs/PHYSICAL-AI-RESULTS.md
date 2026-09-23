# 피지컬 AI 코퍼스 — 수집·분석 결과

측정일 2026-09-24 · 데이터 `data/physical-ai/`(git 밖, 542MB) · 임베딩 SciNCL · 장치 Apple M4 Max(MPS)

## 요약

- **규모:** 16,554편(2014–2026년 수집 15,409편 + backfill 1,145편)
- **초록 비율:** 88.1%
- **코퍼스 안 인용:** 136,442개, 논문 한 편당 8.2개(RAG 코퍼스는 5.9개)
- **분류:** 클러스터 78개, 미분류 4,887편(30%). 계층 트리는 상위 분야 8개, 하위 분야 18개, 주제 78개이고, 이름 155개는 모두 LLM이 지었다.
- **대표 논문:** 19편 중 16편이 들어왔다.
- **소요 시간:** 수집부터 계보까지 약 15분. 모델 다운로드 약 3분이 포함된다.

## 수집 설정

| 세트 | 수집어 | 연 상한 | 수집 | 새로 들어온 수 |
|---|---|---:|---:|---:|
| `physical-ai` | 로봇 학습·조작, 체화 AI, VLA, sim-to-real, 월드 모델·모방 학습(로봇 맥락 AND), 휴머노이드, 다리 보행 — 18개 | 800 | 10,377 | 10,377 |
| `physical-ai-driving` | autonomous driving, self-driving, end-to-end driving | 400 | 5,075 | 5,032 |

- 해마다 두 세트를 합쳐 최대 1,200편이다. 두 세트가 겹친 43편은 한 번만 들어갔다.
- 수집어에 걸리는 논문은 로봇 쪽이 2014년 1,613편에서 2026년 15,495편, 자율주행이 2014년 287편에서 2025년 12,290편이다. 자율주행 2014년만 상한(400)에 못 미쳐 286편을 받았다.
- OpenAlex는 괄호로 묶은 AND 식을 `(stemmed "world model" and (embodied or robot or robotic))`로 해석했다. 원본 페이지의 `x_query.oql`에서 확인했다.
- backfill은 코퍼스가 두 번 이상 인용한 외부 논문 1,500편을 요청했고, 그중 1,145편을 받았다. 연도 하한이 없어 코퍼스는 1948년(Shannon)부터 시작한다.
- `enrich`로 초록 644편을 더 채웠다. 초록 비율은 84.5%에서 88.1%가 됐다.

## 대표 논문

수집 전에 고른 19편이다. "코퍼스 피인용"은 코퍼스 안의 논문이 그 논문을 인용한 수다.

| 논문 | 연도 | 경로 | 코퍼스 피인용 |
|---|---:|---|---:|
| RT-1 | 2023 | backfill | 135 |
| RT-2 | 2023 | physical-ai | 49 |
| SayCan | 2022 | backfill | 58 |
| PaLM-E | 2023 | physical-ai | 33 |
| OpenVLA | 2024 | physical-ai | 6 |
| Octo | — | 없음 | — |
| π0 | 2025 | physical-ai | 42 |
| Diffusion Policy | 2024 | physical-ai | 64 |
| ACT/ALOHA | 2023 | physical-ai | 111 |
| Open X-Embodiment | 2024 | physical-ai | 27 |
| Code as Policies | 2023 | backfill | 73 |
| VoxPoser | 2023 | physical-ai | 19 |
| PilotNet | 2016 | physical-ai-driving | 273 |
| CARLA | 2017 | physical-ai-driving | 28 |
| nuScenes | 2020 | physical-ai-driving | 30 |
| TransFuser | — | 없음 | — |
| BEVFormer | 2022 | physical-ai-driving | 126 |
| UniAD | 2023 | physical-ai-driving | 101 |
| GAIA-1 | — | 없음 | — |

- 수집어에 걸리지 않던 RT-1, SayCan, Code as Policies는 코퍼스가 많이 인용해 backfill로 들어왔다.
- BEVFormer는 수집 전 조회에서 542위였다. 피인용 수가 더 높게 잡힌 다른 판본(1,323회)이 수집에 들어왔다.
- 빠진 세 편은 코퍼스 규칙(수집어 + backfill)으로 들어오지 못했다.
  - Octo: 수집어에 걸리지 않았고, backfill 상위 1,500편에도 들지 못했다.
  - TransFuser, GAIA-1: OpenAlex에서 판본이 나뉘어 피인용이 낮게 잡혔고(수집 전 순위 1,097위, 742위), backfill에도 들지 못했다.

## 분야 구성

상위 분야 8개(편수): Legged Robot Locomotion 3,293 · Mixed: Point Cloud and Object Detection 1,513 · Imitation and Reinforcement Learning 1,465 · Social Robotics and Care 1,263 · Embodied Intelligence and Ethics 1,190 · Edge Traffic Intelligence 1,159 · Soft Tactile Manipulation 953 · Mixed: Ethical Mobility and Security Networks 831

하위 분야 18개를 들어온 경로별로 나눴다. 미분류 논문은 뺐다.

| 하위 분야 | 편수 | 로봇 세트 | 자율주행 세트 | backfill |
|---|---:|---:|---:|---:|
| Legged Robot Locomotion | 3,293 | 3,070 | 14 | 209 |
| Social Robotics and Trust | 1,019 | 946 | 20 | 53 |
| Imitation and Reinforcement Learning | 994 | 907 | 8 | 79 |
| Semantic Point Cloud Understanding | 694 | 52 | 532 | 110 |
| Mixed: Embodied Cognition and Ethical Discovery | 631 | 381 | 214 | 36 |
| Reinforcement Learning and LLMs for Traffic | 623 | 54 | 546 | 23 |
| Mixed: Object Detection and Automotive Sensing | 595 | 28 | 500 | 67 |
| Mixed: Embodied Intelligence and Spiking Systems | 559 | 422 | 110 | 27 |
| Vehicular Edge Intelligence | 536 | 22 | 495 | 19 |
| Soft Tactile Actuation | 474 | 431 | 16 | 27 |
| Manipulation and Motion Planning | 471 | 384 | 11 | 76 |
| Manipulation in Humanoid Robots | 378 | 353 | 0 | 25 |
| Federated Vehicle Security | 291 | 21 | 268 | 2 |
| Ethical Mobility in Vehicles | 289 | 5 | 272 | 12 |
| Mixed: Adversarial and Convolutional Neural Networks | 251 | 25 | 131 | 95 |
| Mixed: HCI and Educational Robotics | 244 | 225 | 15 | 4 |
| Urban Localization and SLAM | 224 | 38 | 154 | 32 |
| Robot-Assisted Surgical Learning | 101 | 100 | 1 | 0 |

- 인용 계보의 메인 패스는 26편이다. 사족 보행 연구가 이어져 온 길이 나왔다: "Learning quadrupedal locomotion over challenging terrain"(2020) → "ANYmal parkour"(2024) → 이족 보행 월드 모델(2026).
- 갈래 흐름은 창 4개(2014–2016, 2017–2019, 2020–2022, 2023–2026), 클러스터 30개, 흐름 72개다. 흐름 72개 중 69개(96%)는 인용 근거가 있다.

## 주제 밖 논문

수집어가 다른 분야의 말과 겹쳐 들어온 덩어리가 있다. LLM이 지은 이름, 수집 세트로 들어온 논문 중 피인용 상위 6편, 경로별 수를 보고 판단했다.

| 하위 분야 | 편수 | 판단 | 근거 |
|---|---:|---|---|
| Federated Vehicle Security | 291 | 대부분 주제 밖 | 차량 사이버보안, 블록체인, 전기차 충전. 자율주행을 언급하는 보안·에너지 논문 |
| Mixed: Embodied Cognition and Ethical Discovery | 631 | 대부분 주제 밖 | AI 윤리·거버넌스, 화학공학 AI, 체화 인지 철학 같은 일반 AI 논의. 로봇 세트로 381편, 자율주행 세트로 214편이 들어왔다. 어느 수집어에 걸렸는지는 따로 확인하지 않았다 |
| Vehicular Edge Intelligence | 536 | 절반가량 주제 밖 | 모바일 엣지 컴퓨팅, 6G IoT와 자율주행 모션 플래닝이 섞였다 |
| Ethical Mobility in Vehicles | 289 | 주변 | 자율주행차 수용성·운전자 행동 연구(인간 요인). 기술 논문은 아니다 |
| Social Robotics and Trust | 1,019 | 주변 | 소셜 로봇·HRI. 로보틱스지만 제어·학습 중심의 피지컬 AI와 거리가 있다 |

- 앞의 세 덩어리를 합치면 약 1,460편(수집 논문의 9%)이 핵심 밖이다. RAG 코퍼스의 20%(M2-RESULTS.md)보다 적다.
- 미분류 4,887편은 로봇 세트 2,913편, 자율주행 세트 1,726편, backfill 248편이다. RAG 코퍼스의 미분류(14%)보다 비율이 높다. 클러스터 설정은 RAG와 같은 `umap10 / eom / min_cluster_size=30`으로 두었다.
- 이번에는 규모만 보고하고 걸러 내지 않았다(intent 범위 밖).

## 분야 이름

- `name`은 Qwen3-4B-Instruct-2507을 MPS(bf16)에서 돌려 155개 노드에 이름을 붙였다. 생성에 걸린 시간은 106초(개당 0.7초)다.
- 16개 이름이 "Mixed: A and B" 형식이다. 이름 짓기 프롬프트는 성격이 섞인 덩어리에 이 형식을 쓰라고 지시한다(`analyze/naming.py:56`). 앱은 이 이름을 그대로 보여 준다.
- RAG 코퍼스의 이름은 이 CLI가 아니라 `codex/gpt-5.6-luna`로 지은 것이라(`naming_audit.model`), "Mixed" 이름이 하나도 없다. 두 코퍼스의 이름 품질을 맞추려면 같은 방식으로 다시 지어야 한다.

## 단계별 시간

| 단계 | 시간 |
|---|---:|
| collect physical-ai | 135초 |
| collect physical-ai-driving | 65초 |
| backfill --max 1500 | 39초 |
| enrich | 51초 |
| embed scincl --batch 128 (MPS) | 235초 |
| project | 34초 |
| cluster | 19초 |
| hierarchy | 1초 미만 |
| name (Qwen3-4B, MPS) | 298초 (다운로드 포함, 생성 106초) |
| flow | 21초 |
| lineage | 1초 |

## 앱에서 확인

- `constellation-serve --db data/physical-ai/constellation.duckdb --port 8003`에 프런트엔드를 붙여 열었다.
- run 목록에 scincl 하나가 보이고, 지도에 16,554편과 상위 분야 이름이 나온다.
- 피인용 상위 논문 위에 머물면 인용선과 이웃 제목이 켜진다.
- 기존 `data/constellation.duckdb`, `data/embeddings/`, `data/models/`의 수정 시각은 작업 전과 같다.
