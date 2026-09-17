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
- [x] `revealZooms(boxes, floor, height)`가 논문마다 켜지는 절대 배율(log2 px/단위)을 준다. 피인용순(같으면 입력 순)으로 보며 앞선 이웃 j와 떨어지는 배율 s = min(((w_i+w_j)/2)/|dx|, h/|dy|)을 재고, s > reveal_j이면 i는 s까지 기다린다. 바닥보다 낮은 값은 -Infinity, 같은 자리는 Infinity. 격자(바닥 배율에서 라벨이 닿는 거리)로 이웃만 본다.
- [x] `labelOpacity(zoom, reveal, floor)` = clamp(zoom − max(reveal, floor), 0, 1). `paperLabelOpacity`는 reveal = -Infinity, floor = PAPER_LABEL_ZOOM − 0.5인 경우다.
- [x] `MapView`: 제목 폭은 캔버스 `measureText`(11px, body 글꼴)로 지도마다 한 번 잰다(캔버스가 없으면 글자 수 × 6). 상자 폭 = min(220, 글자 폭 + 8) + 8, 높이 24. `boxes`는 필터에 든 유한 좌표 논문, `reveals`는 `[boxes, home.zoom]`에 memo. 바닥은 상위 분야 단계 Infinity, 하위 분야 단계에서 영역 이름이 없으면 -Infinity, 그 외 `home.zoom + PAPER_LABEL_ZOOM − 0.5`. 제목마다 `labelOpacity(camera.zoom, reveal, floor)`를 인라인 `opacity`로, `data-active`는 0보다 클 때. 선택한 논문은 `labelOpacity(camera.zoom, -Infinity, floor)`.
- [x] `labels.test.ts`: 떨어진 쌍은 비구속, 가까운 쌍은 낮은 우선순위가 log2(200)에서 켜짐, 세로 분리, 바닥 아래 무시·입력 순 동률, 같은 자리 Infinity, 막힌 이웃보다 먼저 켜지는 사슬, 무작위 600개에서 배율 단조·겹침 0 검사.
- [x] E2E 시나리오 4: 3200% 이상에서 켜진 제목의 DOM 상자끼리 겹치지 않고, 이동 뒤에도 화면에 남은 제목의 `data-active`가 그대로다.
- [x] `npm run test -- --run`·`build`·`lint`·`test:e2e` 통과. 브라우저에서 3200%·6400%에서 켜진 라벨이 겹치지 않고(DOM 상자 검사 0쌍), 이동해도 라벨의 불투명도가 바뀌지 않는다(39개 공통 라벨 변화 0).

## 설계

- `labels.ts`: 상수와 두 함수. `PositionedLabel` 유지.
- `MapView.tsx`: `titles` useMemo에서 `avoidCollisions` → `visibleTitles`, 피인용 정렬 제거, 문턱 아래 빈 배열. 렌더에서 `left/top` 계산 단순화.
- `index.css`: `.paper-name` transform·text-align, `[data-selected="true"]` z-index.

## 버린 대안

- 겹침 회피 배치(밀어내기·리더 라인): 위치가 이웃에 따라 흔들려 다른 불안정이 생긴다. intent 범위 밖.
- 밀도에 따라 임계값을 자동으로 정하기: 화면마다 라벨이 켜지는 배율이 달라진다.
- 문턱만 더 올리기: 빽빽한 핵심부는 어떤 배율에서도 겹친다(6400%에서도 겹쳤다).
- 화면 기준 겹침 억제(이전 `avoidCollisions`): 이동하면 라벨이 바뀌어 깜빡인다 — 사용자가 처음 금한 것.
- 필터와 무관하게 전체 논문으로 자리를 정하기: 이동 안정성은 같지만 검색 결과 논문의 제목이 보이지 않는 이웃에 막힌다.

## 함정

- 제목 목록 useMemo가 카메라마다 돈다. 문턱 아래에서 빈 배열을 돌려 1만 개 투영을 피한다.
- `revealZooms`는 절대 배율로 계산한다. 상대 배율로 하면 창 크기(`homeCamera`)가 바뀔 때 값이 어긋난다. 바닥(`home.zoom`)이 바뀌면 다시 계산하지만 실측 40ms다.
- 바닥보다 낮은 분리 배율을 버려도 결과는 같다: reveal = max(바닥, 구속)이고, 바닥 아래 구속은 어차피 바닥이 가린다(귀납으로 확인).
- E2E 4번은 `+`를 눌러 확대한다. 한 번에 0.5씩이므로 6 이상 가려면 12번.

## 완료 기준

```sh
cd frontend && npm run test -- --run && npm run build && npm run lint && npm run test:e2e
```
