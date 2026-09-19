---
title: 영역 이름 위에서도 휠로 지도가 확대·축소되게
slug: label-wheel-zoom
stage: spec
status: accepted
intent: .intent/intent_label-wheel-zoom.md
date: 2026-09-19
---

# 영역 이름 위에서도 휠로 지도가 확대·축소되게 — 명세

## 요구사항

- [x] 켜진 `.region-name[data-active=true]` 위에서 `wheel`이 일어나면 지도의 `zoom`이 바뀐다. 라벨 밖에서 같은 delta로 굴렸을 때와 같은 양이다(둘 다 deck 컨트롤러가 계산). — e2e `wheel over a region name` 통과(수정 전에는 5.4573 그대로라 실패). 브라우저에서 3틱에 +0.93, 라벨 밖과 같다.
- [x] 확대 중심은 마우스 위치다. 라벨 밖에서 굴릴 때와 같은 `clientX/Y`가 deck에 전달된다.
- [x] `ctrlKey`·`shiftKey`·`deltaMode`가 그대로 전달된다 — 트랙패드 핀치(ctrl+휠)와 shift 감속(mjolnir `SHIFT_MULTIPLIER`)이 라벨 밖과 같다.
- [x] 원본 휠 이벤트는 `preventDefault`된다. 웹뷰가 스크롤·튕김하지 않는다. — Chromium에서 `scrollY` 0 유지. `body { overflow: hidden }`이라 원래도 문서는 안 움직였다.
- [x] 영역 이름 클릭은 여전히 `RegionName.onClick`으로 이동한다. deck의 `onClick`·`onHover`는 라벨 위에서 받지 않는다(휠만 넘긴다).
- [x] 되보낸 이벤트가 다시 `.map-labels`로 돌아와 무한히 반복되지 않는다.

### 드래그 이동 (2026-09-19 추가)

- [x] 켜진 `.region-name` 위에서 `pointerdown` 뒤 4px 넘게 움직이면 지도의 `target`이 따라온다. 라벨 밖에서 같은 만큼 끌었을 때와 같은 양이다(같은 배율에서 화면 픽셀 ↔ 지도 좌표 변환이 같다). — 실측(배율 5.4573, 120px 끌기): 라벨 위 2.731 = 120/2^5.4573 정확히. 캔버스 위 deck 드래그는 2.458로, deck이 pan 임계(10px)를 넘는 첫 move 한 걸음(12px)을 버린다. 라벨 위 드래그는 누른 지점부터 세므로 그만큼 더 정확하다.
- [x] 끄는 동안 마우스가 라벨을 벗어나도 놓을 때까지 이어진다(포인터 캡처).
- [x] 끈 뒤에 떼면 그 라벨의 `onClick`이 불리지 않는다. 4px 안에서 떼면 불린다. — e2e `drag over a region name`(수정 전에는 target이 그대로라 실패).
- [x] 끄는 동안 커서는 `grabbing`, 그 밖에는 `grab`(라벨 밖의 지도와 같다).

## 설계

`MapView.tsx`의 `.map-labels` div에 ref를 두고, `useEffect`에서 native `addEventListener("wheel", handler, { passive: false })`를 붙인다. React의 `onWheel`은 루트에 passive로 등록되어 `preventDefault`가 듣지 않으므로 쓰지 않는다.

handler:
1. `e.preventDefault()`
2. `deckRef.current?.deck?.getCanvas()`(공개 API, `@deck.gl/core` 9.3 `deck.d.ts:267`)에 `new WheelEvent(e.type, e)`를 `dispatchEvent`한다. 원본 이벤트를 init dict로 넘기면 `deltaX/Y/Z`·`deltaMode`·`clientX/Y`·수정자 키·`bubbles`·`cancelable`이 복사된다.

캔버스는 deck React 래퍼의 `.deck-events-root` 안에 있고 mjolnir `WheelInput`은 그 루트에서 `wheel`을 듣는다(`@deck.gl/react` `index.cjs:426`, `@deck.gl/core` `deck.js:928`). 되보낸 이벤트는 캔버스 → `.deck-events-root` → `#research-map-wrapper` → 컨테이너로 올라가며 `.map-labels`는 그 경로에 없다 — 형제이므로 반복되지 않는다. mjolnir는 `clientX/Y`로 중심을 잡으므로 확대 중심이 맞는다.

드래그 이동은 같은 컨테이너의 React `onPointerDown/Move/Up/Cancel`로 한다. deck에 포인터 이벤트를 되보내면 mjolnir가 그것으로 클릭을 다시 만들어 라벨 뒤의 점·제목이 선택되므로 되보내지 않는다. `pointerdown`의 대상이 `.region-name`이면 그 버튼에 `setPointerCapture`하고 시작 카메라·시작 픽셀·시작 시점의 `OrthographicViewport`를 기억한다. `pointermove`에서 시작 뷰포트의 `unproject`로 시작 픽셀과 현재 픽셀의 지도 좌표 차를 구해 `move({ ...start, target: start.target - 차 }, false)`한다 — 픽셀 ↔ 지도 변환은 deck의 뷰포트 계산을 그대로 쓴다. 4px를 넘은 뒤에는 `dragged` 플래그를 세우고, 컨테이너의 `onClickCapture`에서 그 플래그가 서 있으면 `stopPropagation`으로 버튼의 `onClick`을 막는다. 화살표 키 이동이 이미 `move(…, false)`로 `target`을 직접 옮기므로 같은 경로다. `.region-name`에 `touch-action: none`을 두어 터치도 브라우저 스크롤에 뺏기지 않는다.

리스너를 라벨(`RegionName`) 하나하나가 아니라 컨테이너에 두는 이유: `feat/map-hover`가 같은 컨테이너에 `.node-menu-btn`을 더한다. 컨테이너 단위면 병합 뒤 그 버튼 위에서도 같이 된다.

## 버린 대안

- **`.map-labels`를 `<DeckGL>`의 자식으로 옮기기.** deck 래퍼가 자식을 `.deck-events-root` 안에 두므로 휠이 저절로 닿는다. 그러나 클릭·호버도 deck에 닿아 라벨 클릭이 뒤의 제목·점 선택(`onClick`)과 겹치고, 라벨 위 호버가 뒤의 논문을 집어 커서와 툴팁을 바꾼다. 자식 갱신도 deck의 그리기 주기에 묶여 라벨 페이드 타이밍이 흔들릴 수 있다. 휠만 넘기는 쪽이 작다.
- **컨테이너에서 휠을 받아 `move()`로 zoom을 직접 계산.** deck 컨트롤러와 별개의 배율 공식이 생긴다. intent 제약(단일 로직) 위반.
- **`.region-name`을 `pointer-events: none`으로 두고 클릭을 deck 픽킹으로 처리.** 라벨을 deck 레이어로 다시 만드는 일이라 범위를 넘는다.

- **포인터 이벤트를 wheel처럼 deck에 되보내기.** mjolnir가 down/up으로 tap을 만들어 deck `onClick`이 라벨 뒤의 점·제목을 집는다. 호버도 넘어가 커서·툴팁이 바뀐다.

## 함정

- React 17+에서 `onWheel`은 passive다. native 리스너를 써야 `preventDefault`가 듣는다.
- `deck.canvas`는 protected다. `getCanvas()`를 쓴다. deck이 아직 안 만들어졌으면(`null`) 아무것도 안 한다.
- Firefox는 mjolnir가 `deltaMode`로 보정한다. 되보낸 이벤트의 `deltaMode`가 원본과 같아야 한다 — init dict 복사로 보장.
- deck의 `_onWheel`은 `srcEvent.preventDefault()`를 부른다. 되보낸(합성) 이벤트에 걸리므로 원본은 우리가 따로 막는다.
- `.map-labels` 자체는 `pointer-events: none`이라 라벨이 없는 자리의 휠은 원래처럼 캔버스가 바로 받는다. 리스너는 라벨 위 휠에서만 불린다.

- 포인터 캡처는 `pointerdown` 대상 요소에 걸어야 한다. 캡처 뒤 `pointermove`·`pointerup`은 그 요소에서 나와 컨테이너로 올라온다.
- 끈 뒤 `pointerup` 다음에 `click`이 버튼에서 나온다. React 합성 이벤트에서 부모의 `onClickCapture`가 자식 `onClick`보다 먼저 돌므로 거기서 막는다.
- 끈 뒤 click이 안 따라오는 경우가 있다(터치 드래그, `pointercancel`). 막기 플래그를 click까지 들고 있으면 뒤에 오는 무관한 클릭(키보드 Enter, 병합 뒤 선택 모드 버튼)을 삼킨다. `pointerup` 직후 같은 태스크에서 오는 click만 막고 다음 틱에 푼다.
- 끄는 중에 휠로 배율이 바뀔 수 있다. 시작 카메라 기준으로 target을 계산하면 배율이 시작값으로 튀므로, 한 걸음마다 지금 카메라의 뷰포트로 계산한다(deck의 pan과 같은 방식).
- `RegionName`은 켜진 동안만 자리를 옮긴다. 끄는 동안 카메라가 바뀌면 라벨 자리도 바뀌지만 캡처가 걸려 있어 이벤트는 계속 온다.

## 완료 기준

- `frontend/e2e/exploration.spec.ts`에 시나리오 추가: 상위 분야 단계에서 켜진 `.region-name` 하나의 중심으로 마우스를 옮기고 `page.mouse.wheel(0, -120)` → `data-camera`의 zoom이 커진다. 이어서 `wheel(0, 120)` → 작아진다. 그 라벨을 클릭하면 URL의 `node`/`cluster`가 바뀐다(클릭 유지).
- e2e 시나리오 추가: 켜진 `.region-name` 중심에서 `mouse.down` → 120px 이동 → `mouse.up` → `data-camera`의 target이 바뀌고 URL에 `node`/`cluster`가 없다. 그 뒤 같은 라벨을 클릭하면 생긴다.
- `npm --prefix frontend run test:e2e -- -g "wheel|drag"` 통과, `npm --prefix frontend run build`(tsc 포함)·`lint` 통과.
- 실제 화면(Vite dev)에서 라벨 위 휠 확대·축소와 트랙패드 핀치를 눈으로 확인.
