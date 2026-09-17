---
title: 우측 사이드바를 에이전트 채팅으로 — agent-chat-framework 기반
slug: agent-chat
stage: plan
status: accepted
intent: .intent/intent_agent-chat.md
spec: .intent/spec_agent-chat.md
date: 2026-09-18
---

# 우측 사이드바를 에이전트 채팅으로 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `agent/package.json`, `agent/tsconfig.json`, `agent/.gitignore` (신규) | Hono·Agent SDK·assistant-stream·zod. `npm start` = `node src/server.ts`, `npm test` = `node --test` |
| `agent/src/server.ts` (신규) | `POST /api/agent`(query + 브리지 + 스트림 응답), `POST /api/agent/tool-result` |
| `agent/src/bridge.ts` (신규) | 프레임워크 `src/lib/agent/bridge.ts` 복사. 접두사 제거·중계 도구 결과 생략·이름별 id FIFO. `NOTE(constellation)` |
| `agent/src/relay.ts`, `agent/src/relay.test.ts` (신규) | JSON 스키마 부분집합 → zod v4 shape, `createSdkMcpServer("ui")`, 대기 결과 맵(60초) |
| `agent/src/session.ts` (신규) | `lastUserText`·`isFirstTurn`·요청 본문 타입 |
| `frontend/components.json` | `@acf` 레지스트리 등록 |
| `frontend/src/components/assistant-ui/elements/*.tsx`(11), `src/hooks/use-{copy-to-clipboard,attachment-src}.ts`, `src/components/ui/{avatar,collapsible,dialog}.tsx` (신규) | `npx shadcn@latest add @acf/thread-aui avatar collapsible dialog` 설치본 |
| `frontend/package.json`, `package-lock.json` | assistant-ui 계열·remark-gfm 추가 |
| `frontend/vite.config.ts` | `/api/agent` → 8787 프록시(`/api`보다 앞) |
| `frontend/src/agent/AgentProvider.tsx`(런타임·도구 등록·맥락), `agent/use-agent-thread.ts`, `agent/{context,resolve,history,tools}.ts`, `agent/agent.test.ts` (신규) | 런타임·도구 12개·시스템 프롬프트·좌표 해석·localStorage 히스토리 |
| `frontend/src/components/assistant-ui/elements/{thread.aui,reasoning,tool-group.aui,tool-fallback.aui,markdown-text}.tsx` | 화면 문자열 한국어화, 첨부 버튼 제거 (`NOTE(constellation)`) |
| `frontend/package.json` | `@types/json-schema` (도구 스키마 타입) |
| `frontend/src/store.ts` | `cameraRequest`·`annotations`와 setter. `detailOpen` 제거 |
| `frontend/src/views/MapView.tsx` | `cameraRequest` 소비 효과, 주석 SVG 오버레이 |
| `frontend/src/index.css` | `.map-annotations` 스타일, 채팅 패널 보정 |
| `frontend/src/hooks/use-persistent-layout.ts`, `.test.ts` | v3 `{navOpen, chatOpen}` |
| `frontend/src/components/AgentSidebar.tsx`, `InspectorDialog.tsx` (신규), `Inspector.tsx` (삭제) | 스펙의 두 컴포넌트 |
| `frontend/src/components/AppShell.tsx` | Provider·헤더 버튼·우측 렌더·Dialog·모바일 Sheet |
| `frontend/e2e/exploration.spec.ts` | 선택자 갱신 + 채팅 패널·Dialog 시나리오 |
| `.claude/launch.json`, `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCT-FOUNDATION-QA.md` | 에이전트 서버 실행·요구 사항·검증 기록 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. **서버** — `agent/` 생성, 브리지 복사, relay·server 작성. `npm test` 통과. `curl -N`으로 `/api/agent`에 `{messages:[{role:"user",content:"안녕"}], tools:{}, system:"...", sessionId}`를 보내 `0:"…"` 라인이 흐르는지, 가짜 도구 하나로 `tool-result` 왕복이 되는지 확인. 커밋 `feat: 에이전트 서버 — Agent SDK 브리지와 도구 중계`.
2. **프레임워크 설치** — 레지스트리 등록 후 add. 설치본을 읽어 base-nova·import 경로 확인, `npx tsc -b` 통과. `git status`로 다른 파일 변화 없음 확인. 커밋 `feat: agent-chat-framework 컴포넌트 설치`.
3. **셸·인스펙터** — layout v3, `InspectorDialog`, `AgentSidebar`(빈 Thread), `AppShell` 개편, `Inspector.tsx` 삭제. `npm run build` 통과. 브라우저: 패널 토글·복원, 선택 → Dialog → Escape.
4. **런타임·맥락·히스토리** — `AgentProvider`·`context.ts`·`history.ts`. 서버 켜고 첫 대화가 스트리밍되고 새로고침 뒤 복원되는지 확인.
5. **도구·지도 제어** — `store.ts`·`MapView` 확장, `resolve.ts`, `AgentTools`. 데이터 도구 → 지도 도구 순으로 하나씩 브라우저에서 호출 확인. 3–5를 한 커밋 `feat: 우측 사이드바 에이전트 채팅과 인스펙터 Dialog`로 묶는다(3만 따로 두면 빈 패널이 남는다).
6. **E2E·문서** — 선택자 갱신, 채팅 패널·Dialog 시나리오, launch.json·README·ARCHITECTURE·QA. `npm run test:e2e` 통과. 커밋 `test: …`, `docs: …`.
7. `tauri dev`에서 스펙의 브라우저 경로 한 번. 결과를 QA 문서에 적는다.

`git add`는 파일을 지정한다.

## 구현 중 계획에서 더한 것 — 2026-09-18

- 도구 실행기가 URL 상태를 읽는 통로는 ref 가 아니라 `useRouter().state.location.search` 다. 렌더 중 ref 접근 경고를 피하고 항상 실시간 값을 읽는다.
- `useAgentThread` 는 파일을 따로 뒀다(컴포넌트 파일에서 훅을 내보내면 Fast Refresh 경고).
- 브라우저 확인에서 트리·갈래 화면의 노드 클릭도 Dialog 를 연다. 사용자가 고른 모달 방식의 결과이므로 그대로 두고 보고한다.

## 가장 위험한 단계

5단계의 도구 중계다. 클라이언트 `execute` → `tool-result` POST → MCP 핸들러 반환 → 모델 다음 턴이 한 줄로 이어지지 않으면 대화가 60초 멈춘다. 1단계에서 curl로 왕복을 먼저 증명하고, 실패하면 브리지의 id 짝짓기(이름별 FIFO)와 접두사 제거를 의심한다. 되돌리기: 5단계 커밋만 `git revert`하면 3–4의 채팅(도구 없음)은 남는다.

둘째는 3단계의 `AppShell` 개편이다. `selectionRef` 효과를 지우면서 딥링크 열림이 깨질 수 있다. Dialog는 `hasSelection`만 보므로 URL에서 바로 열린다. 깨지면 E2E 1번이 잡는다.

## 검증

```sh
cd agent && npm test
cd frontend
npm run test -- --run
npm run build
npm run lint
npm run test:e2e
```

브라우저 경로는 spec의 완료 기준과 같다. 에이전트 서버는 `.claude/launch.json`의 `constellation-agent`로 띄운다.
