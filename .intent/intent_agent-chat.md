---
title: 우측 사이드바를 에이전트 채팅으로 — agent-chat-framework 기반
slug: agent-chat
stage: intent
status: accepted
author: minjaepark
date: 2026-09-18
---

# 우측 사이드바를 에이전트 채팅으로 — agent-chat-framework 기반

## 문제

연구 지도를 탐색하려면 검색어·연도·주제 필터를 직접 만지고, 논문을 하나씩 열어 읽고, 지도를 손으로 옮겨 가며 봐야 한다. "RAG 평가 논문 중 2023년 이후 가장 많이 인용된 걸 보여 줘", "이 주제와 저 주제를 잇는 논문에 표시해 줘" 같은 질문을 자연어로 던질 자리가 없다. 우측 사이드바는 선택한 논문·주제의 상세만 보여 주고, 선택이 없으면 빈 상태로 자리를 차지한다.

`~/code/framework/agent-chat-framework`에 Claude Agent SDK 백엔드 + assistant-stream 브리지 + assistant-ui 기반 shadcn 레지스트리(161개, `@acf/`)를 이미 만들어 두었는데 Constellation에서 쓰지 못하고 있다.

## 원하는 결과

- 우측 사이드바가 에이전트 채팅이다. 메시지 목록·작성창·토큰 단위 스트리밍·사고 과정 요약·도구 호출 카드가 프레임워크의 `thread-aui` 계열 컴포넌트로 그려진다. 헤더 버튼으로 여닫고 열림 상태는 새로고침 뒤에도 유지된다.
- 논문·주제 상세(인스펙터)는 사이드바에서 나와 **선택 시 열리는 Dialog**가 된다. 지도 점·목록 행·주제 라벨을 고르면 열리고, ✕·Escape로 닫으면 선택이 지워진다. 현재 `DetailPanel`·`ClusterPanel` 내용은 그대로다.
- 에이전트는 매 턴 현재 맥락(run·모델, 화면, 선택 논문·주제, 검색어·연도 필터, 카메라)을 받는다.
- 에이전트가 쓰는 도구는 전부 **웹뷰 안에서 실행**된다. 데이터 도구(논문 검색, 논문 상세, 주제 상세)는 기존 `api.ts` 전송 계층(브라우저 `/api`, 데스크톱 `invoke`)을 부르고, 지도 도구(필터 적용, 논문·주제·좌표로 카메라 이동, 확대·축소, 라벨·지시선 표시와 지우기, 선택)는 지도 상태를 직접 바꾼다. 도구 호출은 채팅에 카드로 보인다.
- 대화는 새로고침 뒤에도 복원된다. 같은 세션을 서버가 이어가므로 이전 턴을 기억한 채 대답한다. 모델(run)을 바꾸면 새 대화를 시작한다.
- 브라우저 개발(Vite)과 `tauri dev` 양쪽에서 동작한다. 에이전트 서버는 저장소 안의 Node 패키지 하나이며 프레임워크의 `route.ts`·`bridge.ts`를 옮긴 것이다. 지도·데이터를 모르고, 도구 호출을 웹뷰에 중계하고 결과를 돌려주는 일만 한다.
- 기존 다섯 화면·논문 목록·URL 복원·E2E는 새 구조에 맞춰 갱신된 채로 통과한다.

## 영향 범위

`frontend/src/components/{AppShell,Inspector}.tsx`, `hooks/use-persistent-layout.ts`, `views/MapView.tsx`(카메라·주석 레이어 노출), 신규 `frontend/src/agent/`(런타임·도구·맥락), `frontend/src/components/assistant-ui/`(`@acf` 설치본), 신규 `agent/`(Node 서버), `frontend/vite.config.ts`(프록시), `src-tauri`(개발 시 localhost 접근 허용), `.claude/launch.json`, `e2e/`, README·ARCHITECTURE. 사용자는 연구자 본인이며 범위 결정도 본인이 한다.

## 제약

- 베이스는 `feat/desktop-app`(PR #4, 미병합)이다. 브랜치 `feat/agent-chat`, 워크트리 `.worktree/agent-chat`.
- 프레임워크 컴포넌트는 `@acf` 레지스트리로 설치하고 설치본만 고친다. 프레임워크 저장소와 `vendor/`는 건드리지 않는다. 고친 파일에는 `NOTE(constellation)` 주석을 남긴다.
- 에이전트 서버는 Claude Agent SDK(TS)를 쓰므로 기계에 `claude` CLI 로그인 또는 `ANTHROPIC_API_KEY`가 있어야 한다. 서버는 `settingSources: []`·`strictMcpConfig: true`로 격리하고, SDK 기본 파일 도구(Read/Glob/Grep 등)는 허용하지 않는다.
- shadcn·design-ops 스킬 규칙을 따른다. 치수는 측정 프로필에서 고르고 `components.json`은 `frontend/`의 것을 쓴다.
- Python은 실행 시점에 쓰지 않는다. 분석 알고리즘·DB 스키마·Rust 질의 계층은 바꾸지 않는다.

## 범위 밖

- `.app`에 에이전트 서버를 사이드카로 묶는 것(bun compile, `claude` 바이너리 경로 결정). 다음 변경.
- 에이전트 서버를 Rust로 다시 쓰는 것. 도구가 전부 웹뷰에서 돌기 때문에 서버 교체는 프론트를 건드리지 않는다.
- 도구 승인 UI. 이번 도구는 모두 읽기·화면 조작이라 승인 없이 실행한다.
- 스레드 목록·다중 대화, 첨부 파일, 음성, 모델 선택 UI, 프레임워크의 파일 도구.
- 좁은 창(≤959px) 채팅 레이아웃의 최적화. 기존 인스펙터처럼 Sheet로 열리기만 한다.

## 열린 질문

- 해결(2026-09-17, 사용자): 백엔드는 `feat/desktop-app` 위에서 시작한다. 런타임은 Node 에이전트 서버로 하고 사이드카 번들은 미룬다(사용자가 셋 중 판단을 맡겨 제안대로 진행).
- 해결(2026-09-17, 사용자): 인스펙터 모달 전환을 같은 변경에 포함한다. 대화는 새로고침 뒤 복원한다.
- 지도 주석(라벨·지시선)은 세션 안에서만 산다. 새로고침하면 사라진다. 이대로 둘지 spec에서 정한다.
