---
title: 채팅 작성창의 모델 선택기 — Claude·Codex, model·effort·speed
slug: agent-providers
stage: spec
status: accepted
intent: .intent/intent_agent-providers.md
date: 2026-09-19
---

# 채팅 작성창의 모델 선택기 — Claude·Codex, model·effort·speed — 명세

## 요구사항

- [ ] `GET /api/agent/models`가 프레임워크와 같은 모양(`{ providers: [{ id, name, models, error? }] }`)을 준다. Codex CLI가 없으면 그 항목에 `error`가 실리고 Claude는 그대로다.
- [ ] `POST /api/agent` 본문 `modelName` 접두사로 백엔드를 고른다. `sessionId`는 두 프로바이더 모두 클라이언트 UUID(중계 키)이고, Codex는 `codexThreadId`를 따로 받는다. 첫 Codex 턴은 그 값이 없고, 응답 `data-session.codexThreadId`를 클라이언트가 저장해 다음 턴부터 보낸다.
- [ ] Claude 턴은 `model`·`effort`·`settings.fastMode`를 SDK에 넘긴다. `CONSTELLATION_AGENT_MODEL` 환경 변수는 `modelName`이 없을 때만 쓴다.
- [ ] Codex 턴에서 웹뷰 도구가 돈다: 서버가 `POST/GET/DELETE /mcp/:sessionId`(streamable HTTP MCP, 서버 이름 `ui`)를 열고 `thread/start`·`resume`의 `config.mcp_servers.ui.url`로 넘긴다. 핸들러는 그 세션의 `Relay.waitFor`를 부른다. 브리지는 `mcpToolCall(server === "ui")` 아이템을 `item/started`에서 `observeCall`·`addToolCallPart`(이름은 `tool`) 하고, `item/completed`에서는 결과를 다시 붙이지 않는다(Claude 브리지 규칙 2와 같다).
- [ ] 시스템 프롬프트는 `developerInstructions`, 웹 검색은 Codex 내장. `sandbox: read-only`, `approvalPolicy: never`, 전용 `CODEX_HOME`(`agent/.codex-home`, `CODEX_ISOLATED_HOME`으로 바꿀 수 있음), `~/.codex/auth.json` 읽기 전용 토큰 로그인 — 프레임워크 결정 6 그대로.
- [ ] 대화 저장이 run·프로바이더 단위다: `constellation.agent.v2:<run>:<provider>`. v1 키는 Claude 대화로 읽는다. 프로바이더를 바꾸면 그 프로바이더의 대화로 갈아탄다(없으면 새 대화). "새 대화"는 현재 프로바이더의 대화만 비운다.
- [ ] 작성창 왼쪽 아래에 선택기(`@acf/model-selector-aui` 설치본 + `logos`). 프로바이더 그룹(로고), 모델별 effort, speed. 선택은 `constellation.agent.model.v1`에 남고 다음 턴부터 적용된다.
- [ ] 서버가 꺼져 있으면(`GET /api/agent/health` 실패 또는 요청의 네트워크 오류) 채팅 자리에 "에이전트 서버가 꺼져 있습니다"와 실행 명령, 다시 시도 버튼이 보인다. 다시 시도가 성공하면 대화가 그대로 돌아온다.
- [ ] 새로고침 복원·중단·도구 카드·사고 과정·사용량이 두 프로바이더에서 같은 모양이다.
- [ ] `agent/` node:test, `frontend` vitest·tsc·oxlint·E2E(canned stream 테스트에 health·models 목 추가)가 통과한다.

## 설계

**서버.** 프레임워크 `src/lib/agent/codex/{protocol,app-server,bridge}.ts`·`models.ts`를 `agent/src/codex/`·`agent/src/models.ts`로 옮긴다(`NOTE(constellation)`). 브리지는 `onToolCall` 대신 `relay`를 직접 받아 `ui` 서버 호출을 중계 도구로 다룬다. `agent/src/mcp-endpoint.ts`: `@modelcontextprotocol/sdk`의 `McpServer` + `WebStandardStreamableHTTPServerTransport`(stateless, 요청마다 생성)로 `relays.get(sessionId)`의 manifest에서 도구를 등록하고 `relay.waitFor`로 답한다. `server.ts`: `parseModelId` → Claude 갈래는 기존 코드 + model·effort·fastMode, Codex 갈래는 `thread/start|resume` → `data-session` → `pipeCodexTurnToStream`. `relays` 맵에 `{ relay, manifest }`를 둔다. `GET /api/agent/models` 추가. CORS는 `/mcp/*`에 필요 없다(codex 프로세스가 직접 부른다).

**저장.** `history.ts`: `StoredThread { version: 2, provider, sessionId, codexThreadId?, repository }`, `threadKey(run, provider)`, `readThread`가 v1 폴백. `createHistoryAdapter`가 `patch({ codexThreadId })`를 노출한다. `use-agent-thread.ts`는 `provider`를 받아 키에 넣는다.

**선택.** `frontend/src/agent/settings.ts`: 프레임워크 `model-selection.ts`를 옮긴 것(`useSyncExternalStore`). `AppShell`이 `useModelSelection()`으로 provider를 읽어 `useAgentThread(run, provider)`에 준다.

**런타임.** `AgentProvider`: `body: () => ({ sessionId, codexThreadId, speed })`, `onFinish`에서 `session` 파트의 `codexThreadId`를 어댑터에 `patch`. `AgentModelSelector.tsx`(프레임워크 `chat-model-selector.tsx`를 옮김, `AGENT_API/models`). `thread.aui.tsx`에 `ComposerLeading` 슬롯을 프레임워크와 같은 코드로 넣고 `AgentSidebar`가 `components={{ ComposerLeading: AgentModelSelector }}`로 붙인다.

**서버 꺼짐.** `frontend/src/agent/use-agent-health.ts`: 마운트 때 `health`를 부르고, `AgentProvider.onError`의 `TypeError`(fetch 실패)도 같은 상태로 모은다. `AgentSidebar`가 offline이면 `Thread` 대신 `AgentOffline` 안내를 그린다.

## 버린 대안

- Codex 스레드 id를 `sessionId`로 바꿔 쓰기(프레임워크 방식): Constellation은 `sessionId`가 중계 키라 도구 실행 중에 바뀌면 `tool-result`가 짝을 잃는다. 키를 클라이언트 UUID로 고정하고 스레드 id를 따로 든다.
- 프로바이더가 바뀔 때 대화를 지우기: run 하나에 프로바이더별 대화를 두면 잃는 것이 없다.
- `thread-aui`를 레지스트리에서 다시 설치하기: Constellation 개조(첨부 버튼 제거, 한국어 문구)가 덮인다. 슬롯 코드만 옮긴다.

## 함정

- Codex의 `mcpToolCall.arguments`가 `item/started`에 오는지는 실측으로 확인한다. 안 오면 `item/completed`에서 `observeCall`한다(핸들러는 `matchTimeoutMs` 안에서 기다린다).
- MCP 도구 목록은 스레드가 열릴 때 codex가 읽는다. Constellation 도구 집합은 고정이라 문제없지만, 요청마다 다른 manifest를 보내는 클라이언트는 첫 manifest만 반영된다.
- `WebStandardStreamableHTTPServerTransport`는 SDK 1.24+에 있다. zod 4와 같이 쓸 수 있는 버전인지 설치 때 확인한다.
- Vite 프록시는 `/api/agent`만 넘긴다. `/mcp`는 codex → 서버 직결이라 프록시가 필요 없다.
- E2E의 `page.route("**/api/agent")`는 `/api/agent/health`·`/models`에 안 걸린다. 둘을 따로 목한다.

## 완료 기준

```
npm --prefix agent test && npm --prefix agent run typecheck
npm --prefix frontend run build && npm --prefix frontend run lint && npm --prefix frontend test
npm --prefix frontend run test:e2e
curl -s 127.0.0.1:8787/api/agent/models | jq -c '.providers[] | {id, n: (.models|length), error}'
```

브라우저(Vite)·`tauri dev`: 선택기에서 Codex 모델·Fast → "지도를 두 단계 확대해 줘" → `zoom` 카드 → 지도가 움직인다. Claude·xhigh로 바꾸면 Claude 대화로 갈아탄다. 서버를 끄고 새로고침 → 꺼짐 안내 → 서버 켜고 다시 시도 → 대화 복원.
