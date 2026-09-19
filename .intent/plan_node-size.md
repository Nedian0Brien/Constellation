---
title: 지도의 점 크기가 어떤 색 모드에서든 피인용수를 보여 주게
slug: node-size
stage: plan
status: accepted
intent: .intent/intent_node-size.md
spec: .intent/spec_node-size.md
date: 2026-09-19
---

# 지도의 점 크기가 어떤 색 모드에서든 피인용수를 보여 주게 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `frontend/src/views/map/edges.ts` | `DOT_RADIUS_MIN`·`DOT_RADIUS_BASE_MAX`·`DOT_CITED_CAP`·`DOT_RADIUS_GAMMA`, `dotRadius(cited)` |
| `frontend/src/views/map/edges.test.ts` | `dotRadius` 테스트 |
| `frontend/src/views/MapView.tsx` | `radii` 배열, `baseRadius`에서 색 모드 분기 제거, `updateTriggers`, 각주 |
| `docs/design-system/index.html` | "논문의 크기와 선택" 견본 문구·점 크기 |
| `docs/design-system/README.md` | 변경 이력 한 줄 |

## 작업 순서

1. `edges.ts`에 `dotRadius`와 테스트 — `npm run test -- --run edges`.
2. `MapView.tsx` — `radii`·`baseRadius`·`updateTriggers`·각주. `npm run lint && npm run build`.
3. 브라우저(`constellation-web` 5173, API 8000)에서 100%·주제 색으로 허브와 보통 논문의 크기, 색 모드 전환 시 크기 불변, 3200%에서 상한, 각주. 필요하면 상수 넷을 조정하고 spec 표를 같이 고친다.
4. 디자인 시스템 문서 문구.
5. 커밋 `feat: 지도의 점 크기가 어떤 색 모드에서든 피인용수를 따르게`, 푸시, PR.

## 가장 위험한 단계

3단계 — 값이 화면에서 뭉치거나 밋밋할 수 있다. 상수 넷만 바꾸면 되고, 되돌리려면 `dotRadius`를 상수 1.5로 두면 지금과 같다.

## 검증

```sh
cd frontend && npm run test -- --run && npm run lint && npm run build   # 50/50, 빌드 통과
E2E_PORT=5177 npm run test:e2e                                      # 12/12
```

화면: 지도 100%에서 허브(예: 피인용 ≥ 10,000)와 보통 논문을 같은 화면에서 스크린샷. 색 모드 "연구 주제"와 "피인용수"에서 점 크기가 같은지. 3200%에서 큰 점이 7px에 걸리고 제목과 겹치지 않는지. 각주 문구.
