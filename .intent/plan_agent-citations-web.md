---
title: 에이전트에 인용 추적·논문 비교·웹 접근 더하기
slug: agent-citations-web
stage: plan
status: accepted
intent: .intent/intent_agent-citations-web.md
spec: .intent/spec_agent-citations-web.md
date: 2026-09-18
---

# 에이전트에 인용 추적·논문 비교·웹 접근 더하기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `crates/constellation-core/src/queries/works.rs`, `mod.rs`, `tests/queries.rs` | `citations()`·`Citations`·`CitedWork`, 테스트 |
| `crates/constellation-serve/src/main.rs` | `GET /api/citations` |
| `src-tauri/src/commands.rs`, `lib.rs` | `citations` 명령 등록 |
| `frontend/src/api.ts` | `Citations` 타입, `fetchCitations` |
| `frontend/src/agent/tools.ts`, `agent.test.ts` | 도구 3개(`get_citations`·`get_lineage`·`compare_papers`), `ToolDeps.api` 확장, 테스트 |
| `frontend/src/agent/context.ts` | 인용·비교·웹 규칙 |
| `frontend/src/components/assistant-ui/elements/tool-fallback.aui.tsx` | 웹 도구 한국어 제목 |
| `agent/src/server.ts` | `tools`·`allowedTools`에 `WebSearch`·`WebFetch` |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCT-FOUNDATION-QA.md` | 도구 목록·웹 접근 설명·검증 기록 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. **Rust 질의·라우트·명령** — `citations()` + 테스트, serve 라우트, Tauri 명령. `cargo test -p constellation-core`, `cargo build -p constellation-serve`, `cargo check` (src-tauri). 개발 서버를 다시 띄워 `curl /api/citations`로 확인. 커밋 `feat: 논문 참고문헌·피인용 질의`.
2. **도구 3개** — `api.ts`, `tools.ts`, 테스트, 프롬프트 규칙. `npm run test -- --run`, `build`, `lint`. 커밋 `feat: 에이전트 인용 추적·논문 비교 도구`.
3. **웹 도구** — `server.ts` 옵션, `tool-fallback` 제목, 프롬프트의 OpenAlex·DOI 안내. curl 로 `WebFetch` 한 턴 확인. 커밋 `feat: 에이전트에 WebSearch·WebFetch 허용`.
4. **브라우저 확인·문서** — 스펙의 세 경로. README·ARCHITECTURE·QA. 커밋 `docs: …`.

`git add`는 파일을 지정한다.

## 가장 위험한 단계

3단계다. `WebSearch`가 이 기계의 `claude` 로그인 종류에서 되는지는 실행해 봐야 안다. 안 되면 `WebFetch`만 열고 프롬프트에서 검색은 OpenAlex `search` 엔드포인트(`https://api.openalex.org/works?search=…`)로 대신하게 한다. 되돌리기: `server.ts`의 두 줄만 지우면 1·2단계는 그대로 남는다.

둘째는 1단계의 Rust 개발 서버 재시작이다. 8000번은 다른 세션이 공유하는 읽기 전용 서버라 이 세션은 다른 포트(8001)로 띄우고 Vite 프록시 대상을 환경 변수로 잠시 바꾼다. 커밋에는 포트를 넣지 않는다.

## 검증

```sh
cargo test -p constellation-core
cd agent && npm test
cd frontend && npm run test -- --run && npm run build && npm run lint && npm run test:e2e
```
