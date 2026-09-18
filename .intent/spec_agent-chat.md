---
title: 우측 사이드바를 에이전트 채팅으로 — agent-chat-framework 기반
slug: agent-chat
stage: spec
status: accepted
intent: .intent/intent_agent-chat.md
date: 2026-09-18
---

# 우측 사이드바를 에이전트 채팅으로 — 명세

## 요구사항

- [x] 우측 사이드바는 `Sidebar side="right" collapsible="none"`(`data-testid="agent-chat"`, 폭 24rem)이며 프레임워크 `@acf/thread-aui`의 `Thread`를 담는다. 헤더에 eyebrow "AGENT", "새 대화" 버튼, ✕(닫기)가 있다. 헤더의 "에이전트 패널 전환" 버튼(`aria-pressed`)으로 여닫고, 열림 상태는 `localStorage["constellation.layout.v3"]` = `{version:3, navOpen, chatOpen}`에 저장한다. v2 키는 읽지 않고 기본은 `navOpen=true, chatOpen=false`. 좁은 창(≤959px)은 `Sheet side="right"`로 연다.
- [x] 논문·주제·분야 상세는 `Dialog`(`DialogContent data-testid="inspector"`, 폭 `sm:max-w-lg`=512px, 패딩은 설치된 base-nova Dialog 값 16px 유지)다. `selected`·`cluster`·`node` 중 하나라도 있으면 열리고, 닫으면(✕·Escape·바깥 클릭) 셋을 지운다. 내용은 기존 `DetailPanel`·`ClusterPanel` 그대로이며 Dialog 안에 `h2`는 패널 제목 하나뿐이다. `Inspector.tsx`·`detailOpen`·인스펙터 Sheet는 사라진다.
- [x] 에이전트 서버 `agent/`는 `POST /api/agent`(assistant-ui 데이터 스트림, 헤더 `x-vercel-ai-data-stream: v1`)와 `POST /api/agent/tool-result`(`{sessionId, toolCallId, result, isError}`)를 127.0.0.1:8787에 연다. `node agent/src/server.ts`로 뜬다(Node 26 타입 스트리핑, 별도 트랜스파일러 없음). Vite는 `/api/agent`를 8787로, 나머지 `/api`는 8000으로 프록시한다.
- [x] 서버는 요청 본문의 `tools`(assistant-ui가 보내는 JSON 스키마)로 매 요청 SDK MCP 서버 `ui`를 만든다. 지원 스키마는 object(중첩 가능) + string·number·integer·boolean·enum·array 속성, `required`, `description`뿐이며 그 밖은 400으로 거절한다. 핸들러는 클라이언트가 `tool-result`로 보낸 결과를 기다려(60초 타임아웃, MCP 서버 타임아웃은 90초) 모델에 돌려준다. 툴 호출 id는 브리지가 `content_block_start`에서 본 `tool_use.id`를 **이름 + 정규화한 인자**로 짝짓고, 같은 것이 여럿이면 먼저 관찰된 순서(FIFO), 인자가 안 맞으면 같은 이름 중 먼저 온 것으로 떨어진다. 요청이 끊기면(`Request.signal`) SDK `abortController`를 중단하고 기다리는 핸들러를 전부 깨운다.
- [x] 브리지는 프레임워크 `bridge.ts`를 옮긴 것이다. 차이는 두 가지: `mcp__ui__` 접두사를 떼어 클라이언트 도구 이름으로 `addToolCallPart`하고, 중계 도구는 서버가 결과를 다시 보내지 않는다(클라이언트가 이미 실행·표시했다). 그 외 텍스트·사고 과정·`data-session`·`data-usage`는 같다.
- [x] SDK 옵션: `cwd`는 `agent/` 절대 경로로 고정(세션 파일이 cwd 해시 아래에 놓이므로 어디서 띄우든 같은 세션을 찾는다), `systemPrompt`는 요청의 `system`(문자열), `includePartialMessages: true`, `thinking: {type:"adaptive", display:"summarized"}`, `settingSources: []`, `strictMcpConfig: true`, 내장 도구 없음(`tools: []`), `allowedTools`는 `mcp__ui__<name>` 전부, `permissionMode: "default"`. 세션 파일이 있으면(`getSessionInfo(sessionId, {dir: cwd})`) `resume`, 없으면 `sessionId`. 메시지 수로 첫 턴을 판별하지 않는다 — 실패한 첫 턴을 다시 보낼 때 없는 세션을 resume하게 된다.
- [x] 클라이언트 `src/agent/`: `AgentProvider`(`useDataStreamRuntime({api:"/api/agent", body:()=>({sessionId}), adapters:{history}})`), `AgentTools`(`useAssistantTool`로 도구 등록), `useAgentContext`(`useAssistantInstructions`로 매 턴 시스템 프롬프트). Provider는 `AppShell` 전체가 아니라 채팅 서브트리(`AgentTools`+`AgentSidebar`+모바일 Sheet 내용)만 감싸고 `key={run}:${generation}`으로 run 변경·"새 대화"에서 그 서브트리만 다시 마운트한다(지도는 카메라를 잃지 않는다). 시스템 프롬프트는 역할·규칙 + 현재 run(모델명·논문 수), 화면, 선택 논문(제목·연도)·주제(라벨), 검색어·연도 필터, 카메라 단계(field/topic/paper — 줌 수치는 넣지 않아 팬 중 갱신이 없다)를 담는다. 규칙에는 "`select`는 사용자가 열어 달라고 할 때만, 보여 주기는 `fly_to`·`annotate`로"를 넣는다.
- [x] 도구(전부 웹뷰 실행, 결과는 JSON 문자열): `list_topics`, `get_topic{cluster_id}`, `search_papers{query?,year_from?,year_to?,sort?}`(첫 페이지 25편), `get_paper{id}`(초록 1,500자까지), `set_filter{query?,year_from?,year_to?}`(적용 후 일치 수 반환), `select{paper_id?|cluster_id?}`(빈 인자면 해제), `fly_to{paper_id?|cluster_id?|x?,y?; level?: field|topic|paper}`, `zoom{steps}`, `annotate{items:[{paper_id?|cluster_id?|x?,y?, label}]}`, `clear_annotations`, `set_view{view}`, `set_color_by{color}`. 데이터 도구는 `api.ts`의 `fetch*`를 부르고 run은 현재 run이다.
- [x] 지도 제어: `store.ts`에 `cameraRequest{run, target?, zoom?, level?, steps?, nonce}`와 `annotations: Annotation[]`(해석된 좌표·라벨)를 둔다. `MapView`는 `cameraRequest`를 효과에서 소비해 `move()`로 애니메이션하고(level→ `home.zoom + {field:0, topic:2, paper:3.5}`), 주석은 `.map-labels` 옆 SVG 오버레이에 점→라벨 지시선과 라벨을 `viewport.project`로 그린다. 주석은 세션 안에서만 산다.
- [x] 대화 복원: `localStorage["constellation.agent.v1:<run>"]` = `{sessionId, repository}`. `ThreadHistoryAdapter.load`가 복원하고 `append`/`update`가 저장한다. run이 바뀌면 그 run의 키를 읽고, "새 대화"는 새 UUID로 키를 덮어쓴다. 서버는 `resume`으로 같은 세션을 이어간다.
- [x] 좁은 창·Tauri: `tauri dev`는 Vite devUrl을 쓰므로 프록시가 그대로 적용된다. `src-tauri`는 바꾸지 않는다.
- [x] 설치본의 화면 문자열(작성창 placeholder·툴팁·환영 문구·"도구 호출 N건"·"사고 과정")은 한국어다. 작성창의 첨부 버튼은 뺀다(서버가 텍스트만 받는다). 수정한 파일마다 `NOTE(constellation)`.
- [x] 기존 E2E 9개가 새 선택자(`agent-chat`, `에이전트 패널 전환`, `layout.v3`, Dialog `inspector`)로 통과하고, 채팅 패널 토글·복원과 Dialog 열림·닫힘·선택 해제를 확인하는 시나리오가 있다. 에이전트 실응답은 Claude 로그인이 필요해 E2E에서 뺀다. 브라우저 수동 확인으로 대신하고 결과를 QA 문서에 남긴다.

## 설계

- 프레임워크 설치: `frontend/components.json`에 `"@acf": "http://127.0.0.1:3100/r/{name}.json"`을 등록하고, 프레임워크 `public/`을 `python3 -m http.server 3100`으로 띄운 채 `npx shadcn@latest add @acf/thread-aui avatar collapsible dialog`를 돌린다. 13개 파일이 `src/components/assistant-ui/elements/`·`src/hooks/`에 들어오고 npm은 `@assistant-ui/react`·`@assistant-ui/react-markdown`·`@assistant-ui/react-data-stream`·`remark-gfm`·`tw-shimmer`가 붙는다. `radix-ui`는 `tooltip-icon-button`의 `Slot.Slottable` 하나 때문에 딸려 오는데 Base UI render 패턴에서는 하는 일이 없어 그 줄을 떼고 패키지를 넣지 않는다. 기존 `button`·`skeleton`·`textarea`·`tooltip`은 덮어쓰지 않는다(CLI 프롬프트에 n). 설치본이 프레임워크 `globals.css`에 기대는 것 — `tw-shimmer`(`shimmer` 클래스), `data-open`/`data-closed` 커스텀 변형, Base UI 변수를 쓰는 `collapsible-down/up` 키프레임 — 을 `index.css`에 옮긴다(`[data-aui]` 계열은 11개 파일이 쓰지 않으므로 옮기지 않는다). 설치본 수정은 `NOTE(constellation)` 주석으로 표시.
- `AppShell`: `Inspector`·`detailOpen`·`selectionRef`를 걷어내고 `AgentSidebar`(데스크톱)·`Sheet`(모바일)·`InspectorDialog`를 둔다. `AssistantRuntimeProvider`는 `AgentPanel`(도구 등록 + 사이드바 내용) 서브트리만 감싸며 `AppShell` 안에 있으므로 도구가 라우터·쿼리·스토어 훅을 쓴다.
- `AgentSidebar`: 기존 `Inspector` 골격 재사용. `Thread`는 `SidebarContent` 안에서 `min-h-0 flex-1`.
- `InspectorDialog`: `Dialog open onOpenChange` + `DialogContent` + `DialogTitle`(AT용, `render={<p/>}`로 `h2` 중복 회피) + 패널.
- 서버 `agent/src/`: `server.ts`(Hono + `@hono/node-server`, 두 라우트), `bridge.ts`(프레임워크 복사 + 두 변경), `relay.ts`(JSON 스키마→zod v4 shape, `createSdkMcpServer`, 대기 결과 맵), `session.ts`(`lastUserText`·`isFirstTurn`). 의존: `hono`, `@hono/node-server`, `@anthropic-ai/claude-agent-sdk`, `assistant-stream`, `zod`.
- 치수(design-ops): 사이드바 24rem — 코퍼스에 채팅 패널 표본이 없어 저자 판단(A). 마크다운·도구 카드에 20rem은 좁고, 1440px 창에서 지도가 800px 남는다. Dialog 512px — `patterns/modal.md` Implementation defaults(79개 표본, 기본 폭 450–520 대역, shadcn 값). 패딩은 코퍼스가 24px(shadcn/ui)라 하지만 설치된 base-nova `dialog.tsx`가 `p-4`(16)라 컴포넌트 값을 덮지 않는다(shadcn 규칙: className 은 레이아웃만). 작성창 최소 높이 40px — `patterns/form.md`(78개 표본 최빈값). 메시지 간격 `--space-4`(16), 본문 `--text-sm`(14, 이 제품의 패널 값; 14 vs 16은 분기 축). 반경은 제품 토큰 `--radius-lg`.
- shadcn 규칙에서 벗어나는 점: 채팅 프리미티브(`message-scroller`·`bubble`) 대신 프레임워크 `thread-aui`를 쓴다. 사용자가 프레임워크 기반을 지시했고, `thread-aui`가 이미 assistant-ui 뷰포트로 스크롤·스트리밍을 맡는다.

## 버린 대안

- Python `claude-agent-sdk`+`assistant-stream`(FastAPI): 베이스 브랜치가 FastAPI를 제거했다.
- Rust가 `claude` CLI를 직접 구동: 프레임워크 브리지를 못 쓰고 stream-json·MCP HTTP·assistant-ui 로컬 런타임 세 프로토콜을 새로 검증해야 한다.
- 서버에 데이터 도구를 두고 Rust 개발 서버를 HTTP로 부르는 방식: 데스크톱에서는 HTTP 서버가 없다. 웹뷰 실행이면 `invoke`·`/api` 둘 다 `api.ts`가 이미 가른다.
- 도구 id를 `canUseTool`·PreToolUse 훅으로 얻기: 브리지가 이미 `tool_use.id`와 이름을 순서대로 보므로 훅이 필요 없다.
- 인스펙터를 채팅과 탭으로 공존: 사용자가 모달을 골랐다.

## 함정

- `useDataStreamRuntime`은 `tool-call-args-text-finish` 시점에 서버 결과가 없으면 클라이언트 `execute`를 돌린다(소스 확인). 서버가 나중에 같은 id로 결과를 보내면 리더가 두 번 응답을 받으므로 브리지는 중계 도구의 결과를 보내지 않는다.
- 브리지는 `content_block_stop`에서 argsText를 닫는다. 그 전에 MCP 핸들러가 호출되지 않는다(툴 실행은 assistant 메시지 완료 뒤). SDK 0.3.274는 블록이 완성될 때마다 `assistant` 메시지를 내므로 `content_block_stop`보다 먼저 올 수 있다. 델타를 받은 뒤 완성 인자를 또 붙이면 `{"n": 42}{"n":42}`가 된다(curl로 재현). 델타가 하나라도 왔으면 붙이지 않는다.
- 스트림이 끝날 때 결과 없는 tool call이 남아 있으면 accumulator가 `requires-action`으로 두고 로컬 런타임이 같은 턴을 다시 POST한다. 중계 도구는 클라이언트가 스트림 중에 결과를 채우므로 정상 경로에서는 생기지 않는다. 5단계에서 도구 턴 하나로 재요청이 없음을 확인한다.
- `createSdkMcpServer`는 zod v4 shape(`_zod` 필드)를 요구한다. `agent/`는 `zod@^4`를 쓴다.
- Base UI `Dialog`의 `onOpenChange`는 Escape·바깥 클릭에서도 온다. 셋을 한 번에 지우는 `update({selected, cluster, node: undefined})`로 처리한다. 지도 라벨 클릭은 `update`와 `move`를 함께 부르므로 Dialog가 열려도 카메라 이동은 유지된다.
- `MapView`는 `hidden` 속성으로 겹쳐 렌더링된다. `cameraRequest`는 `run`이 같을 때만 소비하고, 소비하면 `nonce`를 기록해 두 번 움직이지 않는다.
- `resume`은 세션 파일(`~/.claude/projects/…`)에 기댄다. 파일이 없어진 세션은 SDK가 오류를 내므로 스트림 오류 시 클라이언트가 "새 대화"를 안내한다.
- E2E는 실데이터·Rust 개발 서버를 전제한다. 채팅 시나리오는 서버 없이 패널·저장만 검사한다.

## 완료 기준

```sh
cd agent && npm test                       # 스키마 변환·중계 단위 테스트 통과
cd frontend
npm run test -- --run                      # navigation·labels·layout v3·agent 순수 함수 테스트 통과
npm run build                              # tsc + vite 종료 코드 0
npm run lint                               # 종료 코드 0
npm run test:e2e                           # 10개 통과 (실데이터 + Rust 개발 서버)
```

브라우저(실데이터, 1440×950, 에이전트 서버 + `claude` 로그인): 헤더 버튼으로 채팅 열림 → "2023년 이후 RAG 평가 논문 찾아서 가장 인용 많은 걸 지도에서 보여 줘" → `search_papers`·`fly_to`·`annotate` 카드와 지시선 라벨 → "그 논문 열어 줘" → `select` → Dialog → Escape → 닫힘·선택 해제 → 새로고침 → 대화·패널 유지 → "방금 논문 초록 요약해 줘"가 이전 턴을 기억 → 모델 바꾸면 빈 대화. 콘솔 오류 0. `tauri dev`에서 같은 경로 한 번.

구현·검증 완료: 2026-09-18. agent node:test 6, Vitest 20, build, lint(경고 36, 종료 코드 0), Playwright 10/10(`E2E_PORT=5174`). 브라우저(1440×950, Claude 로그인)에서 검색→fly_to→annotate, 새로고침 복원과 세션 이어가기, select→Dialog→Escape, 새 대화, set_filter, 375px Sheet 를 확인했다. `tauri dev` 는 실행까지만 확인했다(창 조작 권한 없음).
