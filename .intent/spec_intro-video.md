---
title: Constellation 소개 영상 (30초)
slug: intro-video
stage: spec
status: accepted
date: 2026-09-26
---

# Spec — Constellation 소개 영상 (30초)

## 구성 (세 편 공통, 장면 시각 `T`와 문구 `COPY`가 같다)

| 시각 | 장면 | 한국어 / 영어 | 데이터 |
|---|---|---|---|
| 0–4초 | 흩어진 점 | 이 분야는 어떻게 생겼을까? / What does a research field look like? | 점 10,604개 |
| 4–10초 | 점이 지도로 모인다 | 논문 10,604편을 한 장의 지도로 / 10,604 papers on one map | 투영 좌표, 상위 분야 20개 이름 |
| 10–16초 | 확대 | 확대하면 분야, 더 확대하면 논문 / Zoom from fields to papers | 잎 분야 45개 이름, DPR 주변 논문 제목 |
| 16–21초 | 인용 | 인용을 따라 흐름을 읽는다 / Follow the citations | DPR(2020)의 코퍼스 안 참고문헌 30편·피인용 19편 |
| 21–26초 | 에이전트 | 물으면 지도가 움직인다 / Ask, and the map moves | 질문 한 줄, 실제 도구 이름(`set_filter`, `fly_to`), 필터 결과 편수는 데이터에서 계산 |
| 26–30초 | 마무리 | Constellation · README 첫 줄 설명 | 앱 아이콘의 점 네 개·선 여섯 개를 `src-tauri/app-icon.png`에서 재어 벡터로 그린다 |

## 요구사항

- R1. 지도·라벨·제목·인용 수는 `export_map.py`가 DB에서 뽑은 `MAP`에서만 온다. 장면 코드에 수치 리터럴을 쓰지 않는다.
- R2. 도구 이름은 `frontend/src/agent/tools.ts`에 있는 이름만 쓴다. 에이전트의 답변 문장은 화면에 쓰지 않는다.
- R3. 영역 라벨은 크기 순으로 놓고, 이미 놓인 라벨과 상자가 겹치면 건너뛴다.
- R4. 세 편 모두 `render.mjs` 검사를 통과한다: `lint` 0건, `determinism` identical, `video` 마지막 줄 OK.
- R5. 음량 목표는 적분 −16 LUFS, 트루 피크 −1 dBFS 이하로 둔다. README 삽입용 공식 기준이 없어 정한 가정이다.

## 파일

- `docs/intro-video/{a,b,c}.scene.js · .head.html · .html` — 본 영상
- `docs/intro-video/frames/` — 스타일 프레임(보존)
- `docs/intro-video/export_map.py` — DB → `MAP` 블록
- MP4는 저장소가 영상 바이너리를 추적하지 않으므로 커밋하지 않고 전달만 한다.
