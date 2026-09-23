---
title: Remotion 홍보 영상 PoC
slug: promo-video-poc
stage: spec
status: accepted
intent: .intent/intent_promo-video-poc.md
date: 2026-09-24
---

# Remotion 홍보 영상 PoC — 명세

## 요구사항

- [ ] 저장소 루트의 `video/`가 독립 npm 패키지(Remotion 4)다. `npm --prefix video run render`가 `video/out/map-dive.mp4`(1920×1080, 30fps, H.264)를 만든다.
- [ ] 영상 데이터는 `npm --prefix video run snapshot`이 실행 중인 `constellation-serve`의 `/api/runs`·`/api/map`·`/api/clusters`·`/api/tree`·`/api/edges` 응답을 그대로 `video/public/data/`에 JSON으로 저장한 것이다. 앱과 같은 질의 계층을 쓴다. 스냅샷은 git에 넣지 않는다(`data/`처럼 코퍼스 산출물).
- [ ] run은 `project-scincl-20260826T084511Z`다. DB에서 클러스터·트리·흐름·계보가 모두 있는 run은 이것 하나뿐이다(RAG·정보검색 논문 10,604편, 2014–2026).
- [ ] `MapDive` 컴포지션 5초(150프레임)의 장면 순서:
  1. 전체 지도와 상위 분야 이름
  2. 상위 분야 하나로 줌인하면 하위 분야 이름이 나타난다
  3. 하위 분야로 줌인하면 논문 제목이 나타난다
  4. 피인용수가 가장 높은 논문에 멈추고, 그 논문의 인용선(참조 파랑, 피인용 빨강)이 뻗어 나간다
  - 대상 분야와 논문은 데이터에서 정한다. 가장 큰 상위 분야, 그 안에서 가장 큰 하위 분야, 그 하위 분야에서 피인용수 최대 논문 순이다. 컴포지션 props로 바꿀 수 있다.
- [ ] 같은 프레임 번호는 언제 렌더해도 같은 그림이다. 벽시계 시간(`useTween`, CSS transition·animation, `setTimeout`)에 기대는 값이 없고, 모든 값은 프레임 번호에서 계산한다.
- [ ] 각 프레임은 deck.gl이 그 프레임의 카메라로 그리기를 마친 뒤에 캡처된다. 그리지 못하면 빈 프레임을 내보내지 않고 렌더가 실패한다.
- [ ] 점 색·반지름·흰 테두리(피인용 98분위)와 영역 배경, 제목 글꼴·배치·말줄임, 영역 이름 글꼴·그림자, 인용선 색·굵기는 앱과 같은 값이다. 값은 `frontend/src/views/map/`에서 import하고 `video/`에 복사하지 않는다.
- [ ] `video/STORYBOARD.md`에 30초 티저의 장면 구성 초안이 있다.
- [ ] 앱의 동작은 바뀌지 않는다. `npm --prefix frontend run test`, `npm --prefix frontend run build`, `npm --prefix frontend run lint`가 전부 통과한다.

## 설계

**재사용할 것.** `frontend/src/views/map/`의 순수 모듈은 React와 스토어에 의존하지 않는다. `labels.ts`는 타입만 import하고, `regions.ts`·`edges.ts`·`active-labels.ts`·`text-snap.ts`·`region-gradient.ts`도 마찬가지다. 영상은 다음 함수를 그대로 쓴다.

- `homeCamera`·`labelLevel`·`regionLabels`·`regionRadii`·`descendants`·`clampRegionLabel`
- `revealZooms`·`truncateTitle`·`paperTitleOpacity`·`paperLabelOpacity`
- `clusterColor`·`regionBlobs`·`dotScale`·`citationIndex`·`linksOf`
- `SnapTextExtension`·`RegionGradientExtension`

**앱에서 꺼낼 것(동작 동일 리팩터링).** 영상이 쓰는데 `MapView.tsx` 안에 갇혀 있는 것을 순수 모듈로 옮기고, `MapView`는 그 모듈을 import한다.

- `views/map/style.ts`(새 파일): 점 상수(`DOT_RADIUS*`·`TOP_CITED_QUANTILE`), 인용선 상수(`LINK_*`), 제목 상수(`TITLE_*`·`VALUE_GAP`·`ZOOM_RANGE`), `titleTypography()`, `titleFontRenderer()`
- `views/map/labels.ts`: 영역 이름 배치(`shownRegions` 메모 본문)를 `placeRegionLabels(items, viewport, size, radii, alive, relativeZoom)`로 꺼낸다
- `views/map/titles.ts`(새 파일): 제목 치수(`displays`·`valueDx`·`widths`)를 계산하는 `titleMetrics(map, measure)`

**영상 패키지 `video/`.**
- `remotion.config.ts`:
  - `Config.setChromiumOpenGlRenderer("angle")`
  - `Config.overrideWebpackConfig`로 `@deck.gl/*`를 `video/node_modules`로 alias한다(`text-snap.ts`·`region-gradient.ts`가 `@deck.gl/core`를 값으로 import한다. luma는 deck을 따라 딸려 온다). `frontend/`의 파일을 import해도 deck.gl 인스턴스가 하나만 쓰인다.
- 컴포지션 크기는 1280×720이고 렌더는 `--scale=1.5`로 1920×1080을 만든다. 장치 픽셀 비율이 1.5가 되므로 앱의 CSS 크기(제목 10px, 영역 이름 22px)가 1280 폭 창과 같은 비율로 보이고, 글꼴 아틀라스는 `devicePixelRatio`를 따라 선명하게 그려진다. 1920×1080 CSS 픽셀로 그리면 10px 제목이 읽히지 않는다.
- `src/map/MapScene.tsx`: `@deck.gl/react`의 `DeckGL`을 쓴다. 뷰 상태는 props로만 받고, `controller`와 `transitions`는 쓰지 않는다. 레이어 구성은 `MapView`의 다음 레이어를 같은 속성으로 따른다(호버·선택·연도 필터 제외).
  - `soft-regions`, `papers`, `hover-links`, `hover-nodes`, `paper-titles`, `paper-values`
  - 영역 이름은 DOM 오버레이로 그리고, `.region-name`과 같은 글꼴·그림자를 쓰되 transition은 뺀다.
- 프레임 동기화: 프레임이 바뀔 때마다 `useDelayRender()`로 핸들을 잡고 `deck.redraw`를 요청한다. `onAfterRender`에서 그 프레임의 핸들을 푼다.
- `src/scenes/MapDive.tsx`: 카메라를 프레임의 함수로 계산한다.
  - 배율은 구간마다 `interpolate` + `Easing`으로 보간한다.
  - 대상점 P를 화면 중앙으로 부드럽게 옮기려고, P의 화면 오프셋을 `offset0 × (1 − e(t))`로 줄이고 `target = P − offset(t) / 2^zoom`으로 계산한다. 이렇게 하면 배율이 커져도 P가 화면에서 곧게 중앙으로 온다.
- 앱에서 시간으로 도는 효과는 프레임 함수로 바꾼다.
  - 영역 이름: 앱은 240ms 교차 페이드를 쓴다. 영상은 줌 문턱 주변 ±0.25단계에서 배율의 함수로 교차 페이드한다.
  - 인용선 앞머리: 앱은 `useFront`로 초당 1200px씩 뻗는다. 영상은 `front = 1200px × 경과초 / 2^zoom`으로 같은 속도를 프레임에서 계산한다.
  - 이웃 라벨: 선이 닿은 뒤 240ms에 켜지는 것은 `linked()`와 같은 식을 프레임으로 계산한다.
- `scripts/snapshot.mjs`: `CONSTELLATION_API`(기본 `http://127.0.0.1:8000`)에서 JSON을 받아 저장한다.

## 버린 대안

- **`MapView`를 그대로 렌더.** `useTween`·`useFront`·CSS transition·`setTimeout`·react-query·URL 상태에 묶여 있어 프레임 결정성이 깨진다. Remotion은 여러 탭에서 프레임을 흩어 렌더하므로 시간에 기대는 값은 탭마다 다르게 나온다.
- **`frontend/`에 Remotion 의존성 추가.** deck.gl 사본 문제는 없지만, 앱의 `package.json`과 lockfile에 영상 도구가 섞인다.
- **1920×1080 CSS 픽셀 컴포지션.** 앱의 10px 제목이 영상에서 너무 작아진다. 글자만 키우면 앱과 다른 배치가 나온다(`revealZooms`의 상자 크기가 바뀐다).
- **화면 녹화.** 프레임 드롭 때문에 결정성이 없다.

## 함정

- deck은 바뀐 것이 없으면 다시 그리지 않는다. `redraw`를 강제하지 않으면 `onAfterRender`가 안 불려 `delayRender` 시간 초과가 난다.
- 캡처가 빈 캔버스를 잡으면 `deviceProps`의 WebGL `preserveDrawingBuffer: true`를 켠다.
- `titleTypography()`는 `--font-mono`와 `body`의 글자색을 `getComputedStyle`로 읽는다. 앱의 CSS가 없으면 기본값(`monospace`)으로 떨어진다. 그래서 영상은 `frontend/src/styles/tokens.css`(순수 CSS)를 import한다. `index.css`(tailwind)가 덮어쓰는 값은 실행 중인 앱에서 계산값을 재서 맞추고, 출처를 주석으로 남긴다. 복사 금지 원칙의 예외는 이 부분 하나다.
- 글꼴은 전부 시스템 글꼴이다. 영역 이름은 `--font-region`(Georgia 계열), 제목은 `--font-mono`(SF Mono)다. 웹폰트 로드를 기다릴 필요는 없지만, 헤드리스 Chrome이 이 글꼴을 실제로 쓰는지는 뽑은 프레임에서 확인한다.
- `frontend/`의 파일이 `../../api`에서 타입만 import하므로 번들에는 들어가지 않는다. `import type`이 아닌 import가 생기면 `@tauri-apps/api`가 딸려 온다.
- 다른 브랜치(`feat/node-size`)가 `MapView.tsx`를 고치고 있어서, 상수를 옮기면 병합 충돌이 날 수 있다.

## 완료 기준

- `npm --prefix video run render` 종료 코드 0, `ffprobe`가 1920×1080·150프레임·30fps를 보고한다.
- ffmpeg `signalstats`로 프레임별 평균 밝기(YAVG)를 뽑았을 때, 이웃 프레임보다 급격히 떨어지는 프레임(빈 프레임)이 없다.
- 0·1·2·3·4·5초 프레임을 이미지로 뽑아 눈으로 확인한다. 상위 분야 이름, 하위 분야 이름, 논문 제목, 인용선이 차례로 보이고 글자가 읽혀야 한다.
- `npm --prefix frontend run test`·`build`·`lint`와 `video/`의 `tsc --noEmit`이 통과한다.
