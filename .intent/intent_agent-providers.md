---
title: 채팅 작성창의 모델 선택기 — Claude·Codex, model·effort·speed
slug: agent-providers
stage: intent
status: accepted
author: minjaepark
date: 2026-09-19
---

# 채팅 작성창의 모델 선택기 — Claude·Codex, model·effort·speed

## 문제

에이전트 채팅은 Claude 한 백엔드에 서버 환경 변수로 고정한 모델만 쓴다. 작성창에서 모델·effort·speed를 고를 수 없고, 이 기계에 로그인된 codex CLI를 쓸 길이 없다. 프레임워크가 Codex 백엔드와 프로바이더별 선택기를 갖추면(`agent-chat-framework` intent `codex-backend`) 그것을 Constellation에 옮긴다.

## 원하는 결과

- 작성창 왼쪽 아래에 레지스트리 `model-selector`가 있다. 프로바이더 그룹(Claude·Codex, 로고)별 모델, 모델이 지원하는 effort, speed(Fast) 토글. 목록은 `GET /api/agent/models`에서 온다. 선택은 run·대화와 무관한 사용자 설정으로 localStorage에 남고 다음 턴부터 적용된다.
- 프로바이더는 대화(스레드) 단위로 고정된다. Claude는 클라이언트 UUID를 세션 id로 쓰고, Codex는 첫 턴의 `thread/start`가 준 스레드 id를 받아 저장한다. 프로바이더를 바꾸면 "새 대화"가 된다. 모델·effort·speed는 같은 대화 안에서 턴마다 바꿀 수 있다.
- 에이전트 서버는 프레임워크의 Codex app-server 클라이언트·브리지를 옮겨 모델 id 접두사로 분기한다. 웹뷰 도구는 Codex에도 똑같이 중계한다: 서버가 세션별 streamable-HTTP MCP 엔드포인트(`/mcp/<sessionId>`)를 열고 `thread/start`의 `config.mcp_servers.ui.url`로 넘긴다. 핸들러는 기존 `Relay`를 그대로 쓴다. 중계 키는 그 턴에 클라이언트가 보낸 `sessionId`다.
- 시스템 프롬프트(현재 화면 맥락)는 Codex에서 `developerInstructions`로 들어간다. 웹 검색은 Codex 내장 `web_search`를 켠다.
- 도구 카드·사고 과정·사용량은 Claude와 같은 모양으로 보인다. 새로고침 복원·"새 대화"·중단은 두 프로바이더 모두 동작한다.
- 에이전트 서버가 꺼져 있으면 "Load failed" 대신 서버가 꺼져 있다는 안내와 다시 시도 버튼이 보인다(`GET /api/agent/health` 실패로 판정). 서버를 앱이 직접 띄우는 것은 다음 변경(`agent-sidecar`)이다.

## 영향 범위

`agent/src/{server,codex-bridge,app-server,mcp-endpoint}.ts`·테스트·`package.json`(`@modelcontextprotocol/sdk`), `frontend/src/agent/{AgentProvider,history,settings}.ts(x)`, `frontend/src/components/AgentSidebar.tsx`·`assistant-ui/elements/{thread.aui,model-selector*}.tsx`(레지스트리 설치본), `components.json`, E2E, README·ARCHITECTURE·QA.

## 제약

- 브랜치 `feat/agent-providers`, 워크트리 `.worktree/agent-providers`. 프레임워크 변경이 먼저 로컬 `main`에 들어간 뒤 `@acf` 레지스트리에서 설치한다.
- Codex는 이 기계의 `codex` 로그인을 쓴다. `sandbox: read-only`, `approvalPolicy: never`. 파일·셸 도구는 Claude와 같이 닫는다.
- 프레임워크 설치본 수정에는 `NOTE(constellation)`. design-ops·shadcn 규칙을 따른다.

## 범위 밖

- Gemini. 프레임워크에 백엔드가 생긴 뒤 같은 방식으로 붙인다.
- Codex 승인 UI, 스레드 목록.
- 에이전트 서버를 앱이 띄우는 것(dev 자동 기동, `.app` 사이드카). 별도 intent `agent-sidecar`.

## 열린 질문

- 해결(2026-09-19, 사용자): 프레임워크를 먼저 만들고 레지스트리로 옮긴다.
- 해결(2026-09-19, 사용자): 서버 기동은 `.app` 사이드카까지 고친다. 별도 변경으로 나눈다.
