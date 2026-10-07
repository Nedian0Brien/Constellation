---
title: OpenAlex에 없는 논문을 Semantic Scholar로 찾아 지도에 추가한다
slug: s2-papers
stage: spec
status: accepted
intent: .intent/intent_s2-papers.md
date: 2026-10-07
---

# OpenAlex에 없는 논문을 Semantic Scholar로 찾아 지도에 추가한다 — 명세

## 요구사항

1. **id와 출처.** S2에서만 찾은 논문의 id는 `s2:<paperId>`(40자리 16진수), `works.source`는 `semanticscholar`다. 검색 결과 항목에 `source`(`openalex`|`s2`)를 더한다.
2. **검색 출처.** `search(q, page, run?, source?)`에 `source`를 더한다. 기본값은 `openalex`이고 `s2`를 고를 수 있다.
   - `source=s2`의 검색어는 S2 `/paper/search`로 찾는다. 한 페이지에 25편이고, S2가 관련도 순으로 1,000건까지만 주므로 `page`는 1–40이다.
   - 식별자(DOI·arXiv ID)는 `source=s2`면 S2 단건 조회를 쓴다.
   - `source=openalex`인데 OpenAlex에서 찾지 못하면 S2 단건 조회로 넘어간다. OpenAlex ID는 S2로 넘어가지 않는다.
   - S2 결과도 OpenAlex 결과와 같은 모양이다: `{id, title, year, authors, venue, cited_by_count, doi(https://doi.org/… 형식), has_abstract, source}`.
3. **지도 소속 판정(`in_map`·`added`).** 같은 논문이 다른 출처의 id로 이미 지도에 있을 수 있다. 다음 중 하나가 맞으면 지도에 있는 것으로 본다.
   - id가 같다.
   - DOI가 같다(대소문자 무시, `https://doi.org/` 제거).
   - 정규화 제목(소문자, 영숫자만)이 같고 연도 차이가 1 이하다.
4. **추가할 때 출처 결정.** `add_papers`는 입력마다 다음 순서로 정한다.
   1. `openalex:` id나 OpenAlex에서 찾은 식별자는 #27과 같다.
   2. `s2:` id와 OpenAlex에서 찾지 못한 DOI·arXiv ID는 S2 기록을 받는다. 그 S2 기록이 OpenAlex에도 있으면 OpenAlex 기록으로 바꾼다.
      - OpenAlex에 있다는 판정: S2 외부 ID의 DOI, 또는 MAG(`W{MAG}`) 기록의 제목이 같을 때. 제목 검색은 #27의 arXiv 해석과 같은 방식이다.
   3. 3의 판정으로 이미 지도에 있는 논문이면 `skipped`(`이미 지도에 있다 (<지도 안 id>)`)로 둔다.
5. **S2 논문 저장.**
   - 제목·초록·연도·발표처·저자·피인용 수·DOI·유형을 `works`에 쓴다.
   - 초록이 없고 arXiv ID가 있으면 arXiv API에서 받는다.
6. **참고문헌 연결.** S2 `/paper/{id}/references`의 각 항목을 DB의 논문과 맞춘다. 순서는 DOI → MAG(`openalex:W{MAG}`가 있고 정규화 제목이 같을 때) → 정규화 제목+연도다. 맞으면 그 id로, 아니면 `s2:<paperId>`로 `citations(citing, cited)`에 넣는다.
7. **피인용 연결.** S2 `/paper/{id}/citations`를 500건씩 최대 20쪽(1만 건)까지 받는다. 그 가운데 6의 방식으로 지도 안 논문과 맞는 것만 `citations(지도 안 논문, s2 논문)`으로 넣는다. 20쪽에서 멈췄으면 로그에 남긴다.
8. 6·7의 `citations` 행과 `works` 행은 fetch 단계에서 쓴다. 지도에 보이는 변화(소속·좌표·클러스터)는 #27과 같이 place 단계의 한 트랜잭션이다. 인용 행은 지도 밖 논문의 인용처럼 지도에 나오지 않는 공유 자료다.
9. **키.** `Settings.semantic_scholar_api_key`(`SEMANTIC_SCHOLAR_API_KEY`)가 있으면 모든 S2 요청에 `x-api-key` 헤더를 붙이고, 요청 간격을 1.05초 이상으로 둔다. 기존 `fetch_abstracts`·`fetch_paper`도 같다. 키가 없으면 지금처럼 429에 지수 대기로 다시 묻는다.
10. **arXiv API.** 요청 간격 3초 이상, 연결 하나(arXiv 이용 약관).
11. **두 실행 환경과 화면 API.**
    - serve `GET /api/papers/search?…&source=`, Tauri `search_papers(…, source)`
    - api.ts `searchPapers(q, page, run, source)`, `ExternalPaper.source`
12. **에이전트.** 도구의 id 정규화(`W123` → `openalex:W123`)는 `s2:` id를 그대로 둔다. 시스템 프롬프트에 `s2:<id>`는 `https://api.semanticscholar.org/graph/v1/paper/<id>`로 열 수 있다고 적는다.

## 설계

- **S2 어댑터.** `sources/semanticscholar.py`에 `S2Client`를 둔다. 공용 httpx 클라이언트, 키 헤더, 요청 간격, 429 재시도를 한 곳에 모은다.
  - 메서드: `paper(id, fields)`, `search(q, offset, limit, fields)`, `references(id)`, `citations(id, max_pages)`, `to_work(record)`
  - 기존 `fetch_abstracts`·`fetch_paper`도 이 클라이언트를 쓰게 바꾼다.
- **arXiv 어댑터.** `sources/arxiv.py`의 `abstract(arxiv_id)`. Atom XML을 표준 라이브러리 `xml.etree`로 읽는다.
- **맞추기.** `ingest/match.py`
  - `norm_doi`, `norm_title`(기존 `sources/base.py`)
  - `match_works(conn, candidates)`: 후보 `{doi, mag, title, year}` 목록을 DB `works`와 한 번의 질의로 맞춘다. 정규화 제목은 Python에서 만들어 Arrow 테이블로 등록한 뒤 조인한다.
- **해석 확장.** `identify.lookup`은 `(kind, row, source)`를 돌려준다. S2 경로의 `row`는 S2 기록이다. `add_papers`의 resolve가 입력마다 `{"source": "openalex", "id": …}` 또는 `{"source": "s2", "record": …}`를 만든다. fetch는 둘을 나눠 받는다.
- **소속 판정은 Rust에서.** `queries::membership(db, run, keys)`가 `[{id, doi, title, year}]`를 받는다. Python이 정규화한 `norm_title`을 넘기고, Rust는 `regexp_replace(lower(w.title), '[^a-z0-9]', '', 'g')`로 비교한다. 이 정규식은 Python `norm_title`(`[^a-z0-9]+` 제거)과 같은 결과를 낸다.
- **재사용.** place, embed, enrich, 실행기, 작업 종류, 정리 규칙은 그대로다.

## 버린 대안

- **검색 결과를 두 출처에서 섞어 보여 주기.** 순위 기준이 서로 달라 한 목록으로 섞을 수 없고, 매번 S2 호출이 늘어난다. 출처를 고르게 하고, OpenAlex 식별자 조회가 실패할 때만 S2로 넘어간다.
- **S2 결과를 모두 OpenAlex로 다시 확인해 `in_map` 판정.** 결과 25편마다 OpenAlex 호출이 생긴다. DOI·제목 비교를 DB 쪽에서 한다.
- **MAG id를 그대로 OpenAlex id로 믿기.** #27 실측에서 W3027879771처럼 제목이 다른 논문으로 덮인 기록이 있었다. 제목 일치를 함께 본다.

## 함정

- S2 `externalIds.DOI`는 대소문자가 섞여 있고 접두사가 없다. OpenAlex `doi`는 `https://doi.org/…` 형식이다.
- S2 초록은 출판사 라이선스로 비어 있을 수 있다(응답의 `openAccessPdf.disclaimer`). arXiv에서 보충할 수 있는 것은 arXiv 논문뿐이다.
- S2 `year`는 arXiv 게시 연도이고, OpenAlex는 학회 연도로 기록한 경우가 있다(Self-RAG: S2 2023, ICLR 2024). 제목 비교에서 연도 차이 1을 허용하는 이유다.
- 키 없는 공용 한도에서 피인용 20쪽은 429 대기로 수 분이 걸릴 수 있다. 진행률(쪽 단위)을 이벤트로 낸다.
- `s2:` 참고문헌 id는 `works`에 행이 없다. 지금도 `citations.cited_id`에는 지도 밖 id가 들어 있으므로 질의는 그대로 동작한다.

## 완료 기준

- `unittest`
  - S2·arXiv 응답을 Work로 바꾸기
  - DOI·MAG·제목 맞추기(MAG 제목 불일치 거부)
  - 출처 결정 순서(S2 기록이 OpenAlex에 있으면 OpenAlex로)
  - 다른 출처로 이미 지도에 있으면 skipped
  - 참고문헌·피인용 행
  - 키 헤더와 요청 간격
- `cargo test --workspace`: DOI·정규화 제목·연도로 소속 판정, 검색 출처 인자.
- 스크래치 데이터의 RAG/IR 지도에서 다음을 확인한다.
  - `search(q="2310.11511")`이 `s2:` 결과 하나와 `source: s2`를 돌려준다.
  - Self-RAG를 추가하면 `works.source = semanticscholar`, 초록이 채워지고, 지도 안 논문과 참고문헌·피인용 선이 이어진다. 기존 점은 바뀌지 않는다.
  - 같은 논문을 OpenAlex 쪽 식별자로 다시 추가하려 하면 skipped다.
  - 빼면 원래대로 돌아간다.
- 기존 E2E가 통과한다.
