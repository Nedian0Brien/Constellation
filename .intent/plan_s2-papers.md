---
title: OpenAlex에 없는 논문을 Semantic Scholar로 찾아 지도에 추가한다
slug: s2-papers
stage: plan
status: accepted
spec: .intent/spec_s2-papers.md
date: 2026-10-07
---

# OpenAlex에 없는 논문을 Semantic Scholar로 찾아 지도에 추가한다 — 계획

## 바뀌는 파일

새로 만드는 파일
- `backend/constellation/sources/arxiv.py`: arXiv 초록
- `backend/constellation/ingest/match.py`: DB 논문과 맞추기
- `backend/tests/test_s2.py`

고치는 파일
- `backend/constellation/config.py`: `semantic_scholar_api_key`
- `backend/constellation/sources/semanticscholar.py`: `S2Client`(키·간격·재시도), `to_work`, 기존 함수가 클라이언트를 쓰게
- `backend/constellation/ingest/identify.py`: `lookup`이 출처를 돌려주고 S2로 넘어가기, `search(source=…)`
- `backend/constellation/pipeline.py`: resolve·fetch의 S2 경로, 인용 연결
- `backend/constellation/cli.py`: `papers search --source`
- `crates/constellation-core/src/queries/works.rs`, `tests/queries.rs`: `membership`을 키 목록으로
- `crates/constellation-jobs/src/lib.rs`, `tests/{runner.rs,fake-pipeline.sh}`: `search(source)`
- `crates/constellation-serve/src/main.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/commands.rs`
- `frontend/src/api.ts`, `frontend/src/agent/{context.ts,tools.ts}`
- `.env.example`, `README.md`, `docs/ARCHITECTURE.md`

## 순서

1. **어댑터.** `S2Client`, `arxiv.abstract`, 설정 키. 기존 `fetch_abstracts`·`fetch_paper`를 옮긴다.
   - 확인: 가짜 전송(httpx `MockTransport`)으로 키 헤더, 간격, 429 재시도, `to_work` 변환을 검사한다.
2. **맞추기와 해석.** `match.py`, `identify.lookup/search`의 S2 경로.
   - 확인: 테스트 DB로 DOI·MAG(제목 불일치 거부)·제목+연도 맞추기를 검사한다. OpenAlex 실패 시 S2로 넘어가는지 가짜 소스로 본다.
3. **추가 파이프라인.** resolve의 출처 결정, fetch의 S2 저장, 참고문헌·피인용 연결, 다른 출처 중복 skipped.
   - 확인: #27의 Fixture에 S2 경로를 더한 테스트. 기존 행 불변, 인용 행, skipped.
4. **Rust.** `membership(keys)`, 실행기 `search(source)`, serve·Tauri 인자.
   - 확인: `cargo test --workspace`.
5. **프론트·에이전트.** api.ts, 에이전트 id 정규화와 프롬프트.
   - 확인: `npm --prefix frontend run build`, `npm --prefix frontend test`.
6. **실데이터 검증.** 스크래치 복사본 serve로 spec 완료 기준을 확인하고, E2E를 돌린다.
7. **문서.**

## 가장 위험한 단계

- **3의 인용 행 쓰기.** fetch 단계에서 `citations`에 쓰므로 place 전에 실패하면 인용 행이 남는다.
  - 그 행은 지도에 없는 `s2:` 논문이 끝점이라 화면에 나오지 않는다.
  - 같은 논문을 다시 추가하면 `INSERT OR IGNORE`라 중복되지 않는다.
- 되돌리기: `papers remove`로 지도에서 뺀다. 스키마 변경은 없다.

## 검증 명령

```sh
PYTHONPATH=$PWD/backend ../../.venv/bin/python -m unittest discover -s backend/tests
cargo test --workspace
npm --prefix frontend run build
npm --prefix frontend test
E2E_PORT=5183 npm --prefix frontend run test:e2e   # 워크트리 serve를 8000에 띄운 뒤
```

## 검증 결과 (2026-10-07)

- Python `unittest` 59개, `cargo test --workspace`(core 16, jobs 12, Tauri 2), vitest 56, `npm run build` 통과. Playwright E2E 13/13(워크트리 serve, 실제 DB 조회 전용).
- **S2 공용 한도**: 20:58–21:15 사이 대부분의 요청이 429였다. 확인용 요청이 200을 받은 직후에도 다음 요청은 429였다.
  - Self-RAG(arXiv 2310.11511) 추가 작업을 S2가 응답할 때 다시 실행하는 방식으로 네 번 실행했다.
  - 앞의 세 번은 resolve 단계에서 재시도 6번이 모두 429여서 `not_found`로 끝났다. 작업은 `succeeded`였고 지도는 바뀌지 않았다.
  - 네 번째에 성공했다. fetch 단계에서도 429 대기가 여러 번 있었지만 재시도로 넘어갔다.
- **스크래치 RAG/IR 지도에 Self-RAG 추가**(job-1791375060464)
  - resolve: OpenAlex에서 같은 제목의 기록을 찾지 못해 `s2:ddbd8fe782ac98e9c64dd98710687a962195dd9b`로 정했다.
  - 저장: `works.source = semanticscholar`, 초록, 저자 5명.
  - 인용 연결: 참고문헌 57편 중 20편, 피인용 2,780편 중 126편이 지도 안 논문과 이어졌다. `/api/citations`가 Llama 2, GPT-4 Technical Report(참고문헌), Adaptive-RAG(피인용) 등을 돌려준다.
  - 배정: "Question Answering"(최근접 유사도 0.95), `warnings` 없음.
  - 기존 10,604편의 모든 열이 같았다. 빼면 `/api/map` JSON이 추가 전과 완전히 같아졌다.
- **지도에 있는 id를 다시 넣었을 때**: 이미 지도에 있는 `s2:` id를 다시 넣자 resolve가 S2에 먼저 물었다. 429를 받아 `skipped`가 아니라 `not_found`가 됐다.
  - 고침: 지도에 이미 있는 id는 외부 조회 없이 건너뛴다.
  - 실측: `openalex:W2163605009`가 0.3초 만에 `skipped`.
- 그 밖의 실측
  - arXiv 초록 조회
  - DOI 조회(`10.1145/3065386` → `source: openalex`, `in_map: true`)
- **확인하지 못한 것**
  - 다른 출처 id로 들어온 같은 논문(DOI·제목+연도 일치)의 건너뛰기는 가짜 응답 테스트로만 확인했다.
  - `source=s2` 검색어 검색은 S2 429로 실측하지 못했다.
