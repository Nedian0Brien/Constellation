---
title: 에이전트에 인용 추적·논문 비교·웹 접근 더하기
slug: agent-citations-web
stage: spec
status: accepted
intent: .intent/intent_agent-citations-web.md
date: 2026-09-18
---

# 에이전트에 인용 추적·논문 비교·웹 접근 더하기 — 명세

## 요구사항

- [ ] Rust 질의 `citations(db, run, work_id, direction, limit) -> Citations { id, references: Vec<CitedWork>, cited_by: Vec<CitedWork>, ref_total, cited_by_total }`. `CitedWork { id, title, year, cited, cluster: Option<i32> }`. `direction`은 `references`·`cited_by`·`both`(기본). 코퍼스(`works`)에 있는 논문만 세고, `cluster`는 그 run 의 `clusters` 테이블 값(run 밖이면 None). 정렬은 `cited_by_count DESC NULLS LAST, id`. `limit`은 1–500, 기본 20. 총계(`*_total`)는 limit 과 무관하게 전체 수. 없는 논문은 404.
- [ ] HTTP `GET /api/citations?run=&id=&direction=&limit=`(기존 `/api/works/{*work_id}` 와일드카드와 충돌을 피해 쿼리 파라미터), Tauri 명령 `citations(run, id, direction?, limit?)`. `api.ts`의 `fetchCitations(run, id, direction, limit)`가 둘을 가른다. 테스트: `crates/constellation-core/tests/queries.rs`에 픽스처(`3→1`, `2→1`, `1→x-outside`)로 `references`·`cited_by`·총계·limit 검사.
- [ ] 도구 `get_citations{id, direction?: references|cited_by|both, limit?}` — `fetchCitations` 결과에 주제 라벨(`cluster_label`)을 붙여 돌려준다. 여러 홉은 결과 id 로 다시 부른다.
- [ ] 도구 `get_lineage{paper_id?, depth?: 1–4}` — `fetchLineage(run, seed, depth)`. 반환: `main_path`(연도순 `{id,title,year,cited}`), `seed`가 있으면 `neighbors`(씨앗과 직접 이어진 논문 `{id,title,year,cited,relation: cites|cited_by, spc}` — 엣지 `from`=피인용, `to`=인용이므로 `to===seed`면 `cites`, `from===seed`면 `cited_by`), `node_count`·`edge_count`. 씨앗이 코퍼스에 없으면 오류.
- [ ] 도구 `compare_papers{ids: string[2..6]}` — 논문마다 `fetchWork`(제목·연도·학술지·피인용·저자 3명·주제 3개·초록 앞 400자·코퍼스 안 참고문헌/피인용 수)와 지도 좌표·주제 라벨을 모으고, `fetchCitations(direction: references, limit: 500)`로 집합 안의 인용 쌍(`cites: [[a,b], …]`, a 가 b 를 인용)을 만든다. 쌍마다 지도 거리(투영 좌표 유클리드, 소수 2자리)와 `same_topic`을 준다. 지도 전체 대각선 길이 `map_span`을 함께 준다. 없는 id 는 `missing`에 적고 나머지로 진행한다. 2편 미만이면 오류.
- [ ] 서버: `tools: ["WebSearch", "WebFetch"]`, `allowedTools`에 두 이름을 더한다. 파일·셸 도구는 계속 없다. 브리지는 비중계 도구이므로 결과를 `setResponse`로 돌려준다(기존 경로). 화면에서 두 도구는 `tool-fallback` 카드로 보이며 제목은 "웹 검색"·"웹 페이지 읽기"다.
- [ ] 시스템 프롬프트 규칙 추가: 인용 관계는 `get_citations`·`get_lineage`, 비교는 `compare_papers`; 코퍼스 밖 정보는 `WebSearch`·`WebFetch`이며 코퍼스 id `openalex:W…`는 `https://api.openalex.org/works/W…`(참고문헌 `referenced_works`, 피인용 `cited_by_api_url`), DOI 는 `https://doi.org/…`. 웹에서 얻은 사실은 출처 URL 을 답에 적고 코퍼스 결과와 구분한다.
- [ ] 단위 테스트(`agent.test.ts`): `get_citations` 라벨 결합, `get_lineage` 관계 판정, `compare_papers` 인용 쌍·거리·missing. Rust 테스트는 `cargo test -p constellation-core`.
- [ ] 브라우저 확인: "이 논문을 인용한 논문 중 가장 많이 인용된 세 편을 지도에 표시해 줘", "A와 B를 비교해 줘", "이 논문의 코퍼스 밖 후속 연구를 찾아 줘"(WebFetch OpenAlex) 세 경로. 결과를 QA 문서에 적는다.

## 설계

- Rust: `queries/works.rs`에 `Citations`·`CitedWork`·`citations()` 추가. SQL 은 `citations c JOIN works w ON w.id = c.<other> LEFT JOIN clusters k ON k.run_id = ? AND k.work_id = w.id`. 총계는 `count(*)` 두 번. `mod.rs` re-export, serve 라우트, Tauri 명령·`generate_handler` 등록.
- 프론트 `tools.ts`: 정의 3개와 실행기 3개. `ToolDeps.api`에 `fetchCitations`·`fetchLineage` 추가. 주제 라벨은 `clusters()`에서 찾는다. `compare_papers`의 좌표는 `map()`에서 `paperPosition`.
- `tool-fallback.aui.tsx`: 이름 → 한국어 제목 맵(`WebSearch`·`WebFetch`)만 더한다. `NOTE(constellation)` 유지.
- `context.ts`: 규칙 문단에 세 줄 추가.

## 버린 대안

- 인용 목록을 `/api/works/{id}/citations`로: axum 의 `{*work_id}` 와일드카드와 겹친다. 쿼리 파라미터로 둔다.
- 집합 안 인용을 Rust 질의 하나로: 도구 하나 때문에 엔드포인트를 더 늘리지 않는다. 참고문헌 방향은 한 논문당 수십 개라 500 한도로 충분하다.
- 웹 도구를 웹뷰에서 fetch 로 실행: CORS 와 검색 API 키 문제. SDK 내장 도구가 `claude` 프로세스 안에서 돈다.

## 함정

- `WebSearch` 결과의 `tool_result.content`는 블록 배열일 수 있다. 브리지 `toolResultText`가 이미 문자열로 편다.
- `permissionMode: "default"`에서 `WebFetch`는 `allowedTools`에 없으면 승인 대기로 멈춘다. 반드시 넣는다.
- `fetchLineage`는 `run` 의 `citation_spc`가 없으면 404. 도구는 `error`로 돌려준다.
- 피인용이 수백인 논문(ResNet 등)은 `cited_by` 기본 20개만 보여 주고 `cited_by_total`로 규모를 알린다.

## 완료 기준

```sh
cargo test -p constellation-core
cd agent && npm test
cd frontend && npm run test -- --run && npm run build && npm run lint && npm run test:e2e
```
