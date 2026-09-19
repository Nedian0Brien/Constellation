---
title: 에이전트 서버를 앱이 띄운다 — dev 자동 기동과 .app 사이드카
slug: agent-sidecar
stage: intent
status: accepted
author: minjaepark
date: 2026-09-19
---

# 에이전트 서버를 앱이 띄운다 — dev 자동 기동과 .app 사이드카

## 문제

에이전트 채팅은 `127.0.0.1:8787`의 Node 서버가 따로 떠 있어야 동작한다. 설치된 `Constellation.app`도 `tauri dev`도 이 서버를 띄우지 않아서, 터미널에서 `npm --prefix agent start`를 잊으면 첫 메시지가 "Load failed"로 끝난다(2026-09-19 실제로 그 상태였다). 완성 제품이라면 앱을 열면 채팅이 되어야 한다.

## 원하는 결과

- 설치된 `.app`을 열면 에이전트 서버가 같이 뜨고, 앱을 닫으면 같이 꺼진다. 서버는 `agent/`를 하나의 실행 파일로 빌드한 Tauri 사이드카(`bundle.externalBin`)다. 포트는 앱이 정해 웹뷰에 알려 준다(고정 8787에 기대지 않는다).
- `tauri dev`도 서버를 같이 띄운다. 이때는 저장소의 `agent/src/server.ts`를 그대로 돈다.
- 사이드카는 `claude`·`codex` CLI를 이 기계의 설치본(`~/.local/bin`, `/opt/homebrew/bin`, PATH)에서 찾아 쓴다. Finder에서 연 앱은 PATH가 최소라 직접 찾아야 한다. Claude Agent SDK에는 `pathToClaudeCodeExecutable`로 넘긴다. 두 CLI의 214–218MB 바이너리를 `.app`에 넣지 않는다 — 로그인 정보가 CLI 쪽(`~/.claude`, `~/.codex`)에 있으므로 어차피 설치본이 필요하다.
- CLI가 없거나 로그인이 안 돼 있으면 채팅 화면에 어떤 것이 없는지와 설치·로그인 방법이 보인다. 서버 자체가 뜨지 못한 경우도 같은 자리에 보인다.
- 브라우저 개발(Vite)은 지금처럼 프록시 + `npm --prefix agent start`로 남는다.

## 영향 범위

`agent/`(빌드 스크립트, CLI 경로 탐색, 포트 인자), `src-tauri/`(`tauri.conf.json` externalBin, `Cargo.toml`·capabilities에 shell 플러그인, `lib.rs` 사이드카 기동·종료, 포트 전달 명령), `frontend/src/agent/AgentProvider.tsx`(서버 주소를 `invoke`로 받음), `scripts/`·CI, README·ARCHITECTURE.

## 제약

- `feat/agent-providers`가 병합된 뒤 브랜치 `feat/agent-sidecar`, 워크트리 `.worktree/agent-sidecar`.
- 사이드카 빌드 도구는 `bun build --compile`(이 기계 bun 1.3.14). Node SEA는 ESM·native 의존성 처리가 번거로워 쓰지 않는다. SDK가 optional 의존성으로 받는 native `claude` 바이너리는 번들에 넣지 않는다.
- macOS arm64만 빌드·검증한다. 다른 타깃은 설정만 열어 둔다.
- 서버는 계속 `127.0.0.1`에만 바인딩한다.

## 범위 밖

- 앱 안에서 `claude login`·`codex login`을 대신 해 주는 것.
- CLI 자동 설치·자동 업데이트.
- Windows·Linux 빌드 검증.

## 열린 질문

- 해결(2026-09-19, 사용자): dev 자동 기동만이 아니라 `.app` 사이드카까지 한다.
