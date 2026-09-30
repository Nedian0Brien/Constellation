# 연구자 워크플로와 정보 구조 조사

조사일 2026-09-30 · 공식 문서와 학술 문헌을 직접 확인했다. 이 문서는 [연구 도구 기획](../RESEARCH-TOOL-PLAN.md)의 근거 자료다.

## 1. 문헌 조사 단계

**모델**
- Ellis(1989): 시작, 연쇄(인용을 앞뒤로 따라감), 훑어보기, 구별, 모니터링, 추출. 정보검색 시스템 설계 근거로 제시. [Emerald](https://www.emerald.com/insight/content/doi/10.1108/eb026843/full/html)
- Kuhlthau ISP: 시작, 주제 선택, 탐색, 초점 형성, 수집, 발표. 불확실성은 탐색 단계에서 가장 높다. [Rutgers](https://wp.comminfo.rutgers.edu/ckuhlthau/information-search-process/)
- Bates(1989) berrypicking: 새 문헌을 볼 때마다 질의가 바뀐다. [IxD@Pratt](https://ixd.prattsi.org/2018/11/berrypicking-a-discussion-based-on-batess-the-design-of-browsing-1989/)
- Shneiderman(1996): overview, zoom, filter, details-on-demand, relate, history, extract. [IEEE](https://ieeexplore.ieee.org/document/545307/) Constellation에는 history(작업 이력)와 extract(내보내기)가 없다.
- Unsworth(2000) scholarly primitives: 발견, 주석, 비교, 참조, 표본 추출, 예시, 표현. [ResearchGate](https://www.researchgate.net/publication/205836758_Scholarly_Primitives_What_Methods_Do_Humanities_Researchers_Have_in_Common_and_How_Might_Our_Tools_Reflect_This)

**방법론**
- PRISMA 2020: 식별, 선별, 포함. 출처별 건수와 제외 사유·건수 기록. [PRISMA](https://www.prisma-statement.org/prisma-2020-flow-diagram)
- PRISMA-S: DB·플랫폼, 전체 검색식, 제한 조건, 검색 날짜, 결과 관리 방식 보고. [Systematic Reviews](https://link.springer.com/article/10.1186/s13643-020-01542-z)
- Rayyan: Include/Exclude/Maybe, 제외 사유와 라벨 구분, 블라인드 모드와 충돌 해소. [Rayyan](https://help.rayyan.ai/hc/en-us/articles/35305653554705-Understanding-Blinding-Labels-Reasons-and-Ratings-in-Collaborative-Reviews)
- 스코핑 리뷰(Arksey & O'Malley): 질문 정의 → 관련 연구 식별 → 선택 → 데이터 차팅 → 요약·보고. [CASRAI](https://casrai.org/guides/arksey-omalley-scoping-review-framework-levac-refinements)

**과업별 요구**

| 과업 | 모델 단계 | 도구가 할 일 |
|---|---|---|
| 새 분야 진입 | 시작·훑어보기, 탐색 | 전체 지도, 클러스터 라벨, 대표 논문, 갈래 흐름 |
| 관련 연구 절 작성 | 연쇄·추출, 수집·발표 | 인용 계보, 컬렉션, BibTeX 내보내기 |
| 연구 공백 찾기 | 구별 | 클러스터 사이 빈 영역과 인용 단절 표시([Litmaps](https://docs.litmaps.com/en/articles/9092883-find-research-gaps-with-litmaps)) |
| 최신 동향 추적 | 모니터링 | 컬렉션·지도 단위 알림([Litmaps Monitor](https://docs.litmaps.com/en/articles/9126249-monitor-get-alerts-for-important-research), [S2 Feed](https://www.semanticscholar.org/faq/create-research-feeds)) |
| 체계적 리뷰 | PRISMA | 선별 상태, 제외 사유, 단계별 건수 |

## 2. 사이드바·내비게이션 사례

| 도구 | 구조 | 맞는 규모·과업 |
|---|---|---|
| Zotero | 컬렉션·하위 컬렉션, 저장 검색, 그룹 라이브러리, 중복·미분류·휴지통, 태그 선택기(AND), 다중 소속. [Zotero](https://www.zotero.org/support/collections_and_tags) | 수천 편 개인 서지 |
| Obsidian | 리본(아이콘 열), 좌우 사이드바 탭 그룹, 볼트 전환은 왼쪽 아래. [Sidebar](https://obsidian.md/help/User+interface/Sidebar), [Vaults](https://obsidian.md/help/manage-vaults). Bases는 필터 저장 보기를 표·카드·지도로. [Bases](https://obsidian.md/help/bases/views) | 개인 지식 베이스 |
| Notion | 작업공간 전환기, 검색·홈·받은편지함, 즐겨찾기·팀스페이스·공유·개인 페이지 트리. [Notion](https://www.notion.com/help/navigate-with-the-sidebar) | 협업, 깊은 계층 |
| Figma | Pages 목록 + Layers 패널, Assets 탭, 페이지마다 캔버스. [Figma](https://help.figma.com/hc/en-us/articles/360039831974-View-layers-and-pages-in-the-left-sidebar) | 캔버스 여러 개 + 캔버스 안 층위 |
| Linear | 작업공간 드롭다운, Inbox, My issues, 즐겨찾기, 팀, 뷰. 뷰는 데이터를 바꾸지 않는 보기. [개념 모델](https://linear.app/docs/conceptual-model), [Custom views](https://linear.app/docs/custom-views) | 저장된 필터 보기 |
| VS Code | 액티비티 바가 기본 사이드바 내용을 바꿈, 보조 사이드바 기본값 Chat. [VS Code](https://code.visualstudio.com/docs/getstarted/userinterface) | 기능 모드가 많을 때 |
| Litmaps | Workspace, Map, Tag, Seed, Discover, Monitor, 지도 합치기. [Litmaps](https://docs.litmaps.com/en/collections/8541861-how-to-use-litmaps) | 시드 기반 인용 지도 |
| ResearchRabbit(2025) | 탐색 단계 기록과 되돌아가기, 색 구분 컬렉션. [Aaron Tay](https://aarontay.substack.com/p/researchrabbits-2025-revamp-iterative) | 반복 인용 추적 |
| Tableau | Data pane, 시트 탭(워크시트·대시보드·스토리). [Tableau](https://help.tableau.com/current/pro/desktop/en-us/environment_workspace.htm) | 한 데이터의 여러 분석 보기 |

공통 패턴: 맨 위 작업공간 전환기, 아이콘 열, 자동 생성 목록(미분류·중복·휴지통), 즐겨찾기·최근, 컬렉션 트리와 다중 소속, 저장된 보기, 캔버스 목록과 레이어 패널 분리.

## 3. 여러 지도와 레이어의 구분(GIS)

- QGIS: 레이어 패널(그룹 트리, 표시 체크, 그리기 순서), Map Theme(보이는 레이어·스타일·펼침 상태 저장). 프로젝트 = 작업공간, 맵 테마 = 표시 조합, 인쇄 레이아웃 = 출력물. [QGIS](https://docs.qgis.org/3.40/en/docs/user_manual/introduction/general_tools.html)
- Google My Maps: 지도당 레이어 최대 10개. [My Maps](https://support.google.com/mymaps/answer/3024933?hl=en&co=GENIE.Platform%3DDesktop)
- Felt: 작업공간(Recents, Drafts, Projects)에서 지도 관리, 지도 안은 Legend 탭과 List 탭. [Felt](https://help.felt.com/getting-started/tour-the-interface)
- Kepler.gl: Layers, Filters, Interactions, Base map 패널, 필터는 모든 레이어에 적용. [Kepler](https://docs.kepler.gl/docs/user-guides/j-get-started) JSON 저장에 데이터와 설정이 함께 담김. [내보내기](https://docs.kepler.gl/docs/user-guides/k-save-and-export)

Constellation 적용 제안:
- 지도 = 코퍼스 + 임베딩·투영 파라미터 + 클러스터링 결과. 좌표가 달라지면 다른 지도다.
- 레이어 = 같은 좌표 위에 겹치는 것(클러스터 경계, 인용선, 컬렉션 강조, 추가한 논문, 에이전트 결과).
- 저장된 보기 = 레이어 표시 + 필터 + 카메라 + 뷰 모드(QGIS Map Theme).

## 4. 개인 지식 기능

| 기능 | 사례 |
|---|---|
| 컬렉션 | Zotero(다중 소속, 저장 검색), S2 폴더([S2](https://www.semanticscholar.org/product)), ResearchRabbit |
| 태그 | Zotero 태그 선택기(AND, 색 태그 1–9 키), Litmaps, Atlas |
| 읽음 상태 | Zotero 기본 기능 없음, 플러그인으로 해결하며 오래된 요청. [Forums](https://forums.zotero.org/discussion/117017/read-vs-unread-feature), [zotero-reading-list](https://github.com/Dominic-DallOsto/zotero-reading-list) |
| 하이라이트·메모 | Zotero PDF 리더([Zotero](https://www.zotero.org/support/pdf_reader)), Zotero 8 메모 검색([Zotero 8](https://www.zotero.org/blog/zotero-8/)) |
| 선별 판정 | Rayyan Include/Exclude/Maybe + 제외 사유 |
| 저장된 보기 | Linear custom views, Obsidian Bases, QGIS Map Theme |
| 비교 | Litmaps 지도 합치기, 논문 나란히 비교 화면은 미확인 |

## 5. 대규모 점 지도의 선택·필터·주석

- Nomic Atlas: 벡터 검색, 정규식 검색, 메타데이터 필터, 올가미, 한 점씩 고르기. 어떤 선택이든 "Tag all results"로 태그를 붙이고 태그를 다시 필터로 쓴다. [Controls](https://docs.nomic.ai/api/datasets/data-maps/controls), [Curation](https://docs.nomic.ai/api/datasets/data-maps/guides/data-curation)
- Embedding Projector: 클릭 시 최근접 이웃 선택, 검색 선택, 구 범위 선택, "Isolate Points"로 선택한 점만 다시 투영, 상태 파일 공유와 북마크. [arXiv 1611.05469](https://arxiv.org/abs/1611.05469)
- Kepler.gl: 열 기준 필터, CSV 내보내기 시 필터 적용분 선택.

제안: 올가미·클러스터 클릭·검색·인용 이웃·에이전트 답변이 모두 하나의 "선택 집합"을 만들고, 선택 집합에서 컬렉션 저장·태그·하위 지도 만들기·에이전트 요약·내보내기를 실행한다.

## 6. 재현성과 공유

- UMAP은 `random_state`를 지정해야 재현되고, 지정하면 병렬 실행이 꺼진다. 주요 파라미터 `n_neighbors`, `min_dist`(기본 0.1). [UMAP](https://umap-learn.readthedocs.io/en/latest/reproducibility.html), [Parameters](https://umap-learn.readthedocs.io/en/latest/parameters.html) 지도마다 임베딩 모델, 투영 파라미터, 시드, 클러스터링 설정, 수집 쿼리·날짜, 출처 DB를 기록한다(PRISMA-S 항목과 맞춤).
- 내보내기: Zotero는 BibTeX, BibLaTeX, RIS, CSL JSON, Zotero RDF(컬렉션 단위). [formats](https://www.zotero.org/support/dev/data_formats) Kepler는 이미지, CSV, HTML, JSON, 비디오.
- 인용 가능한 스냅샷: Zenodo는 버전마다 DOI와 concept DOI를 발급, 재현 목적이면 특정 버전 DOI 인용 권장. [Zenodo](https://help.zenodo.org/docs/deposit/manage-versions/)

## 사이드바 구조안

공통 전제: 뷰 5개는 사이드바에서 빼서 캔버스 상단 세그먼트 컨트롤로 옮긴다(같은 지도를 다르게 보는 방법). 에이전트 채팅은 오른쪽 보조 사이드바.

**안 A · 지도 전환기 + 단일 목록**
```
[지도 전환기 ▾  NLP 코퍼스 · 10,412편]
검색 (⌘K)
수집함 · 즐겨찾기/최근 · 이 지도의 레이어 · 클러스터 · 저장된 보기 · 컬렉션 · 읽음 상태
```
- 장점: 현재 구조와 가장 가깝고, 지도 전환(맨 위)과 레이어(가운데)가 위치로 구분된다.
- 단점: 섹션이 많아 세로로 길어지고 체계적 리뷰 선별을 넣을 자리가 없다.
- 적합: 개인 연구자의 분야 진입, 관련 연구 절 작성, 동향 추적.

**안 B · 액티비티 바 + 모드별 사이드바**
```
◎ 지도 │ ▤ 라이브러리 │ ⊕ 수집 │ ✓ 리뷰 │ ⇪ 내보내기
```
- 장점: 지도 전환·직접 추가·수집을 각각 모드로 두고, 기능이 늘면 아이콘을 추가한다.
- 단점: 모드 전환 시 사이드바가 통째로 바뀌어 지도를 보며 컬렉션에 넣는 작업에 전환 비용이 생긴다.
- 적합: 여러 지도·수집·체계적 리뷰를 모두 다루는 사용자.

**안 C · 프로젝트(리뷰 질문) 중심 단계형**
```
[프로젝트 ▾]  지도 · 단계(식별 → 선별 → 포함) · 컬렉션 · 수집 이력
```
- 장점: 재현성 요건이 구조에 들어 있어 PRISMA 흐름도로 이어진다.
- 단점: 목적 없는 탐색에는 무겁고 첫 사용자 진입 장벽이 된다.
- 적합: 체계적·스코핑 리뷰, 학위논문 문헌 장.

권고: 안 A로 시작하고, 데이터 모델은 안 B·C를 받을 수 있게 설계한다. 리뷰 기능이 들어오는 시점에 안 B의 아이콘 열을 더한다.

미확인: Observable 내비게이션, Atlas 선택 결합 규칙, Zotero CSV 내보내기, 논문 비교 전용 화면.
