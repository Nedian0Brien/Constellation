---
title: 데스크톱 앱 타이틀 바를 헤더에 통합
slug: title-bar
stage: spec
status: accepted
intent: .intent/intent_title-bar.md
date: 2026-09-18
---

# 데스크톱 앱 타이틀 바를 헤더에 통합 — 명세

## 요구사항

- [x] `tauri dev`로 띄운 창의 스크린샷에서 헤더(62px) 위에 색이 다른 띠나 경계선이 없다. 신호등 세 개가 헤더 배경 위, 헤더 세로 가운데(±2px)에 있다.
- [x] 창 제목 텍스트가 보이지 않는다. 헤더의 브랜드 로고·"Constellation"·구분선·"연구 라이브러리"가 신호등 오른쪽에서 시작하고 겹치지 않는다.
- [ ] (사용자 확인) 헤더의 빈 공간이나 브랜드 글자를 누르고 끌면 창이 움직인다. 같은 자리를 두 번 누르면 창이 확대(zoom)된다.
- [ ] (사용자 확인) 헤더 안의 모델 Select·탐색 패널 토글·논문 목록·에이전트 버튼은 클릭이 창 끌기로 새지 않고 그대로 동작한다.
- [x] 브라우저(`npm run dev`, `localhost:5173`)에서는 헤더 padding·마크업 렌더가 지금과 같다(좌측 여백 20px).
- [x] `cargo test --workspace`, `npm --prefix frontend run build`, `npm --prefix frontend run lint`가 통과한다.

## 설계

- **창 설정** `src-tauri/tauri.conf.json` `app.windows[0]`에 `"titleBarStyle": "Overlay"`, `"hiddenTitle": true`, `"trafficLightPosition": {"x": 20, "y": 33}`을 더한다. Overlay는 타이틀 바를 투명하게 웹뷰 위에 겹치고 웹뷰가 창 전체를 채우게 한다(`tauri-utils-2.9.3/src/lib.rs` `TitleBarStyle::Overlay`). `trafficLightPosition`은 tao가 닫기 버튼의 좌상단 원점으로 쓰고 나머지 두 버튼은 macOS 기본 간격(이 Mac에서 측정: 중심 23pt)을 유지한 채 같은 y에 놓는다(`tao-0.35.3/src/platform_impl/macos/view.rs` `inset_traffic_lights`). x=20은 헤더의 기존 좌측 padding과 같다. y는 계산값 23으로 시작했으나 실행 중인 앱에서 신호등 중심이 20.5px에 찍혀(macOS 27) 33으로 올려 중심 30.5px(헤더 62px의 가운데)을 얻었다. 스크린샷 픽셀 측정값이다.
- **권한** `src-tauri/capabilities/default.json`에 `core:window:allow-start-dragging`을 더한다. `gen/schemas/desktop-schema.json`의 `core:window:default` 목록에는 `allow-internal-toggle-maximize`(두 번 클릭 확대)만 있고 `allow-start-dragging`이 없다. 없으면 드래그 스크립트의 `invoke('plugin:window|start_dragging')`가 조용히 거부된다.
- **드래그 영역** `AppShell.tsx`의 `<header className="product-header">`에 `data-tauri-drag-region="deep"`을 붙인다. Tauri가 주입하는 `drag.js`(2.11.5)는 `deep`이면 하위 트리 어디를 눌러도 끌기를 시작하되, 경로에 `data-tauri-drag-region`이 없는 클릭 가능 요소(`BUTTON`·`role=button` 등)가 있으면 끌기를 막는다. Select 트리거와 버튼은 모두 `<button>`이라 그대로 눌린다. 브라우저에서는 이 속성을 읽는 코드가 없어 무해하다.
- **좌측 여백** `.product-shell`에 `data-desktop` 속성을 `api.ts`의 `desktop` 플래그로 붙이고, `index.css`에 `.product-shell[data-desktop] .product-header { padding-left: calc(var(--traffic-lights-end) + 18px) }`를 더한다. `--traffic-lights-end: 80px` = 스크린샷에서 측정한 신호등 위치(닫기 x 20–33, 확대 x 66–79, 중심 간격 23, 지름 13)의 오른쪽 끝. 18px은 헤더의 기존 `gap`이다. macOS 기하에서 온 값이라 디자인 토큰이 아니며 CSS 주석에 근거를 적는다.
- **선택 방지** `.product-header`에 `user-select: none`을 둔다. 끌기 영역에서 텍스트 선택 커서가 나오면 크롬처럼 보이지 않는다. 헤더 텍스트는 브랜드명·컬렉션 이름만이라 복사할 이유가 없다.

## 버린 대안

- `titleBarStyle: "Transparent"` + 창 `backgroundColor`: 색 이음새는 없어지지만 28px 타이틀 띠가 헤더 위에 남아 두 줄이 그대로다.
- `decorations: false`로 신호등을 직접 그리기: 시스템 버튼의 호버·전체 화면 동작을 다시 만들어야 하고 macOS 룩과 어긋난다.
- 여백을 플랫폼 감지(`navigator.platform`)로 가르기: 번들 대상이 macOS만이라 `desktop` 플래그 하나로 충분하다. Windows 번들을 추가할 때 다시 본다.

## 함정

- 전체 화면에서는 macOS가 신호등을 숨기지만 웹뷰의 좌측 여백은 남는다(범위 밖).
- 창이 포커스를 잃은 상태에서는 드래그 영역이 동작하지 않는다(tauri-apps/tauri#4316, 범위 밖).
- `trafficLightPosition`은 `decorations: true`(기본)일 때만 적용된다. `decorations`를 만지지 않는다.
- 헤더 높이는 `@media (max-width: 959px)`에서 54px로 줄지만 창 `minWidth`가 960이라 앱에서는 닿지 않는다. y=33은 62px 기준이다.
- `tauri.conf.json`을 바꾸면 `tauri dev`가 Rust를 다시 빌드한다(분 단위).

## 완료 기준

- `npx --prefix frontend tauri dev`로 띄운 창 스크린샷: 신호등이 헤더 안 세로 가운데, 헤더 위 띠 없음, 제목 텍스트 없음.
- 같은 창에서 헤더 빈 곳 끌기 → 창 이동, 두 번 클릭 → 확대, 논문 목록 버튼 클릭 → 목록 열림.
- `cargo test --workspace && npm --prefix frontend run build && npm --prefix frontend run lint` 종료 코드 0.
