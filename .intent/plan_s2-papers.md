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
