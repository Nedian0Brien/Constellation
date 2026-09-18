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

## 구현 중 계획에서 더한 것 — 2026-09-17

- `.paper-name`에 `width: max-content`. absolute 요소는 오른쪽 가장자리 근처에서 남은 폭만큼 줄어들어 라벨이 세로로 길게 접혔다.
- 사용자가 결과를 보고 지시한 대로: 문턱 6 → 5, 하위 분야 단계에서 영역 이름이 화면에 없으면 논문 제목을 켬, 배경 제거, 한 줄 `…` 줄임. `renderRegions`의 가시성 판정을 `shownRegions` useMemo로 빼서 두 곳이 같은 결과를 쓴다.
- 두 번째 지시: `regionRadii`·`clampRegionLabel`·`paperLabelOpacity`를 `labels.ts`에 더하고 테스트 3개 추가. `shownRegions`가 배치 좌표까지 돌려 렌더가 그대로 쓴다. `.region-name`·`.paper-name`의 `opacity`는 인라인으로 옮기고 CSS는 포인터 이벤트만 켠다.
- 세 번째 지시(겹침): `labels.ts`에 `LabelBox`·`revealZooms`·`labelOpacity`. `MapView`는 지도마다 제목 폭을 재고(`widths`), 필터에 든 논문으로 `boxes` → `reveals`를 만들어 제목마다 불투명도를 준다. `visibleTitles`는 제네릭으로 바꿔 `reveal` 필드를 그대로 넘긴다. 단위 테스트 7개(무작위 단조·겹침 검사 포함), E2E는 DOM 상자 겹침 0과 이동 뒤 `data-active` 보존을 본다. 실측(SciNCL 10,604편): 폭 측정 47ms, 배율 계산 40ms, 6400%에서 66%·12800%에서 85%·25600%에서 95%가 켜진다.
- 네 번째 지시(자리가 있으면 켠다): `revealZooms`를 힙 기반 스윕으로 바꿨다. 바닥에서 피인용순 배치 → 막힌 라벨을 "켜진 이웃과 떨어지는 배율" 순으로 켠다. 꺼낼 때는 켜진 순서 도장으로 새로 켜진 이웃만 본다(336ms → 70–80ms). 테스트 1개 추가, 무작위 검사에 "안 켜진 라벨은 켜진 라벨과 겹침" 불변식 추가. 실데이터 켜짐 비율은 6400% 68%·12800% 86%·25600% 95%로 거의 같고, 남은 5%는 켜진 이웃과 실제로 겹치는 것뿐이다.
- 다섯 번째 지시(쌓기): `revealZooms`가 `{zoom, row, unresolved}`를 돌려주고 `maxZoom`을 받는다. 0줄로 최대 배율 한 단계 아래까지 못 켜지면 `chooseRow`가 1~4줄 중 되는 첫 줄을 고른다. 줄 격자를 0줄과 분리하고 이웃 창을 열쇠 기준으로 좁혀 실데이터 110~150ms. `MapView`는 `settledHome`(250ms 디바운스)로 실제 기준 배율에 맞춰 계산하고 `top`에 `24·row`를 더한다. `ZOOM_RANGE` 상수로 최대 배율을 한 곳에 뒀다. 테스트 2개 추가·무작위 검사 확장. 실측: 15% 쌓임, 25600%에서 안 켜짐 509 → 61편.
- 확대·축소 렉(사용자 보고): `titles`가 매 프레임 1만 점을 `viewport.project`하고 불투명도 0인 제목까지 DOM에 두던 것을, 화면 범위로 먼저 걸러 투영하고 보이는 것만 만들도록 바꿨다. 영역 이름은 켜진 것만 옮긴다. 그 과정에서 deck viewState의 `zoomX`·`zoomY`를 카메라에 저장하던 버그를 찾아 고쳤다(휠 확대 뒤 키 확대가 지도를 못 움직임). 개발 서버 15ms → 5.6ms, 프로덕션 2.9~4.3ms/단계.
- 여섯 번째 지시(제목을 GPU로): `MapView`의 `.paper-name` 버튼을 `TextLayer`로 바꿨다. `labels.ts`에 `truncateTitle`, `map/text-snap.ts`에 세로 픽셀 맞춤 확장. 글자 폭 표 → 상자 폭·줄임을 지도마다 한 번(약 70ms). 제목 배열은 카메라 칸(240px·반 단계)마다. 글꼴 아틀라스는 `_getFontRenderer`로 DOM과 같은 래스터. E2E는 `__map` 다리로. 테스트 1개 추가. 실측은 spec 함정에.
- 일곱 번째 지시(전환 페이드·영역 배경): `hooks/use-tween.ts`, `labels.ts`의 `paperTitleOpacity`, `.region-name` 키프레임. `regions.ts`의 텍스처를 `regionBlobs`로, `map/region-gradient.ts`의 셰이더 확장으로 그린다. 테스트 1개 추가. 실측은 spec 함정에.
