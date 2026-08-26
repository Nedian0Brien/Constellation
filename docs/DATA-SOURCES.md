# 데이터 소스

> 아래 Scopus / OpenAlex 수치는 2026-08 기준 공식 문서에서 확인한 값이다.
> Semantic Scholar / Crossref 항목은 **미검증**이며 실제 사용 전 재확인이 필요하다.

## 1. 비교

| | Scopus | OpenAlex | Semantic Scholar | Crossref |
|---|---|---|---|---|
| 초록 | COMPLETE view만 | inverted index로 제공 | 일부 | 일부(JATS) |
| 인용 관계 | 별도 API (권한 필요) | `referenced_works` 필드에 포함 | 포함 | 제한적 |
| 주제 태그 | Subject Areas, ASJC | topics / concepts | fieldsOfStudy | 없음 |
| 비용 | **기관 구독 필수** | 무료 티어 있음 | 무료 | 무료 |
| 진입 장벽 | 높음 (IP/insttoken) | 낮음 (키 발급 30초) | 낮음 | 없음 |
| 커버리지 | 선별된 고품질 | 가장 넓음 (2억+) | 넓음 | DOI 등록분 전체 |

**결론 — OpenAlex를 1차 소스로 시작한다.** 인용 관계가 응답에 함께 오는 점이 결정적이다. Flow 뷰와 Lineage 뷰가 둘 다 인용 데이터에 의존하는데, Scopus는 인용을 별도 API로 받아야 하고 그마저 접근 제한이 걸려 있다.

## 2. Scopus (Elsevier)

### 확인된 제약

| API | 주간 쿼터 | 초당 | 뷰 / 건수 |
|---|---|---|---|
| Scopus Search | 20,000 | 9 | STANDARD 최대 200건 / **COMPLETE 최대 25건** |
| Abstract Retrieval | 10,000 | 9 | FULL 기본 |
| Author Search | 5,000 | 2 | 최대 200건 |
| Citation Overview | 20,000 | 4 | 접근 제한 API |

### 핵심 제약 두 가지

1. **초록(`dc:description`)과 저자 키워드(`authkeywords`)는 COMPLETE view에만 있다.** STANDARD view로는 초록을 못 받는다. 이 프로젝트는 초록이 전부이므로 COMPLETE view가 필수다.
2. **COMPLETE view는 기관 구독 entitlement가 필요하다.** 무료 개발자 키만으로는 안 된다. 캠퍼스 IP 대역에서 호출하거나 Elsevier에서 `insttoken`을 받아야 한다.

### 쿼터 산술

COMPLETE view는 요청당 25건이므로:
- 1만 편 = 400 요청 (주간 쿼터 20,000 대비 2%)
- 주간 이론상 최대 = 20,000 × 25 = **50만 건**

목표 규모(1천~1만)에서 쿼터는 전혀 문제가 아니다. **문제는 오직 entitlement다.**

또한 단일 쿼리의 결과 상한이 5,000건이다. 그 이상은 `cursor=*` 페이지네이션을 쓰거나 쿼리를 연도별로 쪼개야 한다.

### 확인해야 할 것

- [ ] 소속 기관이 Scopus를 구독하는가
- [ ] 구독한다면 캠퍼스 IP에서 COMPLETE view가 실제로 나오는가 (문서상 권한과 실제 응답이 다른 경우가 있다)
- [ ] 교외 접속용 `insttoken` 발급이 가능한가
- [ ] 초록을 로컬에 저장하는 것이 기관 라이선스의 TDM 조항에 부합하는가

## 3. OpenAlex (1차 소스)

### 2026년 정책 변경 — 주의

OpenAlex는 **사용량 기반 과금으로 전환**했다. 예전의 "키 없이 하루 10만 요청" 모델이 아니다.

- **API 키가 필수**다 (발급 무료, 약 30초)
- 키마다 **하루 $1의 무료 사용량**이 주어진다
- 무료 티어 일일 한도:

| 작업 | 무료 한도 |
|---|---|
| ID/DOI 단건 조회 | 무제한 |
| **목록 + 필터** | 10,000회 |
| 검색 | 1,000회 |
| PDF/XML 다운로드 | 100회 |

### 우리 사용량 추산

수집은 `filter` + `cursor` 페이지네이션으로 하며 `per_page`는 최대 200이다.

- 1만 편 = **50회 호출** (목록/필터 한도 10,000회 대비 0.5%)
- 10만 편으로 늘려도 500회

**무료 티어로 충분하다.** 다만 검색 엔드포인트는 한도가 1,000회로 낮으니, 탐색적 쿼리는 검색으로 하되 실제 대량 수집은 필터 기반으로 해야 한다.

### 인증 — 확인됨

키는 두 가지 방식 모두 동작하며 결과가 같다:

```bash
curl -H "Authorization: Bearer YOUR_KEY" "https://api.openalex.org/works"
curl "https://api.openalex.org/works?api_key=YOUR_KEY"
```

**헤더 방식을 쓴다.** 쿼리 파라미터로 보내면 키가 접근 로그·프록시·셀 히스토리에 그대로 남는다.

### 사용하는 쿼리 문법 — 실측 확인됨

| 기능 | 문법 | 확인 |
|---|---|---|
| 제목+초록 검색 | `title_and_abstract.search:"..."` | ✓ |
| OR 결합 | `search:"A" OR "B"` | ✓ A=2,145 / B=226 / "A OR B"=2,318 |
| 타입 OR | `type:article\|preprint\|conference-paper` | ✓ |
| 연도 | `publication_year:2024` | ✓ |
| 정렬 | `sort=cited_by_count:desc` (page 방식) | ✓ |
| 분포 집계 | `group_by=type` / `group_by=publication_year` | ✓ — 한 번의 호출로 전체 분포를 볼 수 있어 싸다 |
| ID 배치 조회 | `openalex_id:W1\|W2\|...` (50개씩) | ✓ |

`group_by`는 쿼리를 설계할 때 먼저 써볼 것. 수집 전에 연도·타입 분포를 호출 한 번으로 확인할 수 있어서, 잘못된 쿼리로 1만 편을 받은 뒤에 깨닫는 사태를 막는다.

### 구현상 주의점

**초록이 역인덱스(inverted index)로 온다.** `abstract_inverted_index` 필드는 `{"단어": [위치, 위치, ...]}` 형태라 원문 복원이 필요하다.

```python
def reconstruct(inv_index: dict[str, list[int]]) -> str:
    if not inv_index:
        return ""
    positions = [(pos, word) for word, ps in inv_index.items() for pos in ps]
    positions.sort()
    return " ".join(word for _, word in positions)
```

**인용 관계가 함께 온다.** `referenced_works`에 이 논문이 인용한 works의 ID 목록이 들어 있다. 별도 호출 없이 인용 그래프를 만들 수 있다 — 이것이 OpenAlex를 1차 소스로 고른 가장 큰 이유다.

**주제 태그도 함께 온다.** `topics`, `primary_topic`, `concepts` 필드가 Facets 패널의 1단계 구현을 그대로 채워준다.

### 최대 미지수: 초록 커버리지

일부 출판사 초록이 OpenAlex에 없을 수 있다. 이건 **추측하지 말고 M0에서 직접 측정한다.**

```
constellation stats  →  초록 보유율, 연도별 보유율, 저널별 보유율
```

| 커버리지 | 대응 |
|---|---|
| 90% 이상 | 그대로 진행 |
| 70~90% | 결손분만 Crossref/S2로 보강 |
| 70% 미만 | 대상 분야를 바꾸거나 Scopus 확보를 우선순위로 올림 |

## 4. Semantic Scholar (보조) — 미검증

초록 결손 보강과 검증용. 확인 전 가정하지 말 것:

- SPECTER 임베딩을 API가 직접 제공한다고 알려져 있다. 사실이라면 우리 임베딩과 **비교 기준**으로 쓸 수 있다 (같은 코퍼스, 다른 모델 → 클러스터가 비슷한가?)
- TLDR 한 줄 요약 제공
- API 키 없이도 낮은 rate로 사용 가능, 키 신청 시 상향

- [ ] 실제 rate limit 확인
- [ ] embedding 필드가 아직 제공되는지 확인

쓸맞한 시점 — M0의 초록 커버리지가 90% 미만으로 나왔을 때 결손분만 보강하는 용도.

## 5. Crossref (보조)

DOI 기반 메타데이터 보강. 초록은 등록된 것만 (JATS XML 조각). 무료이고 `mailto` 파라미터로 polite pool 사용. 초록 결손을 메우는 마지막 수단.

## 6. 어댑터 설계

소스가 바뀌어도 파이프라인 나머지가 흔들리지 않게 **경계를 하나만 둔다.**

```python
# sources/base.py

class Work(BaseModel):
    """모든 소스가 이 형태로 변환된다. 파이프라인은 이것만 안다."""
    id: str                      # "openalex:W2741809807"
    doi: str | None
    title: str
    abstract: str | None         # None = 초록 없음 (빈 문자열과 구분)
    year: int | None
    venue: str | None
    authors: list[Author]
    referenced_works: list[str]  # 인용 대상 ID (소스 네이티브 ID)
    topics: list[Topic]
    cited_by_count: int | None
    source: str
    raw_ref: str                 # data/raw/ 내 원본 위치


class PaperSource(Protocol):
    name: str

    async def search(self, query: str, limit: int) -> AsyncIterator[Work]:
        """쿼리 결과를 스트리밍. 페이지네이션과 rate limit은 구현체 책임."""

    async def fetch_by_ids(self, ids: list[str]) -> AsyncIterator[Work]:
        """인용 그래프 확장, 결손 보강용."""

    def supports_abstracts(self) -> bool:
        """Scopus는 entitlement에 따라 런타임에 달라진다."""
```

**`supports_abstracts()`가 런타임 메서드인 이유** — Scopus는 같은 코드가 캠퍼스 안에서는 초록을 받고 밖에서는 못 받는다. 정적 상수로 두면 조용히 빈 초록을 임베딩하게 된다. 첫 응답에서 COMPLETE view가 실제로 왔는지 확인하고, 아니면 **수집을 중단하고 명시적으로 실패**해야 한다.

### 중복 제거

여러 소스를 섞으면 같은 논문이 중복된다. 우선순위:

1. **DOI 일치** (정규화: 소문자, `https://doi.org/` 접두사 제거)
2. DOI가 없으면 **정규화 제목 + 연도** 일치 (소문자, 문장부호/공백 제거)
3. 병합 시 필드별 우선순위: 초록은 **더 긴 쪽**, 인용 목록은 **합집합**, 나머지는 소스 신뢰도 순 (Scopus > OpenAlex > S2 > Crossref)

## 7. 수집 정책

- 소스별 rate limit을 `asyncio.Semaphore` + 토큰 버킷으로 강제한다. 서버가 429로 알려주기 전에 우리가 먼저 지킨다
- 429 / 5xx는 지수 백오프로 재시도, 그 외 4xx는 즉시 실패
- 모든 응답 원본을 `data/raw/`에 그대로 저장한다. 파싱 로직이 바뀌어도 재수집이 필요 없다
- 수집 작업은 재개 가능해야 한다 (cursor 위치를 저장). 1만 편 수집 중 끊겼을 때 처음부터 다시 받는 건 낭비다
