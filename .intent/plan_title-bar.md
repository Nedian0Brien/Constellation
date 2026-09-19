---
title: 데스크톱 앱 타이틀 바를 헤더에 통합
slug: title-bar
stage: plan
status: accepted
intent: .intent/intent_title-bar.md
spec: .intent/spec_title-bar.md
date: 2026-09-18
---

# 데스크톱 앱 타이틀 바를 헤더에 통합 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `src-tauri/tauri.conf.json` | 메인 창에 `titleBarStyle: Overlay`, `hiddenTitle: true`, `trafficLightPosition: {x: 20, y: 33}` (23으로 시작해 측정 후 조정) |
| `src-tauri/capabilities/default.json` | `core:window:allow-start-dragging` 권한 추가 |
| `frontend/src/components/AppShell.tsx` | `SidebarProvider`에 `data-desktop` 속성, `<header>`에 `data-tauri-drag-region="deep"` |
| `frontend/src/index.css` | `.product-header`에 `user-select: none`, `.product-shell[data-desktop] .product-header`의 좌측 padding과 `--traffic-lights-end` 근거 주석 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `tauri.conf.json`·`capabilities/default.json` 수정 — `cargo test --workspace`가 통과하면 설정 키가 스키마에 맞는 것이다(`tauri-build`가 설정을 컴파일 시점에 파싱한다).
2. `AppShell.tsx`·`index.css` 수정 — `npm --prefix frontend run build && npm --prefix frontend run lint` 통과.
3. `npx --prefix frontend tauri dev`로 앱을 띄우고 스크린샷 — 신호등이 헤더 안 가운데에 있는지 확인. 어긋나면 `trafficLightPosition.y`와 `--traffic-lights-end`를 측정값으로 고치고 plan·spec의 숫자를 함께 고친다.
4. 같은 창에서 헤더 끌기·두 번 클릭·헤더 버튼 클릭 동작 확인. — 세션이 앱 제어 권한을 받지 못해 자동으로 확인하지 못했다. 컴파일된 ACL(`target/debug/build/constellation-app-*/out/capabilities.json`)에 `allow-start-dragging`이 들어간 것과 마크업의 `data-tauri-drag-region="deep"`을 확인했고, 실제 조작은 사용자가 확인한다.
5. 브라우저 `localhost:5173`에서 헤더 좌측 padding이 20px인지 확인.
6. `feat:` 커밋, 푸시, PR.

## 가장 위험한 단계

3단계. `trafficLightPosition`은 tao가 사설 뷰 계층(`close.superview().superview()`)을 만져서 놓는 값이라 macOS 버전에 따라 위치가 어긋날 수 있다. 어긋나면 y·x를 측정값으로 조정하고, 그래도 안 맞으면 `trafficLightPosition`을 빼고 헤더 높이 쪽을 조정하는 대신 신호등 기본 위치(타이틀 바 28px 기준)에 맞춰 여백만 두는 것으로 후퇴한다. 되돌리기는 `tauri.conf.json`의 세 키를 지우면 끝이다.

## 검증

```
cargo test --workspace
npm --prefix frontend run build
npm --prefix frontend run lint
npx --prefix frontend tauri dev
```

앱 창: 헤더 위 띠 없음 · 신호등 세로 가운데 · 제목 텍스트 없음 · 헤더 끌기로 창 이동 · 두 번 클릭 확대 · **논문 목록** 버튼 클릭으로 목록 열림.
브라우저 `localhost:5173`: 헤더 좌측 padding 20px 유지.
