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

- [x] `labels.ts`에 `PAPER_LABEL_ZOOM = 5` 상수가 있고 `labelLevel(rz)`는 `rz < 1 → field`, `rz < 5 → topic`, 그 외 `paper`다.
- [x] `avoidCollisions`를 없애고 `visibleTitles(labels, width, height)`를 둔다. 뷰포트 밖(여백 40px)의 라벨만 뺀다. 정렬·개수 제한·겹침 판정이 없어 입력 순서가 보존된다.
- [x] `MapView`는 하위 분야 단계부터 제목 목록을 만든다(상위 분야 단계는 빈 배열). 제목은 `level === "paper"`이거나 하위 분야 단계에서 켜진 영역 이름이 0개일 때 켜진다(`data-paper-labels`). 영역 라벨 가시성(화면 안·겹침)은 `shownRegions` 한 곳에서 계산해 렌더와 이 판정이 같이 쓴다.
- [x] 라벨은 `left: 점 x`, `top: 점 y + 7px`, CSS `transform: translateX(-50%)`, 가운데 정렬, 배경 없음(그림자만), 한 줄 `…` 줄임(220px), `title` 속성에 전문. 선택한 논문은 `z-index: 1`.
- [x] `paperLabelOpacity(rz)`가 `PAPER_LABEL_ZOOM ± 0.5` 사이를 0→1로 잇는다. 논문 제목은 이 값을 인라인 `opacity`로 받고, 영역 이름은 `1 - 값`이다. `data-active`는 포인터 이벤트만 정한다.
- [x] `regionRadii(map, tree, clusters)`가 영역별 반지름(소속 논문 거리 90분위)을 준다. 영역 중심이 화면 밖이어도 화면 중앙이 반지름 안이면 `clampRegionLabel`로 가장자리에 붙인다. 하위 분야 이름은 `rz < PAPER_LABEL_ZOOM + 0.5`까지 남는다.
- [x] `labels.test.ts`: `labelLevel(5.9) === "topic"`, `labelLevel(6) === "paper"`, `visibleTitles`가 화면 밖만 빼고 순서를 지키며 개수를 자르지 않는 검사.
- [x] E2E 시나리오 4가 하위 분야 단계에서 영역 이름과 논문 제목 중 하나만 켜져 있는지, 3200% 이상에서 제목이 보이는지, 축소하면 상위 분야로 돌아오는지 확인한다.
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
