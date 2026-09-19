---
title: 영역 이름 위에서도 휠로 지도가 확대·축소되게
slug: label-wheel-zoom
stage: plan
status: accepted
intent: .intent/intent_label-wheel-zoom.md
spec: .intent/spec_label-wheel-zoom.md
date: 2026-09-19
---

# 영역 이름 위에서도 휠로 지도가 확대·축소되게 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `frontend/src/views/MapView.tsx` | `.map-labels`에 `labels` ref를 달고, `useEffect`에서 native `wheel` 리스너(`passive: false`)를 붙여 `preventDefault` 뒤 `deckRef.current?.deck?.getCanvas()`에 `new WheelEvent(e.type, e)`를 `dispatchEvent`한다. 이유를 주석으로 남긴다(왜 형제 오버레이라 휠이 안 닿는지, 왜 native 리스너인지). |
| `frontend/src/views/MapView.tsx` (드래그) | `.map-labels`에 `onPointerDown/Move/Up/Cancel`·`onClickCapture`를 달아 `.region-name` 위 드래그로 `move(…, false)`한다. 끄는 동안 `data-dragging`을 세운다. |
| `frontend/src/index.css` | `.region-name`에 `touch-action: none`·`cursor: grab`, `.map-labels[data-dragging] .region-name`에 `cursor: grabbing`. |
| `frontend/e2e/exploration.spec.ts` (드래그) | 라벨 위 `mouse.down` → 이동 → `up`으로 target이 바뀌고 클릭이 안 난 것, 이어서 클릭은 나는 것. |
| `frontend/e2e/exploration.spec.ts` | 새 `test("wheel over a region name zooms the map")`: 상위 분야 단계에서 켜진 `.region-name` 중심에 마우스 → `wheel(0, -120)`로 zoom 증가, `wheel(0, 120)`로 감소, 그 라벨 클릭으로 URL `node`/`cluster` 갱신. |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 워크트리에 `npm --prefix frontend ci` — `node_modules`가 없다. `ls frontend/node_modules/@deck.gl`로 확인.
2. `MapView.tsx` 수정 — `npm --prefix frontend run build`(tsc)와 `lint` 통과.
3. e2e 시나리오 추가 — 수정 전 코드로는 zoom이 안 바뀌어 실패해야 하고(2단계를 잠시 되돌려 확인), 수정 후 통과.
4. Vite dev로 실제 화면 확인 — 라벨 위 휠 확대·축소, ctrl+휠, 라벨 클릭 이동. 스크린샷을 남긴다.
5. `fix:` 커밋, 푸시, PR.
6. (2026-09-19 추가) 드래그 이동 — `MapView.tsx`·`index.css` 수정, e2e 추가, `feat:` 커밋. 수정 전에는 target이 안 바뀌어 실패하는 것을 확인한다.

## 가장 위험한 단계

3단계. e2e에서 Playwright의 `mouse.wheel`이 라벨 버튼에 정확히 떨어지지 않으면(라벨이 페이드 중이거나 `data-active`가 바뀌는 순간) 거짓 통과·거짓 실패가 난다. `expect.poll`로 `data-active=true`인 라벨의 `boundingBox`를 잡은 뒤 굴린다. 되돌리기: 코드 변경은 파일 하나의 `useEffect` 하나라 커밋 revert로 끝난다.

## 검증

```
npm --prefix frontend run build
npm --prefix frontend run lint
E2E_PORT=5177 npm --prefix frontend run test:e2e -- -g "wheel over a region name"
E2E_PORT=5177 npm --prefix frontend run test:e2e -- -g "drag over a region name"
E2E_PORT=5177 npm --prefix frontend run test:e2e -- -g "semantic zoom"
```

화면: `constellation-api`(8000) + 이 워크트리의 Vite(5177)에서 지도를 열고, 화면 가운데 큰 영역 이름 위에 마우스를 두고 휠 위·아래 → 배율 표시(`data-camera`, 헤더 배율)가 바뀌고 그 라벨을 중심으로 확대된다. 같은 라벨 클릭 → 그 영역으로 이동.
