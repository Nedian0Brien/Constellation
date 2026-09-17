---
title: 지도 논문 라벨을 높은 배율에서 균일하게 노드 아래에
slug: map-labels
stage: spec
status: accepted
intent: .intent/intent_map-labels.md
date: 2026-09-17
---

# 지도 논문 라벨을 높은 배율에서 균일하게 노드 아래에 — 명세

## 요구사항

- [x] `labels.ts`에 `PAPER_LABEL_ZOOM = 6` 상수가 있고 `labelLevel(rz)`는 `rz < 1 → field`, `rz < 6 → topic`, 그 외 `paper`다.
- [x] `avoidCollisions`를 없애고 `visibleTitles(labels, width, height)`를 둔다. 뷰포트 밖(여백 40px)의 라벨만 뺀다. 정렬·개수 제한·겹침 판정이 없어 입력 순서가 보존된다.
- [x] `MapView`는 `rz ≥ PAPER_LABEL_ZOOM - 0.5`일 때만 제목 목록을 만든다(그 아래는 빈 배열). 페이드 아웃 동안 DOM이 남도록 반 단계 여유를 둔다. `data-active`는 `level === "paper"`일 때만 참이다.
- [x] 라벨은 `left: 점 x`, `top: 점 y + 7px`, CSS `transform: translateX(-50%)`, 가운데 정렬이다. 선택한 논문은 `z-index: 1`.
- [x] `labels.test.ts`: `labelLevel(5.9) === "topic"`, `labelLevel(6) === "paper"`, `visibleTitles`가 화면 밖만 빼고 순서를 지키며 개수를 자르지 않는 검사.
- [x] E2E 시나리오 4가 6400% 이상으로 확대해 제목이 보이는지, 축소하면 하위 분야 라벨로 돌아오는지 확인한다.
- [x] `npm run test -- --run`·`build`·`lint`·`test:e2e` 통과. 브라우저에서 6400%·12800%에서 라벨이 점 아래 놓이고 이동해도 라벨이 나타났다 사라지지 않는다.

## 설계

- `labels.ts`: 상수와 두 함수. `PositionedLabel` 유지.
- `MapView.tsx`: `titles` useMemo에서 `avoidCollisions` → `visibleTitles`, 피인용 정렬 제거, 문턱 아래 빈 배열. 렌더에서 `left/top` 계산 단순화.
- `index.css`: `.paper-name` transform·text-align, `[data-selected="true"]` z-index.

## 버린 대안

- 겹침 회피 배치(밀어내기): intent 범위 밖.
- 밀도에 따라 임계값을 자동으로 정하기: 화면마다 라벨이 켜지는 배율이 달라져 "같은 배율에서 균일" 요구와 어긋난다.

## 함정

- 제목 목록 useMemo가 카메라마다 돈다. 문턱 아래에서 빈 배열을 돌려 1만 개 투영을 피한다.
- E2E 4번은 `+`를 눌러 확대한다. 한 번에 0.5씩이므로 6 이상 가려면 12번.

## 완료 기준

```sh
cd frontend && npm run test -- --run && npm run build && npm run lint && npm run test:e2e
```
