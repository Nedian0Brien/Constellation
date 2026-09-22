---
title: 연도 재생을 동영상 재생 헤드처럼 — 빨간 세로선이 연속으로 움직이고 위에 현재 연도
slug: year-playhead
stage: spec
status: accepted
intent: .intent/intent_year-playhead.md
date: 2026-09-22
---

# 연도 재생 헤드 — 명세

## 요구사항

- [ ] 재생 버튼을 누르면 `.year-track` 안에 빨간 세로선(재생 헤드)이 `from` 칸의 왼쪽 가장자리에서 나타나 `to` 칸의 오른쪽 가장자리(`to` 손잡이 자리)까지 rAF 프레임마다 움직인다. 속도는 1년당 `PLAY_MS`(1000ms) — 비례 축이라 픽셀 속도는 칸 폭에 비례한다.
- [ ] 세로선 위에 `Math.floor(헤드)` 연도가 붙어 함께 움직인다. 재생 중에는 두 손잡이의 연도 라벨을 숨긴다(헤드 라벨과 겹친다).
- [ ] `from`부터 헤드까지 축 선이 빨갛게 채워진다(재생된 구간).
- [ ] 두 손잡이·URL의 `from`·`to`는 재생 중 바뀌지 않는다. `data-from`·`data-to`도 그대로다.
- [ ] 지도(`MapView` 점·인용선)와 필터 일치 집합(`useAnalysis().ids`, 툴바의 편수)은 재생 중 `[from, floor(헤드)]`를 쓴다. 헤드가 한 해를 넘을 때 한 번만 갱신된다. 프레임마다 React 상태·URL을 쓰지 않는다.
- [ ] 헤드가 `to` 칸의 오른쪽 끝에 닿으면 재생이 멈추고 헤드가 사라지며 필터는 `[from, to]`로 돌아온다.
- [ ] 일시정지(같은 버튼)하면 헤드가 그 자리에 남고 필터도 그 해까지다. 다시 누르면 그 자리에서 이어 간다.
- [ ] 손잡이·가운데 구간 끌기, 트랙 클릭, 더블클릭, 연도 직접 입력, 키보드 이동, 그리고 URL로 `from`·`to`가 바뀌면 재생이 멈추고 헤드가 사라진다.
- [ ] `data-playing`은 재생 중에만, `data-head`(정수 연도)는 헤드가 보이는 동안(재생·일시정지) 붙는다 — E2E가 읽는다.
- [ ] 컴포넌트가 사라지거나(뷰 전환) run이 바뀌면 rAF를 취소하고 헤드를 지운다.

## 설계

**헤드 값을 두는 곳 — 새 훅 `frontend/src/hooks/use-playhead.ts`.** `useSyncExternalStore` 위의 모듈 스토어 하나: `{ year: number | undefined }`와 `setPlayhead(year)`. URL 상태(`useExploration`)는 사용자가 정한 범위이고 헤드는 그 안에서 도는 일시적 값이라 URL에 넣지 않는다(새로고침하면 재생 중이 아니므로 헤드도 없어야 한다). 소비처 둘:
- `use-analysis.ts`: `const to = playhead ?? state.to` — `ids` 계산에 쓰고, 훅이 `yearTo`로 내보낸다. 서버 목록 필터(`filters.year_to`)는 `state.to` 그대로 둔다 — 재생 중 초당 요청이 나가지 않게 하려는 기존 방침("슬라이더·재생 중에 요청이 나가지 않는다").
- `MapView.tsx` `inYears`: `state.to` 대신 `a.yearTo`.

**YearRange 재생 로직.** 기존 `setInterval` + `commit(f+1, t+1)`을 지운다. `PLAY_WINDOW` 상수도 지운다.
- `head` ref(소수 연도), `playing` state, 스토어의 `year`(정수)가 헤드의 세 얼굴이다. 헤드가 보이는 조건은 `store.year !== undefined`.
- 시작(`togglePlay`, 헤드 없음): `head = from`, `setPlayhead(from)`, `playing = true`. 헤드 있음(일시정지 중): `playing = true`만. 재생 중: `playing = false`(헤드 유지).
- 루프(`useEffect([playing])`): `requestAnimationFrame` 재귀. 프레임마다 `head += dt / PLAY_MS`; `head >= to + 1`이면 `head = to + 1`로 그리고 멈춤(`playing=false`, `setPlayhead(undefined)`). 아니면 `.year-playhead` 요소의 `style.width = xAt(head) - xOf(from)`과 라벨 `textContent`를 ref로 직접 쓰고, `floor(head)`가 바뀌었을 때만 `setPlayhead(floor)`. `xAt(y)`는 `yearAtX`의 역함수(소수 연도 → x): `edges[k] + frac × (edges[k+1] − edges[k])`. `edges`·`from`·`to`는 ref로 최신값을 읽는다(`range` ref 확장).
- 멈추는 지점: `startDrag`, `onTrackPointerDown`, 더블클릭, `YearLabel.onChange`, `onKey`에서 `stopPlay()`(`playing=false` + `setPlayhead(undefined)`). `useEffect([from, to, lo, hi])`에서도 헤드가 있으면 지운다 — 마운트 직후는 헤드가 없어 아무 일도 없다. 언마운트 정리에서 `setPlayhead(undefined)`.
- `commit`의 `frame` ref는 URL 갱신 합치기용이라 건드리지 않고, 재생 루프는 별도 ref를 쓴다.

**렌더.** `.year-track` 안, `.year-line-in` 뒤·손잡이 앞에 헤드가 있을 때만:
```
<div class="year-playhead" ref style={{ left: xOf(from) }} aria-hidden>
  <span class="year-playhead-year" ref>{year}</span>
</div>
```
폭은 React가 쓰지 않는다(첫 폭은 `useLayoutEffect`가 ref로). 빨간 채움은 요소의 `border-bottom`(2px, `.year-line-in`과 같은 자리), 세로선은 `::after`(오른쪽 끝, 2px × 22px, `.year-thumb`와 같은 치수·자리), 라벨은 오른쪽 끝 위 가운데 정렬(`.year-label`과 같은 10px 모노 글꼴·텍스트 그림자). `pointer-events: none`.

**CSS.** `.year-playhead*` 추가. `.year-range[data-playing] .year-label { color: var(--warn) }`는 `.year-range[data-head] .year-thumb .year-label { display: none }`으로 바꾼다. 빨강은 `--destructive`(앱의 빨강 토큰; 다크에서 `oklch(0.704 0.191 22.216)`). 표식의 `LINK_IN` 빨강과는 높이(표식 최대 14px, 헤드 22px + 라벨 + 채움선)로 구별된다.

**값의 근거.** `design-ops` 코퍼스(`patterns/form.md`)에는 슬라이더·재생 헤드 표본이 없다(스위치만). 새 수치를 만들지 않고 이 컴포넌트의 손잡이(2×22px, bottom 10px)·라벨(10px mono)·범위 선(2px, bottom 13px) 값을 그대로 쓴다.

## 버린 대안

- **헤드를 URL `to`에 쓰기(지금 방식의 연장).** 손잡이가 헤드를 따라 움직여 "두 손잡이 사이에서" 재생한다는 지시와 어긋나고, 일시정지 뒤 원래 `to`를 잃는다.
- **헤드를 URL 파라미터로.** 새로고침·뒤로가기에 재생 중이 아닌데 헤드가 남는다.
- **프레임마다 `setState`.** 렌더마다 `groups`를 다시 계산하고 소비처가 60번/초 다시 그린다.
- **일정한 픽셀 속도.** 라벨의 연도가 빈 시대를 순식간에 건너뛰어 "현재 연도"가 읽히지 않는다. 초당 1년을 유지한다(intent).

## 함정

- `edges`는 `width`(ResizeObserver)에 따라 바뀐다 — 루프가 오래된 `edges`를 잡지 않도록 ref로 읽는다.
- `to + 1`이 끝이다(`to` 칸의 오른쪽). `from === to`면 한 칸만 지난다.
- `useSyncExternalStore`의 `getSnapshot`은 같은 값이면 같은 참조를 돌려줘야 한다 — 원시값(number | undefined)이라 문제없다.
- 서버 목록(`PaperListOverlay`)은 재생 중 `[from, to]` 기준이라 지도 편수와 다를 수 있다. 목록을 연 채 재생하는 경우고, 기존 방침을 따른다. 참고사항으로 남긴다.
- 헤더 주석(YearRange.tsx 상단 "재생:" 줄)과 CSS 주석을 새 동작으로 고친다.

## 완료 기준

```
cd frontend && npx tsc -b && npm run lint && npm test
cd frontend && npx playwright test e2e/exploration.spec.ts -g "year playhead"
```
E2E: 범위를 `from=2010&to=2014`로 열고 재생 → `data-playing`·`data-head=2010`이 붙고 `data-to`는 2014 그대로, 1.2초 뒤 `data-head`가 2011 이상, 일시정지 → `data-playing` 사라지고 `data-head` 유지, 더블클릭 → `data-head` 사라짐.
브라우저: 재생 중 빨간 선이 끊김 없이 이동하고 위에 연도가 붙는지, 지도 점이 해마다 늘어나는지, 끝에서 멈추는지 눈으로 확인.
