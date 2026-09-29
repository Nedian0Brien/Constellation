---
title: 재생 중 점·영역 이름·영역 배경이 부드럽게 나타난다
slug: playhead-fade
stage: spec
status: accepted
intent: .intent/intent_playhead-fade.md
date: 2026-09-22
---

# 재생 중 부드러운 등장 — 명세

## 요구사항

- [ ] 재생 중 헤드가 `h`(소수 연도)일 때 연도 `Y`의 점은 알파·크기 배율이 `1 − smoothstep(h−1, h, Y)`다: `h = Y`에서 0, `h = Y+1`에서 1. 헤드가 없거나(정지) 동작 줄이기면 범위 안의 점은 배율 1, 밖은 그리지 않는다.
- [ ] 배율 0인 점은 그리지도, 픽킹(호버·클릭)하지도 않는다 — `DataFilterExtension`이 `dataFilter_value == 0`이면 `discard`한다(`shader-module.js` `fs:DECKGL_FILTER_COLOR`).
- [ ] 연도가 없는 논문은 지금처럼 범위와 무관하게 늘 보인다.
- [ ] 영역 배경(`soft-regions`)의 알파는 `clusterShare`가 바뀔 때 240ms에 걸쳐 이어진다(동작 줄이기면 즉시).
- [ ] 영역 이름은 처음 만들어질 때도 240ms 페이드인한다(동작 줄이기는 전역 규칙이 animation을 끈다).
- [ ] 재생 중 지도는 프레임마다 다시 그리되 점 속성(`getFilterValue`)은 `from`이 바뀔 때만 다시 만든다.
- [ ] 편수·인용선·이웃 필터(`ids`, `inYears`)는 지금처럼 정수 연도(`floor(h)`)로 갱신된다.
- [ ] 기존 E2E "year playhead"가 그대로 통과한다.

## 설계

**스토어 — `use-playhead.ts`.** 값을 소수 연도로 바꾼다. `setPlayhead(h | undefined)`는 YearRange의 rAF 루프가 프레임마다 부른다. 두 훅:
- `usePlayhead()` — `getSnapshot`이 `Math.floor(h)`를 돌려준다. 같은 값이면 React가 다시 그리지 않으므로 소비처(`use-analysis`)는 한 해를 넘을 때만 갱신된다. 지금과 같다.
- `usePlayheadExact()` — 소수 값 그대로. MapView만 쓴다(프레임마다).

**YearRange.** 루프에서 `setPlayhead(Math.min(to + 1 − ε, Math.max(from, head)))` 대신 `setPlayhead(head)`를 그대로 쓴다 — `head < to + 1`인 동안만 부르므로 `floor(head) ≤ to`다. 시작·일시정지·멈춤은 그대로.

**MapView — 점 레이어(`papers`).** `data: points`(전부)로 바꾸고 `DataFilterExtension({ filterSize: 1 })`을 붙인다.
- `lower = state.from ?? yearLo`(데이터 최소 연도), `upper = head ?? state.to ?? yearHi`.
- `getFilterValue`: 연도 있으면 그 해, 없으면 `lower − 1`, 범위 아래면 `lower − 2`. `filterRange: [lower − 1, upper]`라 연도 없는 논문은 늘 통과하고 소프트 상한(`upper − 1 ≥ lower − 1`) 아래라 첫 프레임(`h = from`)에도 온전히 보인다(하한을 `lower`로 두면 `h = from`에서 `smoothstep(from−1, from, from) = 1`이라 사라진다). `updateTriggers.getFilterValue: [yearValue]`.
- 재생 중이고 동작 줄이기가 아니면 `filterSoftRange: [lower − 1, upper − 1]`, 아니면 없음. `softMin = min`이라 아래쪽은 계단, 위쪽만 1년 폭으로 옅어진다. `filterTransformSize`·`filterTransformColor`는 기본값 true(작아지고 옅어진다). `radiusMinPixels`가 1.3px로 받치지만 알파가 함께 0으로 가므로 보이지 않는다.
- `shownPoints`는 `clusterShare`에만 남는다.

**MapView — 영역 배경.** `soft-regions`에 `transitions: reduced ? undefined : { getFillColor: LABEL_FADE_MS }`. `blobs`는 run마다 고정이라 인덱스 기준 보간이 옳다.

**MapView — `RegionName`.** CSS만: `.region-name[data-active="true"] { animation: region-name-in 240ms var(--ease) }`, `@keyframes region-name-in { from { opacity: 0 } }`. 마운트와 꺼짐→켜짐에 돌고, 인라인 `opacity`(확대 단계별 값)로 끝난다. 전역 `prefers-reduced-motion` 규칙이 animation을 끈다.

**의존성.** `@deck.gl/extensions@~9.3.10`(core 9.3과 peer 일치; `^9.3.10`은 9.4를 끌어와 peer 충돌).

## 버린 대안

- **점 레이어 `transitions` + `enter`.** deck.gl 속성 전환은 인덱스 기준이라 `shownPoints`에 중간 삽입이 생기면 이웃 점의 색이 섞인다. 연도순 정렬로 피할 수 있지만 `from`을 끌 때 다시 깨진다.
- **알파 0으로 전부 그리기(확장 없이).** 픽킹은 알파를 보지 않아 보이지 않는 점이 호버·클릭에 잡힌다.
- **자체 셰이더 확장.** `DataFilterExtension`이 같은 일을 하고 픽킹 제외까지 처리한다. 코드 30줄 대신 의존성 하나.
- **영역 이름을 `useEffect`로 마운트 뒤 opacity 올리기.** 렌더 한 번 더. CSS animation이면 코드가 없다.

## 함정

- `filterSoftRange`의 `softMax ≥ max`면 계단으로 되돌아간다(셰이더의 `step(max, softMax)`). `upper − 1 < upper`라 해당 없다.
- 유니폼 `filterRange`는 float32 — 연도 2000대에 소수 2~3자리면 충분하다.
- `data: points`로 바꾸면 `updateTriggers`에 `getFilterValue`를 넣어야 `from` 변경이 반영된다. 나머지 접근자는 그대로.
- 재생 중 MapView는 프레임마다 렌더된다. 카메라 이동과 같은 경로라 새 비용은 유니폼 갱신뿐이다. `layers` 배열은 매 렌더 새로 만들지만 deck이 props를 비교한다.
- `usePlayhead()`의 `getSnapshot`은 `floor` 결과(원시값)를 돌려준다 — 안정 참조 조건 만족.

## 완료 기준

```
cd frontend && npx tsc -b && npm run lint && npm test
cd frontend && E2E_PORT=5179 npx playwright test e2e/exploration.spec.ts -g "year playhead"
```
브라우저: `/?from=1995&to=2020` 재생 중 점이 1초에 걸쳐 커지며 나타나고, 영역 이름은 페이드인, 영역 배경은 계단 없이 짙어진다. 일시정지하면 반쯤 나타난 점이 그대로 남는다. 재생 중 아직 나타나지 않은(값 0) 점은 호버에 잡히지 않는다. 옅게 나타나는 중인 점(0 < 값 < 1)은 보이는 만큼 잡힌다. `data-paper-opacity` 등 기존 속성은 그대로.
