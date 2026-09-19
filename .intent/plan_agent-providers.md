---
title: 채팅 작성창의 모델 선택기 — Claude·Codex, model·effort·speed
slug: agent-providers
stage: plan
status: accepted
intent: .intent/intent_agent-providers.md
spec: .intent/spec_agent-providers.md
date: 2026-09-19
---

# 채팅 작성창의 모델 선택기 — Claude·Codex, model·effort·speed — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `agent/package.json`·`package-lock.json` | `@modelcontextprotocol/sdk` 추가 |
| `agent/src/codex/{protocol,app-server,bridge}.ts` (신규) | 프레임워크에서 옮김. 브리지는 `relay`로 `ui` 도구 중계 |
| `agent/src/models.ts` (신규) | 카탈로그·`parseModelId` |
| `agent/src/mcp-endpoint.ts` (신규) | `/mcp/:sessionId` streamable HTTP MCP |
| `agent/src/session.ts` | `ChatRequest`에 `modelName`·`reasoningEffort`·`speed`·`codexThreadId` |
| `agent/src/bridge.ts` | `data-session`에 `provider` |
| `agent/src/server.ts` | 분기, `/api/agent/models`, `/mcp/*`, relays에 manifest |
| `agent/src/codex.test.ts` (신규) | `parseModelId`·Codex 브리지(중계·웹 검색·실패·중단) 테스트 |
| 루트 `.gitignore` | `.codex-home/` |
| `frontend/src/components/assistant-ui/elements/{model-selector,model-selector.aui,logos}.tsx` (신규) | `@acf` 설치본 |
| `frontend/src/components/assistant-ui/elements/thread.aui.tsx` | `ComposerLeading` 슬롯 |
| `frontend/src/agent/settings.ts` (신규) | 모델 선택 저장·`useModelSelection` |
| `frontend/src/agent/history.ts` | v2, provider·codexThreadId, `patch` |
| `frontend/src/agent/use-agent-thread.ts` | provider 인자 |
| `frontend/src/agent/use-agent-health.ts` (신규) | health·오프라인 상태 |
| `frontend/src/agent/AgentProvider.tsx` | body·onFinish·onError |
| `frontend/src/agent/AgentModelSelector.tsx` (신규) | 선택기 |
| `frontend/src/components/AgentSidebar.tsx` | 슬롯 연결, 오프라인 안내 |
| `frontend/src/components/AppShell.tsx` | provider 전달 |
| `frontend/src/agent/agent.test.ts` | history v2·settings 테스트 |
| `frontend/vite.config.ts` | `/api/agent` 프록시 대상을 `CONSTELLATION_AGENT` 로 바꿀 수 있게(워크트리 검증용) |
| `frontend/e2e/exploration.spec.ts` | health·models 목 |
| `README.md`·`docs/ARCHITECTURE.md`·`docs/PRODUCT-FOUNDATION-QA.md` | 갱신 |

## 작업 순서

1. `shadcn add @acf/model-selector-aui @acf/logos`(레지스트리는 `http://127.0.0.1:3100/r`에 프레임워크 `public/`을 정적으로 띄움) — 파일 3개 생김, `tsc -b` 통과.
2. 서버: codex 모듈 옮기고 `models.ts`·`/api/agent/models` — `curl`로 두 프로바이더.
3. `mcp-endpoint.ts` + Codex 브리지 중계 + `server.ts` 분기 — `curl`로 `tools:{zoom}` manifest를 보낸 Codex 턴에서 `zoom` tool-call 파트가 오고, `tool-result`를 넣으면 턴이 끝난다. `arguments`가 `item/started`에 오는지 여기서 확인해 브리지를 맞춘다. (실측: `arguments`는 `item/started`에 온다. `approvalPolicy: never`에서 codex가 MCP 도구를 승인 대상으로 보고 거부해 `tools/call`이 오지 않았고, 도구에 `annotations.readOnlyHint`를 달아 해결했다.)
4. 프론트 저장·선택·런타임(`history`·`settings`·`use-agent-thread`·`AgentProvider`·`AppShell`) — vitest.
5. 선택기·슬롯·오프라인 안내(`thread.aui`·`AgentModelSelector`·`AgentSidebar`·`use-agent-health`) — 브라우저에서 Codex zoom, Claude 전환, 서버 꺼짐.
6. 테스트·E2E·문서, 커밋, PR.

## 가장 위험한 단계

3단계. codex 프로세스가 `/mcp/<sessionId>`에 붙지 못하거나 도구 목록을 못 읽으면 Codex에서 도구가 아예 없다. 실패하면 `mcpServerStatus/list`로 상태를 읽어 원인을 찾는다. 되돌리기: Codex 갈래는 `modelName` 접두사로만 들어오므로 선택기에서 Codex 그룹을 숨기면 Claude 경로는 그대로다.

## 검증

```
npm --prefix agent test && npm --prefix agent run typecheck
npm --prefix frontend run build && npm --prefix frontend run lint && npm --prefix frontend test
npm --prefix frontend run test:e2e
curl -s 127.0.0.1:8787/api/agent/models | jq -c '.providers[] | {id, n: (.models|length), error}'
```

UI: 우측 채팅 작성창 왼쪽 아래 선택기 → Codex·GPT-5.5·Low·Fast → "지도를 두 단계 확대해 줘" → zoom 카드·지도 이동 → Claude·Opus·xhigh 선택 → Claude 대화로 전환 → 서버 종료·새로고침 → 꺼짐 안내 → 서버 기동·다시 시도 → 대화 복원.
