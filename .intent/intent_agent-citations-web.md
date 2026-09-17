---
title: 에이전트에 인용 추적·논문 비교·웹 접근 더하기
slug: agent-citations-web
stage: intent
status: accepted
author: minjaepark
date: 2026-09-18
---

# 에이전트에 인용 추적·논문 비교·웹 접근 더하기

## 문제

에이전트(PR #5)는 논문 검색·상세·주제와 지도 조작은 하지만 세 가지를 못 한다.

- **인용 관계 추적**: 논문 상세는 코퍼스 안 참고문헌 수와 피인용 수만 준다. "이 논문이 인용한 논문들", "이 논문을 인용한 논문들", "이 분야의 메인패스"를 물으면 답할 도구가 없다. DB에는 `citations`(전체 인용 쌍)와 `citation_spc`(run별 SPC 가중치·메인패스)가 있는데 HTTP·Tauri 는 계보 그래프(`/lineage`)만 노출한다.
- **여러 논문 비교**: "A와 B가 어떻게 다른지"를 물으면 `get_paper`를 여러 번 부르고 모델이 머릿속에서 맞춰야 한다. 서로 인용하는지, 같은 주제인지, 지도에서 얼마나 떨어져 있는지는 알 길이 없다.
- **웹 접근**: 코퍼스 밖 정보(최신 후속 연구, 저자, 코퍼스 밖 피인용)는 아예 못 본다. 코퍼스 id 가 `openalex:W…`이고 DOI 도 있어 OpenAlex·출판사 페이지를 바로 열 수 있는데 도구가 잠겨 있다.

## 원하는 결과

- **인용 추적 도구**: 논문 하나의 코퍼스 안 참고문헌·피인용 목록(제목·연도·피인용·주제)을 방향과 개수를 지정해 받는다. 여러 홉을 따라가려면 결과의 id 로 다시 부른다. run 의 메인패스와 선택 논문 주변 계보(`/lineage`)도 받는다. 결과는 지도에 `annotate`로 표시할 수 있다.
- **논문 비교 도구**: id 여러 개(2–6)를 주면 각 논문의 요약 메타데이터, 속한 주제, 서로 간 인용 여부, 지도 상 거리를 한 표로 받는다. 모델은 이 표와 초록으로 비교 서술을 쓴다.
- **웹 접근**: Agent SDK 내장 `WebSearch`·`WebFetch`를 켠다. 시스템 프롬프트에 OpenAlex API(`https://api.openalex.org/works/W…`)와 DOI 링크를 알려 코퍼스 밖 인용·후속 연구를 찾게 한다. 채팅에는 웹 도구 호출도 카드로 보인다.
- 새 Rust 질의는 HTTP(`constellation-serve`)와 Tauri 명령 양쪽에 붙어 브라우저·데스크톱에서 같은 코드가 돈다.

## 영향 범위

`crates/constellation-core/src/queries/works.rs`(참고문헌·피인용 질의)·`tests/queries.rs`, `crates/constellation-serve/src/main.rs`(라우트), `src-tauri/src/commands.rs`·`lib.rs`(명령), `frontend/src/api.ts`, `frontend/src/agent/{tools,context,AgentProvider}.ts(x)`·`agent.test.ts`, `agent/src/server.ts`(내장 도구 허용), README·ARCHITECTURE.

## 제약

- 브랜치 `feat/agent-citations-web`은 `feat/agent-chat`(PR #5, 미병합)에서 분기한다. PR 은 `feat/agent-chat`을 base 로 연다.
- 서버 격리는 유지한다. 내장 도구는 `WebSearch`·`WebFetch` 두 개만 열고 파일·셸 도구는 계속 닫는다.
- DB 스키마와 분석 알고리즘은 바꾸지 않는다. 새 질의는 읽기 전용이다.
- 도구는 웹뷰에서 실행하는 기존 중계 구조를 따른다. 웹 도구만 `claude` 프로세스 안에서 돈다.

## 범위 밖

- 임베딩 유사도 검색(가장 비슷한 논문 찾기). 임베딩 벡터를 노출하는 질의가 없고 별도 설계가 필요하다.
- 계보 화면을 Dialog 없이 특정 논문으로 여는 것. 현재 계보 화면의 씨앗은 `selected`라 `select` 를 부르면 상세 창이 함께 열린다. 그대로 두고 후속으로 다룬다.
- 웹 도구 결과 전용 카드 UI. 기존 도구 카드(`tool-fallback`)로 보인다.
- 코퍼스 밖 논문을 지도에 놓는 것.

## 열린 질문

- 없음. 인용 목록의 기본 개수(20)와 비교 논문 최대 수(6)는 spec 에서 정한다.
