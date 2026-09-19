---
title: 데스크톱 앱 타이틀 바를 헤더에 통합
slug: title-bar
stage: intent
status: accepted
author: minjaepark
date: 2026-09-18
---

# 데스크톱 앱 타이틀 바를 헤더에 통합

## 문제

Constellation 데스크톱 앱(macOS)을 열면 신호등(닫기·최소화·확대) 버튼이 놓인 시스템 타이틀 바가 앱 헤더 위에 별도의 띠로 그려진다. 시스템이 그리는 이 띠는 앱 배경과 색이 조금 다르고 아래에 경계선이 생겨서, 앱 헤더와 타이틀 바가 두 줄로 나눠 보인다. 브랜드 로고와 "Constellation" 글자는 이미 앱 헤더에 있는데 타이틀 바가 같은 이름을 한 번 더 보여 준다.

## 원하는 결과

- 신호등 버튼이 앱 헤더(`.product-header`, 62px) 안에 들어와 헤더 배경(`--background`) 위에 놓인다. 헤더 위에 색이 다른 시스템 띠와 경계선이 없다.
- 시스템 타이틀 텍스트("Constellation")는 사라지고 브랜드 표기만 남는다.
- 신호등이 헤더 높이에서 세로로 가운데 정렬되고, 헤더의 브랜드·구분선·컬렉션 이름은 신호등과 겹치지 않는다.
- 헤더의 빈 공간과 브랜드 글자를 눌러 끌면 창이 움직이고, 헤더를 두 번 누르면 창이 확대(zoom)된다. 헤더 안의 모델 Select·탐색 패널·논문 목록·에이전트 버튼은 그대로 눌린다.
- 브라우저(`localhost:5173`)로 볼 때의 헤더는 지금과 같다. 신호등 여백은 데스크톱 앱에서만 생긴다.

## 영향 범위

`src-tauri/tauri.conf.json`(창 설정), `src-tauri/capabilities/default.json`(창 끌기 권한), `frontend/src/components/AppShell.tsx`(헤더 마크업), `frontend/src/index.css`(헤더 여백). 사용자는 연구자 본인.

## 제약

- Tauri 2.11.5의 창 설정(`titleBarStyle`·`hiddenTitle`·`trafficLightPosition`)과 `data-tauri-drag-region` 스크립트 안에서 해결한다. 새 의존성을 넣지 않는다. 키 이름과 동작은 2026-09-18 로컬 크레이트 소스(`tauri-utils-2.9.3/src/config.rs`, `tauri-2.11.5/src/window/scripts/drag.js`)와 `src-tauri/gen/schemas/desktop-schema.json`에서 확인했다.
- 창 `decorations`는 기본값(true)으로 둔다. 시스템 신호등 버튼을 직접 그리지 않는다.
- 헤더 높이 62px과 디자인 토큰은 바꾸지 않는다. 신호등 좌측 여백은 macOS 버튼 기하(12px 버튼 3개, 간격 8px)에서 계산한 값이며 실행 중인 앱 스크린샷으로 확인한다.

## 범위 밖

- 전체 화면(fullscreen)에서 신호등이 숨겨진 뒤 남는 좌측 여백을 접는 것. 이번엔 여백을 그대로 둔다.
- 창이 포커스를 잃은 상태에서 헤더를 끌어 옮기는 것. Tauri 제약(tauri-apps/tauri#4316)으로 지금은 안 된다.
- Windows·Linux의 타이틀 바. 번들 대상이 macOS `app`·`dmg`뿐이다.

## 열린 질문

없음.
