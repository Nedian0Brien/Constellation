# 문헌 지도·탐색 도구 조사

조사일 2026-09-30 · WebSearch·WebFetch로 공식 문서와 가격 페이지를 확인했다. 이 문서는 [연구 도구 기획](../RESEARCH-TOOL-PLAN.md)의 근거 자료다.

- Reddit 공개 API가 403이라 Reddit 원문은 확인하지 못했다. 사용자 불만은 리뷰·블로그·도서관 가이드에서 가져왔다.
- Connected Papers, Consensus, Scholarcy의 공식 가격 페이지는 읽히지 않았다(빈 내용 또는 403). 이 셋의 가격은 제3자 출처이고 그렇게 표시했다.

## 도구별 정리

### Litmaps
- 단위: Litmap(지도), Tag, Workspace. 지도 합치기, Workspace 간 복사. https://docs.litmaps.com/en/collections/8541861-how-to-use-litmaps
- 추가: 검색, DOI, BibTeX·RIS·PubMed 가져오기, Zotero 양방향 동기화(Tag ↔ Collection). https://docs.litmaps.com/en/articles/9081738-import-articles-into-litmaps · https://docs.litmaps.com/en/articles/9421968-sync-zotero-with-litmaps
- 지도: 인용 그래프를 2축 산점도로 표시, X·Y축(출판일, 인용 수 등) 변경. https://docs.litmaps.com/en/articles/9181490-use-and-edit-litmaps-visualization
- 갱신: Monitor가 저장 검색을 새 논문에 다시 실행해 이메일 알림, 조건 설정은 Pro. https://docs.litmaps.com/en/articles/9126249-monitor-get-alerts-for-important-research
- 내보내기: 공유 링크, BibTeX·RIS·CSV. https://docs.litmaps.com/en/articles/9092828-export-articles-from-litmaps
- 소스: Semantic Scholar, OpenAlex, Crossref(2억 7천만 건 이상). https://docs.litmaps.com/en/articles/7212085-litmaps-database-coverage-open-access-and-article-indexing
- 가격: Free(Litmap 1개, 논문 100편, 월간 알림), Pro 월 10달러(무제한), Team 별도 문의. https://www.litmaps.com/pricing
- 불만: 로딩이 몇 초 걸림. https://effortlessacademic.com/litmaps-vs-researchrabbit-vs-connected-papers-the-best-literature-review-tool-in-2025/

### ResearchRabbit
- 소유 관계: 언론은 2025년 5월 Litmaps 인수로 보도(https://business.scoop.co.nz/2025/05/08/nz-startup-litmaps-acquires-us-rival-and-raises-1m-to-accelerate-ai-driven-research-worldwide/), 공식 발표는 "partnership"(https://www.researchrabbit.ai/announcement-researchrabbit-release-2025). 새 버전 출시 2025-10-30(https://aarontay.substack.com/p/researchrabbits-2025-revamp-iterative).
- 단위: Collection, RR+는 주제별 Project 여러 개.
- 추가: 검색(3억 1천만 건 이상), Zotero, BibTeX·RIS. https://www.researchrabbit.ai/
- 지도: 시드 논문에서 Similar·References·Citations를 반복 탐색하는 인용 그래프. 2025 개편 후 축과 노드 크기 설정. 개편에서 Zotero 양방향 동기화가 빠짐.
- 갱신: RR+ Signals alerts, 무료 범위 미확인. 협업: 무료에서도 Collection 공유.
- 가격: Free(시드 50편), RR+ 월 10달러(연간)/12.5달러(월간, 시드 300편, 다중 프로젝트), Institution. https://www.researchrabbit.ai/pricing
- 불만: 새 UI가 복잡, 일부 기능 유료화. https://tooliverse.ai/tools/researchrabbit

### Connected Papers
- 단위: 시드 논문 1편의 그래프, multi-origin으로 시드 추가.
- 지도: co-citation·bibliographic coupling 유사도의 force-directed 그래프, 후보 약 5만 편 중 수십 편 표시, Prior/Derivative works. https://www.connectedpapers.com/about (검색 스니펫)
- 소스: Semantic Scholar. 내보내기: Zotero 연동. https://libguides.lmu.edu/AIresearchtools/CP
- 가격(제3자): 무료 월 5개 그래프, Academic 월 약 6달러.
- 불만: 입력이 논문 1편 중심, 고인용 편향, 비영어권·단행본 누락.

### Inciteful
- 도메인이 incitefulmed.com/academic으로 리다이렉트. 제목 검색, DOI, BibTeX 내보내기. https://incitefulmed.com/academic/help/quick-start.html
- Zotero 플러그인에서 그래프 탐색 시작. https://blog.stephenturner.us/p/inciteful-zotero-biologpt-semantic-scholar
- 지도: Paper Discovery(시드 주변 인용 네트워크), Literature Connector(두 논문 사이 최단 인용 경로).
- 소스 OpenAlex·S2·Crossref, 무료·오픈소스(제3자). https://casrai.org/guides/inciteful-citation-network-paper-discovery

### Semantic Scholar
- Library 폴더, 폴더별 Research Feed(대조학습 임베딩 기반 추천, 매일·매주), 저자·인용 알림, BibTeX 등 내보내기, 무료. https://www.semanticscholar.org/faq
- Semantic Reader는 arXiv 논문 한정, 스키밍 하이라이트는 영어 CS 논문 한정. https://www.semanticscholar.org/product/semantic-reader
- 지도 기능 없음.

### Elicit
- 검색(1억 3천8백만 편 이상), 리포트, 체계적 문헌고찰 워크플로, Zotero 가져오기. 출력은 표 형식 데이터 추출.
- Research alerts(Pro 10개), Scale 플랜 팀 협업. 가격 Basic 무료, Pro 월 49달러, Scale 월 169달러, Enterprise. https://elicit.com/pricing
- 불만(제3자): 크레딧 소진이 빠름. https://paperguide.ai/blog/elicit-alternatives/

### Consensus
- Library·Collection, Zotero API 키로 라이브러리 전체 가져오기(자동 동기화 없음). https://help.consensus.app/en/articles/13393104-how-to-import-your-zotero-library-into-consensus
- 내보내기 CSV·RIS. https://help.consensus.app/en/articles/9922811-how-to-export-consensus-results-to-reference-managers-endnote-zotero-paperpile
- 질의응답 중심, 지도 없음. 가격 미확인.

### scite
- Collection(Basic 1천 편, Pro 1만 편), Smart Citations(인용 문맥 지지·반박 분류), 인용 알림, Zotero 플러그인.
- 가격: 무료 Connect(MCP 크레딧 25), Basic 월 14달러, Pro 월 35달러(API 포함), 연간 결제 기준. https://scite.ai/pricing

### Open Knowledge Maps
- 검색어 상위 100건으로 주제 지도(제목·초록·키워드 단어 공출현 클러스터링), 소스 BASE·PubMed·OpenAIRE, 무료. https://openknowledgemaps.org/faq
- Streamgraph(시간에 따른 주제 변화), Custom Clustering. https://openknowledgemaps.org/news.php

### VOSviewer
- 데스크톱 앱, 1.6.21(2026-06-12) Apple Silicon 네이티브. 공저·인용·서지결합·공인용·용어 공출현 네트워크, 오버레이·밀도 시각화.
- 소스: WoS, Scopus, Dimensions, Lens, PubMed/Europe PMC, OpenAlex(API 키), Crossref, Semantic Scholar, RIS. https://www.vosviewer.com/
- OpenAlex 쿼리 분석 50,000건까지. https://help.openalex.org/hc/en-us/articles/24829724234007-Export-results-from-the-OpenAlex-website
- VOSviewer Online 공유, 무료. https://www.vosviewer.com/getting-started
- 모니터링 없음. 불만: WoS·Scopus 병합 시 정확도 저하, 전처리 부담. https://link.springer.com/article/10.1007/s11192-025-05415-x

### CiteSpace
- Java 데스크톱, 7.0.2(2026-08-25). Basic 무료, Standard 연 65달러, Intermediate 연 110달러, Advanced 2년 155달러. https://citespace.podia.com/ · https://citespace.podia.com/download
- 공인용 클러스터, Timeline, Kleinberg burst, 구조 변이, dual-map, Advanced는 GPT 클러스터 요약(스니펫). 지원 DB 목록은 미확인.

### Bibliometrix / Biblioshiny
- R 패키지 + Shiny UI, v5.0 Biblio AI. 소스 Scopus, WoS, PubMed, Lens, Dimensions, OpenAlex, Cochrane. thematic map·evolution, historiograph. 무료. https://www.bibliometrix.org/home/

### Nomic Atlas
- 임베딩 기반 의미 클러스터 지도, 줌에 따른 계층형 토픽 라벨, 데이터 추가 시 재생성, 수백만 포인트. https://docs.nomic.ai/atlas/datasets/data-maps
- 현재 방향: 에이전트 요금제(Individual 월 20달러, Business 좌석당 40달러·최소 25석), Autodesk·Bentley 연동, AEC 시장. https://www.nomic.ai/pricing · https://atlas.nomic.ai/industries/architecture-engineering-construction

### Iris.ai
- Axion, Neuralith, RSpace — 제조·생명과학·에너지 기업 대상. https://iris.ai/ 연구자 개인용 지도 도구는 미확인.

### Zotero와 플러그인
- Zotero 8(2026-01) 통합 인용 대화상자. https://www.zotero.org/blog/zotero-8/ 6–10주 릴리스 주기. https://digitalhumanitiesnow.org/2026/01/a-faster-release-cycle-for-zotero/
- Zotero 9 Read Aloud, Recently Read(도서관 공지 기준). https://www.mondragon.edu/en/web/biblioteka/-/gestor-bibliografico-zotero-9
- MCP 프로젝트 14개 이상(읽기 전용 Web API부터 내부 JS API 쓰기까지). https://citationstyler.com/en/knowledge/zotero-and-mcp-all-projects-at-a-glance-to-connect-your-library-with-ai/
- 지도 기능은 플러그인(Inciteful 등)에 맡김.

### Obsidian 연구 플러그인
- Zotero Integration, ZotLit, Citations가 Zotero 메타데이터·PDF 주석을 Markdown 노트로 가져옴. https://community.obsidian.md/plugins/obsidian-zotero-desktop-connector · https://community.obsidian.md/plugins/zotlit
- Graph view는 노트 링크 그래프이고 인용·초록 유사도를 계산하지 않음.

### Scholarcy (제3자)
- 문서 요약 플래시카드, 무료 월 10건, 개인 월 7.99–9.99달러, 기관 8,000달러부터. https://www.saasworthy.com/product/scholarcy

### Undermind
- 반복 검색 에이전트, 새 논문 알림. Free, Pro 월 16달러, Team 인당 월 15달러. https://www.undermind.ai/pricing

### OpenAlex 웹 UI
- 무료 계정으로 검색 저장·알림(https://mastodon.social/@OpenAlex/112050638916092126), CSV·RIS·TXT 내보내기 최대 10만 건. 2025-11 "Walden" 재작성으로 1억 9천만 건 추가. https://www.tub.tuhh.de/en/2026/02/10/openalex-an-open-alternative-for-academic-research/

### 2025–2026 신규
- Ai2 Asta(2025-08): Paper Finder + ScholarQA, 초록 1억 8백만·전문 1천2백만. https://allenai.org/blog/asta
- Google Scholar Labs(2025-11): 질문 단위 AI 검색, 일부 사용자. https://scholar.googleblog.com/2025/11/scholar-labs-ai-powered-scholar-search.html

## 기능 비교표

"–"는 없음, "?"는 미확인.

| 도구 | 논문 추가 | 지도 종류 | 다중 프로젝트 | 모니터링 | 협업 | 내보내기 | 로컬 | 가격 |
|---|---|---|---|---|---|---|---|---|
| Litmaps | 검색·DOI·BibTeX/RIS·Zotero 동기화 | 2축 인용 산점도 | Pro 무제한 | Monitor | Team | BibTeX/RIS/CSV | – | 무료 / 월 10달러 |
| ResearchRabbit | 검색·Zotero·BibTeX/RIS | 반복 인용 그래프 | RR+ | RR+ Signals | 공유 | ? | – | 무료 / 10–12.5달러 |
| Connected Papers | 검색·시드 | 유사도 그래프 | ? | ? | ? | Zotero | – | 제3자 기준 약 6달러 |
| Inciteful | 검색·DOI·BibTeX·Zotero | 인용 네트워크·경로 | ? | ? | ? | BibTeX | – | 무료 |
| Semantic Scholar | 검색·확장 | – | 폴더 | Feeds·알림 | ? | BibTeX 등 | – | 무료 |
| Elicit | 검색·Zotero | – (표) | ? | Alerts | Scale | ? | – | 무료 / 49 / 169달러 |
| Consensus | 검색·Zotero | – | Collection | ? | ? | CSV/RIS | – | 미확인 |
| scite | 검색 | – | Collection | 인용 알림 | ? | ? | – | 무료 / 14 / 35달러 |
| Open Knowledge Maps | 검색어 | 주제 지도·Streamgraph | ? | ? | ? | ? | – | 무료 |
| VOSviewer | DB 파일·API | 서지 네트워크 | 파일 단위 | – | Online | 이미지·파일 | 데스크톱 | 무료 |
| CiteSpace | DB 파일 | 공인용·Timeline·burst | 파일 단위 | – | – | ? | 데스크톱 | 무료 / 연 65달러~ |
| Bibliometrix | DB 파일 | thematic·historiograph | 파일 단위 | – | – | ? | 로컬 R | 무료 |
| Nomic Atlas | 업로드·API | 임베딩 지도 | ? | ? | 팀 | API | – | 미확인 |
| Zotero | 커넥터·DOI·파일 | – | 컬렉션·그룹 | – | 그룹 | 다수 | 데스크톱 | 무료 |
| Undermind | 질의 | – | Pro | 알림 | Team | ? | – | 무료 / 16달러 |
| OpenAlex UI | 검색 | – | 저장 검색 | 알림 | – | CSV/RIS/TXT | – | 무료 |

## 시장의 빈자리 (이번 조사 범위의 결론)

- **로컬 우선 탐색형 지도**: 로컬에서 도는 지도 도구(VOSviewer, CiteSpace, Bibliometrix)는 WoS·Scopus 내보내기 파일을 한 번 분석하고, 모니터링·반복 탐색이 없다. 탐색형 도구(Litmaps, ResearchRabbit, Connected Papers, Inciteful)는 웹 전용이다. 로컬 데이터를 가진 Zotero·Obsidian에는 인용·임베딩 지도가 없다.
- **대규모 코퍼스**: 탐색형 도구는 수십~수백 편 규모다(Connected Papers 수십 편, Open Knowledge Maps 100편, Litmaps 무료 100편, ResearchRabbit 시드 50/300편, scite Collection 최대 1만 편). 1만 편 이상은 VOSviewer(임베딩 배치 없음)와 Nomic Atlas(AEC 시장으로 방향 전환)뿐이다. 초록 임베딩과 인용 관계를 한 지도에서 1만 편 이상 다루는 연구자용 도구는 확인하지 못했다.
- **시간 흐름 재생**: 시간 축은 모두 정적 표현이다(Litmaps 연도 축, CiteSpace Timeline·burst, OKM Streamgraph, Bibliometrix thematic evolution). 지도가 연도별로 자라는 애니메이션은 확인하지 못했다.
- **에이전트 조작**: 에이전트 접근(Zotero MCP, scite MCP 크레딧, Elicit·Nomic API, Ai2 Asta)은 흔하다. 에이전트가 지도를 조작(클러스터 선택, 필터, 라벨 편집, 시점 이동)하는 도구는 확인하지 못했다.
- **반복되는 약점**: 논문 1편 중심 입력(Connected Papers), 고인용 편향, 비영어권 누락, 개편 후 UI 복잡화와 Zotero 동기화 제거(ResearchRabbit), 자동 동기화 없음(Consensus), 전처리 부담(VOSviewer, CiteSpace, Bibliometrix).

## 연구자가 기대하는 표준 기능

1. 검색, DOI, BibTeX/RIS 가져오기, Zotero 연동(가능하면 양방향 동기화)
2. 여러 편을 시드로 받는 탐색(참고문헌·인용·유사 논문 확장)
3. 지도 축과 노드 크기 설정
4. 여러 지도·프로젝트 관리, 지도 합치기·복사
5. 저장 검색이나 컬렉션 기준 새 논문 알림
6. BibTeX·RIS·CSV 내보내기와 공유 링크
7. 여러 데이터 소스 결합과 커버리지 공개
8. 무료 플랜과 월 10달러 안팎 개인 요금제
