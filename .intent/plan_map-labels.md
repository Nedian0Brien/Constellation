---
title: 지도 논문 라벨을 높은 배율에서 균일하게 노드 아래에
slug: map-labels
stage: plan
status: accepted
intent: .intent/intent_map-labels.md
spec: .intent/spec_map-labels.md
date: 2026-09-17
---

# 지도 논문 라벨을 높은 배율에서 균일하게 노드 아래에 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `frontend/src/views/map/labels.ts` | `PAPER_LABEL_ZOOM`, `labelLevel` 임계값, `avoidCollisions` → `visibleTitles` |
| `frontend/src/views/map/labels.test.ts` | 임계값·가시 범위 검사 |
| `frontend/src/views/MapView.tsx` | 제목 계산 조건·정렬 제거·배치 |
| `frontend/src/index.css` | `.paper-name` 배치·선택 z-index |
| `frontend/e2e/exploration.spec.ts` | 확대 횟수 |

## 작업 순서

1. `labels.ts`·테스트 → `npm run test -- --run`.
2. `MapView.tsx`·CSS → 브라우저에서 3200%·6400%·12800%를 보고 이동하며 라벨 변화 확인.
3. E2E 갱신 → `test:e2e`. 커밋 하나.

## 가장 위험한 단계

2단계의 밀집 구역. 6400%에서 최대 79편이 한 화면에 들어와 겹칠 수 있다. 겹침은 intent가 받아들인 것이고, 임계값 상수만 올리면 된다.

## 검증

```sh
cd frontend && npm run test -- --run && npm run build && npm run lint && npm run test:e2e
```
