# 피지컬 AI 코퍼스 — 수집·분석 결과

측정일 2026-09-24 · 데이터 `data/physical-ai/`(git 밖, 542MB) · 임베딩 SciNCL · 장치 Apple M4 Max(MPS)

## 요약

- **규모:** 16,554편(2014–2026년 수집 15,409편 + backfill 1,145편)
- **초록 비율:** 88.1%
- **코퍼스 안 인용:** 136,442개, 논문 한 편당 8.2개(RAG 코퍼스는 5.9개)
- **분류:** 클러스터 78개, 미분류 4,887편(30%). 지도 레벨은 상위 27개 / 하위 31개 / 주제 78개다. 이름은 155개 중 151개를 LLM(`gpt-6-luna`)이 지었다.
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
- 빠진 세 편은 수집에서도 backfill에서도 들어오지 않았다.
  - Octo: 수집어에 걸리지 않았다.
  - TransFuser, GAIA-1: 수집어에는 걸리지만, OpenAlex가 판본을 나눠 피인용을 낮게 세서 연도별 상한 밖이었다(수집 전 순위 1,097위, 742위).
  - backfill에서 빠진 이유는 확인하지 않았다. 코퍼스 안 인용이 상위 1,500편에 못 들었을 수도 있고, 요청한 1,500편 중 받지 못한 355편에 들었을 수도 있다.

## 분야 구성

- 계층 트리는 `--levels 8,18`로 잘랐다.
- 이름 짓기가 성격이 섞인 노드를 자식 둘로 갈라, 지도 레벨은 상위 27개 / 하위 31개 / 주제 78개다. RAG 코퍼스는 20 / 32 / 45개다.
- 편수 100편 이상인 상위 분야(레벨 0): Robot Locomotion 3,293 · Automotive Scene Understanding 1,513 · Robot Learning 1,465 · Autonomous Driving 1,159 · Human-Robot Interaction 1,019 · Soft Robotics 474 · Embodied Cognition 339 · Automotive Cybersecurity 291 · Autonomous Vehicle Human Factors 289 · Adversarial Computer Vision 251 · Embodied Language Agents 246 · Autonomous Scientific Discovery 191 · Robot Grasping 155 · Humanoid Robotics 128 · Neuromorphic Computing 123 · Autonomous Robot Navigation 107 · Medical Robotics 101 · AI Ethics · Mental Health 101

하위 분야(레벨 1) 가운데 200편 이상인 것을 들어온 경로별로 나눴다. 미분류 논문은 뺐다.

| 노드 | 하위 분야 | 편수 | 로봇 세트 | 자율주행 세트 | backfill |
|---:|---|---:|---:|---:|---:|
| 128 | Robot Locomotion | 3,293 | 3,070 | 14 | 209 |
| 137 | Human-Robot Interaction | 1,019 | 946 | 20 | 53 |
| 124 | Robot Learning | 994 | 907 | 8 | 79 |
| 134 | object detection · point cloud · segmentation(키워드 라벨) | 694 | 52 | 532 | 110 |
| 131 | Autonomous Driving | 623 | 54 | 546 | 23 |
| 135 | Automotive Vision | 595 | 28 | 500 | 67 |
| 130 | Automotive Systems | 536 | 22 | 495 | 19 |
| 117 | Soft Robotics | 474 | 431 | 16 | 27 |
| 125 | Robot Motion Planning | 471 | 384 | 11 | 76 |
| 104 | Embodied Cognition | 339 | 308 | 12 | 19 |
| 116 | Automotive Cybersecurity | 291 | 21 | 268 | 2 |
| 111 | Autonomous Vehicle Human Factors | 289 | 5 | 272 | 12 |
| 120 | Adversarial Computer Vision | 251 | 25 | 131 | 95 |
| 71 | Embodied Language Agents | 246 | 223 | 8 | 15 |
| 99 | Localization and Mapping | 224 | 38 | 154 | 32 |

- 인용 계보의 메인 패스는 26편이다. 사족 보행 연구가 이어져 온 길이 나왔다: "Learning quadrupedal locomotion over challenging terrain"(2020) → "ANYmal parkour"(2024) → 이족 보행 월드 모델(2026).
- 갈래 흐름은 창 4개(2014–2016, 2017–2019, 2020–2022, 2023–2026), 클러스터 30개, 흐름 72개다. 흐름 72개 중 69개(96%)는 인용 근거가 있다.

## 주제 밖 논문

수집어가 다른 분야의 말과 겹쳐 들어온 덩어리가 있다. 판단에는 세 가지를 봤다: LLM이 지은 이름, 수집 세트로 들어온 논문 중 피인용 상위 6편, 경로별 수. 판단은 Qwen으로 처음 이름을 지었을 때 했고, 노드 id로 새 이름에 옮겼다.

| 노드 | 하위 분야 | 편수 | 판단 | 근거 |
|---:|---|---:|---|---|
| 116 | Automotive Cybersecurity | 291 | 대부분 주제 밖 | 차량 사이버보안, 블록체인, 전기차 충전. 자율주행을 언급하는 보안·에너지 논문 |
| 104, 1, 40 | Embodied Cognition · Autonomous Scientific Discovery · AI Ethics · Mental Health | 339 + 191 + 101 | 대부분 주제 밖 | AI 윤리·거버넌스, 화학공학 AI, 체화 인지 철학 같은 일반 AI 논의. 로봇 세트로 381편, 자율주행 세트로 214편이 들어왔다. 어느 수집어에 걸렸는지는 따로 확인하지 않았다 |
| 130 | Automotive Systems | 536 | 절반가량 주제 밖 | 모바일 엣지 컴퓨팅, 6G IoT와 자율주행 모션 플래닝이 섞였다 |
| 111 | Autonomous Vehicle Human Factors | 289 | 주변 | 자율주행차 수용성·운전자 행동 연구(인간 요인). 기술 논문은 아니다 |
| 137 | Human-Robot Interaction | 1,019 | 주변 | 소셜 로봇·HRI. 로보틱스지만 제어·학습 중심의 피지컬 AI와 거리가 있다 |

- 앞의 세 줄을 합치면 약 1,460편(수집 논문의 9%)이 핵심 밖이다. RAG 코퍼스의 20%(M2-RESULTS.md)보다 적다.
- 미분류 4,887편은 로봇 세트 2,913편, 자율주행 세트 1,726편, backfill 248편이다. RAG 코퍼스의 미분류(14%)보다 비율이 높다. 클러스터 설정은 RAG와 같은 `umap10 / eom / min_cluster_size=30`으로 두었다.
- 이번에는 규모만 보고하고 걸러 내지 않았다(intent 범위 밖).

## 분야 이름

- **최종 이름:** `constellation name`(codex 백엔드, `gpt-6-luna`)으로 155개 노드에 이름을 붙였다.
  - 걸린 시간은 61초다.
  - 키워드(c-TF-IDF) 라벨로 남은 노드는 4개다. 지도 레벨에 보이는 것은 레벨 1의 노드 134(694편) 하나다.
  - "Mixed:" 이름은 없고, 같은 레벨 안의 중복 이름도 없다.
- **이름 중복 규칙:** 처음에는 트리 전체에서 이름이 겹치지 않아야 했다. 이 규칙에서는 내부 노드 31개가 거절돼 키워드 라벨로 남았다.
  - 원인: 자식 하나가 대부분인 부모를 모델이 자식과 같은 이름으로 불렀다. 거절 사유는 모두 이름 중복이었고, 형식 불량은 0건이었다.
  - 조상·자손 사이에는 같은 이름을 허용하도록 규칙을 바꿨다(사용자 결정, PR #20). 이 규칙에서도 같은 레벨 안의 중복은 막힌다.
  - 이름을 다시 짓기 전에 `hierarchy`를 다시 돌려 원래 절단(8 / 18 / 78)에서 시작했다.
- **처음 이름(Qwen3-4B, 로컬 MPS):** 16개가 "Mixed: A and B" 형식이었다. 그 DB는 `constellation.duckdb.bak-qwen`으로 남겨 두었다.
- **모델 응답의 비결정성:** 같은 입력으로 두 번 돌리면 모델 응답이 조금씩 달라, 불응집으로 가르는 노드도 달라진다.

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
| name (Qwen3-4B, MPS, 처음) | 298초 (다운로드 포함, 생성 106초) |
| hierarchy + name (codex gpt-6-luna, 최종) | 62초 |
| flow | 21초 |
| lineage | 1초 |

## 앱에서 확인

- `constellation-serve --db data/physical-ai/constellation.duckdb --port 8003`에 프런트엔드를 붙여 열었다.
- run 목록에 scincl 하나가 보이고, 지도에 16,554편과 상위 분야 이름이 나온다.
- 피인용 상위 논문 위에 머물면 인용선과 이웃 제목이 켜진다.
- 새 탭에서 다시 연 페이지의 콘솔 오류는 0건이다. 화면은 세션 안에서 확인했고, 이미지 파일로 저장하지는 않았다.
- 데스크톱 앱의 "데이터베이스 열기"로 여는 경로는 시험하지 않았다.
- 임베딩과 이름 짓기는 `PYTORCH_ENABLE_MPS_FALLBACK=1`을 켠 채 돌렸다. 이 설정 없이도 도는지는 확인하지 않았다.
- 기존 `data/constellation.duckdb`, `data/embeddings/`, `data/models/`의 수정 시각은 작업 전과 같다.
