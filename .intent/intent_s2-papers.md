---
title: OpenAlex에 없는 논문을 Semantic Scholar로 찾아 지도에 추가한다
slug: s2-papers
stage: intent
status: accepted
author: minjaepark
date: 2026-10-07
---

# OpenAlex에 없는 논문을 Semantic Scholar로 찾아 지도에 추가한다

#27(외부 논문 검색과 지도에 추가)의 후속이다. 사이드바 화면 작업 전에 백엔드를 갖춘다.

## 문제

- 외부 검색과 지도에 추가는 OpenAlex만 쓴다. OpenAlex에 기록이 없는 논문은 찾을 수도, 넣을 수도 없다.
  - 예: Self-RAG(arXiv 2310.11511, ICLR 2024). OpenAlex에는 없다.
  - Semantic Scholar(S2)에는 있다. 피인용 2,773, 참고문헌 57, 초록이 있다.
  - arXiv API에도 있다. 제목·초록·게시일이 있다(2026-10-07 확인).
- 이런 논문은 학회 발표 전 arXiv에만 있는 최신 논문에 많다. 연구자가 지도에서 가장 확인하고 싶어 하는 논문이기도 하다.
- S2 공용 한도에서는 429가 자주 난다(#27 검증에서 여러 번 확인). 키를 쓰는 경로가 없다.

## 원하는 결과

- **검색 출처 선택.** 외부 검색에서 출처를 OpenAlex(기본)와 Semantic Scholar 중에 고를 수 있다. 결과마다 출처를 표시한다.
- **식별자 조회.** DOI·arXiv ID가 OpenAlex에 없으면 S2에서 찾는다. 결과는 `s2:<paperId>` id로 돌려준다.
- **S2 논문 추가.** S2에서 찾은 논문을 지금 지도에 추가할 수 있다. 좌표·주제 배정·추가 논문 표시·빼기는 #27과 같다.
  - 초록은 S2에서, 없으면 arXiv API에서 받는다.
  - **참고문헌 연결**: S2 참고문헌을 지도 안 논문과 맞춰 인용선을 잇는다.
  - **피인용 연결**: S2 피인용 목록으로 지도 안 논문 가운데 이 논문을 인용한 것을 찾아 잇는다. 지도 안 논문의 OpenAlex 참고문헌에는 이 논문이 없기 때문이다.
- **중복 방지.** 이미 지도에 있는 논문과 같은 논문을 다른 출처로 다시 넣지 않는다. 같은 논문인지는 DOI·arXiv ID·정규화 제목+연도로 판정한다.
  - S2 결과 가운데 OpenAlex에도 있는 논문(제목이 같은 기록)은 OpenAlex 기록으로 추가한다.
  - 검색 결과의 `in_map`도 이 판정을 따른다.
- **키 설정.** `.env`의 `SEMANTIC_SCHOLAR_API_KEY`가 있으면 S2 요청에 쓴다. 없어도 공용 한도로 동작하고, 429는 기존처럼 재시도한다.

## 영향 범위

- `backend/constellation/`: S2·arXiv 어댑터, 식별자 해석, 추가 단계(수집·초록·인용 연결)
- `crates/constellation-jobs`, `crates/constellation-serve`, `src-tauri`, `frontend/src/api.ts`: 검색 출처 인자
- 에이전트 도구: 논문 id 표기(`W123` → `openalex:W123`)가 `s2:` id를 망가뜨리지 않게
- `README.md`, `docs/ARCHITECTURE.md`, `.env.example`
- 결정: minjaepark

## 제약

- #27의 약속을 지킨다. 기존 논문의 좌표·클러스터·이름은 바뀌지 않는다. 추가는 마지막 단계의 한 트랜잭션이다.
- S2 키는 무료이고 기본 한도는 초당 1회다(2026-10-07 [S2 API](https://www.semanticscholar.org/product/api)). 키 없는 공용 한도는 모든 사용자가 공유한다.
- arXiv API는 arXiv 논문의 메타데이터와 초록만 주고 인용은 주지 않는다.

## 범위 밖

- 새 지도 수집(build)을 S2로 하기. bulk search가 참고문헌·피인용을 주지 않아, 1만 편이면 논문마다 따로 호출해야 한다(키 기본 한도로 약 3시간).
- 나중에 OpenAlex에 생긴 같은 논문으로 S2 기록을 바꾸기
- Crossref·OpenReview 등 다른 출처
- 화면(사이드바 intent)

## 열린 질문

없음.
