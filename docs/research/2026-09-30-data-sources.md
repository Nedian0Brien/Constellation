# 데이터 소스와 논문 가져오기 경로 조사

조사일 2026-09-30 · 공식 문서를 직접 확인했고 확인하지 못한 값은 "미확인"으로 적었다. 이 문서는 [연구 도구 기획](../RESEARCH-TOOL-PLAN.md)의 근거 자료다.

분야 수집은 OpenAlex 토픽 필터와 cursor 페이지네이션으로 계속하면 된다. 사용자 논문 추가는 식별자 해석에 Semantic Scholar(S2)를 넣어야 한다. OpenAlex works 식별자에는 arXiv 키가 없고, arXiv DOI 단건 조회도 실패했다. 증분 모니터링용 `from_updated_date`는 유료 플랜 전용이라, 무료 경로는 게재일 롤링 조회와 로컬 중복 제거다.

## 1. OpenAlex

| 항목 | 내용 | 출처 |
|---|---|---|
| 요금 | 단건 조회 무료. list+filter 1,000회당 $0.10, search·semantic 1,000회당 $1, 콘텐츠 다운로드 1,000회당 $10 | [example-costs](https://help.openalex.org/access/example-costs/) |
| 일일 예산 | 키 없이 $0.10/일, 무료 키 $1/일, 유료 플랜은 더 높음. 키 없는 호출 응답에 `x-ratelimit-limit-usd: 0.1` 실측 | 같은 페이지 |
| 속도 한도 | 초당 100요청 또는 일일 예산 초과 시 429 | [authentication](https://help.openalex.org/api-reference/authentication) |
| 키 전달 | `api_key` 쿼리 또는 `Authorization: Bearer`, 잔여는 `X-RateLimit-*` | 같은 페이지 |
| 필수화 | 2026년 2월 공지 | [블로그](https://blog.openalex.org/openalex-api-new-features-and-usage-based-pricing/) |
| 페이지네이션 | `per_page` 최대 100(200은 deprecated). page 방식 1만 건까지, 그 이상 `cursor=*` → `next_cursor` | [paging](https://help.openalex.org/api/paging/) |
| 필터 | 쉼표=AND, `\|`=OR(값 100개), `!`=NOT, `cited_by_count:>N`, `from_publication_date`. `from_created_date`·`from_updated_date`는 유료 전용 | [filtering](https://help.openalex.org/api/filtering/) |
| 토픽 체계 | 도메인 4 → 필드 26 → 서브필드 252 → 토픽 4,516. 논문당 토픽 최대 3개, 1위가 `primary_topic`. 부여율 약 88%. 필터 `primary_topic.id`, `topics.id`, `topics.subfield.id`, `topics.field.id`, `topics.domain.id` | [topics](https://help.openalex.org/data/topics/) |
| Concepts | deprecated, `concepts.id`는 `topics.id` 별칭 | [deprecations](https://help.openalex.org/api/deprecations/) |
| 초록 | `abstract_inverted_index`. "OpenAlex does not ship plaintext abstracts for legal reasons" | [work attributes](https://help.openalex.org/data/works/attributes/) |
| 식별자 | works `ids`: openalex, doi, mag, pmid, pmcid. arXiv 키 없음. `updated_date`는 인용 수 증가에도 갱신 | 같은 페이지 |
| 시맨틱 검색 | `search.semantic`, GTE Large EN(1024차원), 입력 2,000자, 결과 최대 50, 초당 1요청, `cited_by_count` 필터와 병용 불가 | [semantic-search](https://help.openalex.org/api/semantic-search/) |
| 스냅샷 | JSONL·Parquet, works 약 615 GB, 분기 공개, `deleted_ids.csv.gz`. 일일 스냅샷은 유료 | [snapshot](https://help.openalex.org/access/snapshot/), [sync](https://help.openalex.org/access/sync/) |
| 라이선스 | CC0(MAG 형식 스냅샷만 ODC-BY) | [license.md](https://github.com/ourresearch/openalex-docs/blob/main/license.md) |

- 분야 정의안: `topics.subfield.id` 또는 `topics.id` 목록(OR, 최대 100) + `from_publication_date` + `cited_by_count:>N`. `primary_topic.*`는 좁고 정밀하게, `topics.*`는 넓게 잡는다. 토픽 없는 12%는 키워드 search나 인용 확장으로 보완한다.
- 비용: 1만 편 = list 100회 ≈ $0.01.
- 실측 1건: `works/doi:10.48550/arXiv.1706.03762` 404, `doi:10.1038/nature14539` 정상(2026-09-30).
- 저장소 문서 불일치: `docs/DATA-SOURCES.md`의 per_page 최대 200·"1만 편=50회"는 현행 값 100·100회와 다르다.

## 2. Semantic Scholar

| 항목 | 내용 | 출처 |
|---|---|---|
| 한도 | 키 없이 비인증 사용자 전체가 초당 1,000요청 공유, 키 있으면 초당 1요청부터. `x-api-key` 헤더. 키 없이 한 번 호출해 429 실측 | [product/api](https://www.semanticscholar.org/product/api), [swagger](https://api.semanticscholar.org/graph/v1/swagger.json) |
| `/paper/search` | 관련도 순 1,000건까지 | swagger |
| `/paper/search/bulk` | 호출당 1,000건, `token`, 총 1,000만 건, 불리언 질의, `sort`, `fieldsOfStudy`, `publicationDateOrYear`, `minCitationCount`. 중첩 필드 불가 | swagger |
| `/paper/batch` | ID 500개, `DOI:`, `ARXIV:`, `PMID:`, `PMCID:`, `CorpusId:`, `ACL:`, `URL:` | swagger |
| 임베딩 | `fields=embedding.specter_v2`(기본은 v1) | swagger |
| Recommendations | 긍정·부정 예시 목록 또는 논문 1편 입력, 결과 최대 500 | [recommendations](https://api.semanticscholar.org/recommendations/v1/swagger.json) |
| Datasets | abstracts, papers, citations, embeddings-specter_v2 등, 최신 2026-09-22, diffs로 증분 | [datasets](https://api.semanticscholar.org/datasets/v1/swagger.json) |
| 초록 | "due to legal reasons, this may be missing even if we display an abstract on the website" | graph swagger |

## 3. 보완 소스

| 소스 | 보완하는 것 | 확인된 사실 | 출처 |
|---|---|---|---|
| Crossref | DOI 메타데이터, 무료 증분 | 공개 풀 초당 5·동시 1, polite(`mailto`) 초당 10·동시 3, Plus 150. rows 최대 1,000, `cursor=*`, 필터 `has-abstract`, `from-index-date`, `from-update-date`. 초록 일부는 저작권 대상 | [access](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/), [filters](https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-filters/) |
| arXiv API | 프리프린트, 초록 | 호출당 2,000, 전체 30,000, 3초에 1요청, 메타데이터 CC0, e-print 재서비스 금지 | [manual](https://info.arxiv.org/help/api/user-manual.html), [ToU](https://info.arxiv.org/help/api/tou.html) |
| arXiv DOI | ID → DOI | `10.48550/arXiv.<id>`, 2022년부터 전 코퍼스 | [arXiv 블로그](https://blog.arxiv.org/2022/02/17/new-arxiv-articles-are-now-automatically-assigned-dois/) |
| PubMed | 생의학 | 키 없이 3 rps, 키 있으면 10 rps | [NLM](https://support.nlm.nih.gov/kbArticle/?pn=KA-05317) |
| Europe PMC | 생의학 + 프리프린트 | `resultType=core`는 초록 포함, 한도 미확인(403) | [dev.europepmc.org](https://dev.europepmc.org/RestfulWebService) |
| DBLP | CS venue 정규화 | 공식 페이지 봇 차단, 세부 미확인 | [FAQ](https://dblp.org/faq/How+to+use+the+dblp+search+API.html) |
| CORE | OA 전문 | 토큰 기반 한도, 수치 미확인 | [CORE v3](https://api.core.ac.uk/docs/v3) |

## 4. 사용자 소유 자료 가져오기

| 경로 | 로컬 | 확인된 사실 | 출처 |
|---|---|---|---|
| Zotero 로컬 API | 가능 | `http://localhost:23119/api/`, userID `0`. 설정의 "Allow other applications…"를 켜야 하고 꺼져 있으면 403. 읽기 인증 없음, 쓰기는 Zotero 10 이상 로컬 키. 기본 페이지 나눔 없음 | [local_api](https://www.zotero.org/support/dev/web_api/v3/local_api) |
| Zotero Web API | 원격 | `since=`·`Last-Modified-Version` 증분, 응답당 100건, BibTeX·CSL-JSON·RIS | [basics](https://www.zotero.org/support/dev/web_api/v3/basics) |
| Better BibTeX | 가능 | pull export `127.0.0.1:23119/better-bibtex/collection?…` | [pull export](https://retorque.re/zotero-better-bibtex/exporting/pull/) |
| Mendeley | 원격 | 2021년 API 축소 공지만 확인 | [dev.mendeley.com](https://dev.mendeley.com/) |
| 파서 | 가능 | citation-js(BibTeX·RIS·CSL-JSON·DOI, MIT), bibtexparser 2.0.1(2026-09-10, MIT) | [citation.js](https://citation.js.org/), [PyPI](https://pypi.org/project/bibtexparser/) |
| GROBID | 가능(Docker) | 0.9.1, CRF 경량 이미지(약 500 MB)는 0.8.1부터 arm64 네이티브, 전체 이미지(약 8 GB)는 amd64 전용. 헤더 추출 최소 2 GB. `processHeaderDocument` + `consolidateHeader` | [docker](https://grobid.readthedocs.io/en/latest/Grobid-docker/), [service](https://grobid.readthedocs.io/en/latest/Grobid-service/) |
| CERMINE | 가능(Java) | v1.13, AGPL-3.0 | [GitHub](https://github.com/CeON/CERMINE) |
| PDF DOI 추출 | 가능 | Crossref 권장 정규식 `/^10.\d{4,9}/[-._;()/:A-Z0-9]+$/i`, DOI의 약 99.3% 일치 | [Crossref 블로그](https://www.crossref.org/blog/dois-and-matching-regular-expressions/) |

## 5. 새 논문 모니터링

- OpenAlex 무료 경로: `from_publication_date=<마지막 실행일 − 여유 기간>` + 분야 필터 주기 조회, OpenAlex ID로 로컬 중복 제거. `from_updated_date`·`from_created_date`는 유료. 스냅샷(615 GB)은 데스크톱 경로로 부적합.
- S2: bulk search `publicationDateOrYear` + `sort=publicationDate:desc`, 대량은 Datasets diffs.
- Crossref: `from-index-date` 무료.
- arXiv RSS: `rss.arxiv.org/rss/<cat>`, `+` 결합, 매일 자정(미 동부) 갱신, 결합 피드 2,000건. [RSS](https://info.arxiv.org/help/rss.html)
- OpenAlex·S2 자체 푸시 알림 여부는 미확인.

## 6. 증분 지도 갱신

| 기법 | 공식 문서 내용 | 출처 |
|---|---|---|
| `UMAP.transform` | 학습 모델 고정, 새 점을 기존 좌표계에 배치. 분포가 같다고 가정, 다르면 Parametric UMAP 안내 | [transform](https://umap-learn.readthedocs.io/en/latest/transform.html) |
| `UMAP.update` | 0.5.12 소스에 있으나 공식 문서 없음. precomputed metric·지도 학습 미지원 | 로컬 소스 |
| Parametric UMAP | 신경망 매핑, `fit` 재호출로 이어 학습, `tensorflow>=2.1`. Apple Silicon 가속 미확인 | [parametric](https://umap-learn.readthedocs.io/en/latest/parametric_umap.html) |
| AlignedUMAP | 시간 구간별 지도 정렬 | [aligned](https://umap-learn.readthedocs.io/en/latest/aligned_umap_basic_usage.html) |
| HDBSCAN `approximate_predict` | `prediction_data=True` 필요, 기존 클러스터 불변, "retrain your model periodically to avoid drift" | [prediction](https://hdbscan.readthedocs.io/en/latest/prediction_tutorial.html) |
| sklearn `HDBSCAN` | `fit`/`fit_predict`만, 예측 메서드 없음. `hdbscan` 패키지가 맞는 선택 | [sklearn](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.HDBSCAN.html) |

공식 문서에 전체 재계산 시점의 수치 기준은 없다. 설계 제안:
- 새 점이 기존의 10–20%를 넘을 때
- 새 점 중 노이즈 예측 비율이 기존 노이즈 비율보다 뚜렷이 높을 때(새 주제 덩어리 신호)
- 새 분야 추가 또는 임베딩 모델 교체
- 인용 이웃 재현율(M1 지표)을 transform 결과와 전체 재계산 결과로 비교해 차이가 날 때

## 7. 로컬 임베딩 모델

| 모델 | 사실 | 출처 |
|---|---|---|
| SPECTER2 | SciBERT 기반, `adapters` 필요, proximity 등 어댑터, 512토큰, Apache-2.0 | [HF](https://huggingface.co/allenai/specter2) |
| SciNCL | SciBERT 초기화, MIT, sentence-transformers로 로드 | [HF](https://huggingface.co/malteos/scincl) |
| SemCSE(2025) | SciDeBERTa 183M, MIT, SciRepEval 평균 65.76 주장 | [HF](https://huggingface.co/CLAUSE-Bielefeld/SemCSE), [arXiv 2507.13105](https://arxiv.org/abs/2507.13105) |
| Qwen3-Embedding-0.6B | 범용, 32–1024차원, 32K, Apache-2.0, mlx 4bit 변환본 | [HF](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) |
| Apple Silicon | PyTorch `mps`, macOS 14 이상 | [PyTorch MPS](https://docs.pytorch.org/docs/2.14/notes/mps.html) |

M1 측정(`docs/M1-MODEL-COMPARISON.md`)은 SPECTER2를 base만으로 쟀다. 어댑터를 붙여 다시 재기 전에는 SciNCL을 유지한다.

## 8. 라이선스와 약관

- OpenAlex CC0(역색인 초록 포함).
- S2 API 약관(2023-05-17): "Semantic Scholar" 표기 의무, API 재포장·재배포 금지. https://www.semanticscholar.org/product/api/license Datasets papers·abstracts는 ODC-BY.
- Crossref 초록 일부 저작권 대상. arXiv 메타데이터 CC0, PDF 재서비스 금지.
- 권고: S2·Crossref 초록은 로컬 임베딩에만 쓰고 앱 밖으로 재배포하지 않는다.

## 권장 파이프라인

**사용자 논문 추가**
1. 입력 정규화: BibTeX·RIS·CSL-JSON(citation-js 또는 bibtexparser), Zotero 로컬 API, PDF는 DOI 정규식 → 실패 시 GROBID 경량 이미지(선택).
2. 식별자 해석: DOI는 OpenAlex 단건(무료). arXiv ID와 OpenAlex 404 DOI는 S2 `/paper/batch`로 해석해 DOI·제목으로 OpenAlex 재매칭, 남은 것은 Crossref.
3. 초록: OpenAlex → S2 → arXiv → Crossref, 모두 실패하면 제목만 임베딩하고 품질 표시.
4. 배치: SciNCL 임베딩 → `UMAP.transform` → `approximate_predict`, 인용은 OpenAlex `referenced_works`.

**분야 수집**
1. OpenAlex 토픽 트리에서 subfield·topic ID 선택 + 인용 수·게재일 필터, `per_page=100` + cursor.
2. 선택: 1-hop `referenced_works` 확장, 시드 논문이 있으면 S2 Recommendations.
3. 새 분야 추가 시 전체 재계산.

**모니터링**: 하루 한 번 OpenAlex 게재일 롤링 조회 + arXiv RSS → 증분 배치, 재계산 기준에 걸리면 전체 재계산 제안.
