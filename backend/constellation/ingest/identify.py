"""외부 논문 검색과 식별자 해석.

사용자가 넣는 문자열은 검색어이거나 식별자(DOI, arXiv ID, OpenAlex ID)다.
식별자는 단건 조회(무료)로, 검색어는 OpenAlex 전문 검색(1,000회에 $1)으로 찾는다.

arXiv는 OpenAlex만으로 찾지 않는다. OpenAlex의 arXiv DOI(`10.48550/arxiv.*`)
기록이 다른 논문으로 덮인 경우가 있다(2026-10-06 실측: `2005.11401` →
W3027879771 "Affordance-Compiled Intelligence…"). Semantic Scholar에서 제목·연도·
외부 ID를 받고, OpenAlex 기록은 제목이 같을 때만 쓴다.
"""
from __future__ import annotations

import re
from typing import Any

from ..sources.base import norm_title
from ..sources.openalex import OpenAlexSource, reconstruct_abstract, strip_id

PER_PAGE = 25
MAX_PAGE = 40
# 검색 결과 표시에 필요한 필드. 초록은 유무만 본다.
RESULT_SELECT = ",".join([
    "id", "doi", "title", "publication_year", "cited_by_count",
    "authorships", "primary_location", "abstract_inverted_index",
])

_DOI = re.compile(r"^(?:https?://(?:dx\.)?doi\.org/|doi:)?(10\.\d{4,9}/\S+)$", re.I)
_ARXIV_NEW = r"\d{4}\.\d{4,5}"
_ARXIV_OLD = r"[a-z][a-z\-]*(?:\.[A-Z]{2})?/\d{7}"
_ARXIV = re.compile(
    r"^(?:arxiv:|https?://arxiv\.org/(?:abs|pdf)/)?(%s|%s)(?:v\d+)?(?:\.pdf)?$"
    % (_ARXIV_NEW, _ARXIV_OLD), re.I)
_ARXIV_DOI = re.compile(r"^10\.48550/arxiv\.(.+)$", re.I)
_OPENALEX = re.compile(r"^(?:openalex:|https?://openalex\.org/)?(W\d+)$", re.I)
_S2 = re.compile(r"^(?:s2:|https?://(?:www\.)?semanticscholar\.org/paper/(?:[^/]+/)?)([0-9a-f]{40})$", re.I)


def classify(q: str) -> tuple[str, str]:
    """(종류, 값). 종류는 openalex | s2 | arxiv | doi | search."""
    s = q.strip()
    m = _S2.match(s)
    if m:
        return "s2", m.group(1).lower()
    m = _OPENALEX.match(s)
    if m:
        return "openalex", m.group(1).upper()
    m = _ARXIV.match(s)
    if m:
        return "arxiv", m.group(1)
    m = _DOI.match(s)
    if m:
        doi = m.group(1).lower()
        a = _ARXIV_DOI.match(doi)
        if a:
            return "arxiv", a.group(1)
        return "doi", doi
    return "search", s


def summarize(r: dict[str, Any]) -> dict[str, Any]:
    """OpenAlex 원본 행 → 검색 결과 항목."""
    authors = [(a.get("author") or {}).get("display_name")
               for a in (r.get("authorships") or [])]
    src = ((r.get("primary_location") or {}).get("source") or {})
    return {
        "id": "openalex:" + (strip_id(r.get("id")) or ""),
        "title": (r.get("title") or r.get("display_name") or "").strip() or "(제목 없음)",
        "year": r.get("publication_year"),
        "authors": [a for a in authors if a][:5],
        "venue": src.get("display_name"),
        "cited_by_count": r.get("cited_by_count"),
        "doi": r.get("doi"),
        "has_abstract": bool(reconstruct_abstract(r.get("abstract_inverted_index"))),
        "source": "openalex",
    }


async def _s2_fetch_default(key: str) -> dict[str, Any] | None:
    from ..sources.semanticscholar import PAPER_FIELDS, fetch_paper
    return await fetch_paper(key, PAPER_FIELDS)


async def openalex_of(
    src: OpenAlexSource, paper: dict[str, Any], log=None,
) -> dict[str, Any] | None:
    """S2 기록과 같은 논문의 OpenAlex 원본 행. 제목이 같은 기록만 쓴다."""
    log = log or (lambda msg: None)
    want = norm_title(paper.get("title"))
    if not want:
        return None
    year = paper.get("year")
    ext = paper.get("externalIds") or {}
    keys = []
    if ext.get("DOI") and not _ARXIV_DOI.match(ext["DOI"]):
        keys.append("doi:" + ext["DOI"].lower())
    if ext.get("MAG"):
        keys.append("W" + str(ext["MAG"]))
    for key in keys:
        r = await src.get_work(key, RESULT_SELECT)
        if r and norm_title(r.get("title")) == want:
            return r

    # 제목 검색은 list+filter 요금이다. 쉼표·세로줄·쌍점은 필터 구문이라 뺀다.
    title = re.sub(r"[,|:]", " ", paper["title"])
    payload = await src._get({"filter": "title.search:" + title,
                              "select": RESULT_SELECT, "per-page": 25})
    same = [r for r in payload.get("results") or []
            if norm_title(r.get("title")) == want
            and (year is None or r.get("publication_year") is None
                 or abs(r["publication_year"] - year) <= 1)]
    if not same:
        log("  %s는 OpenAlex에서 같은 제목의 기록을 찾지 못했다" % paper["title"][:80])
        return None
    return max(same, key=lambda r: r.get("cited_by_count") or 0)


async def resolve_arxiv(
    src: OpenAlexSource, arxiv_id: str, s2_fetch=None, log=None,
) -> dict[str, Any] | None:
    """arXiv ID → OpenAlex 원본 행. 찾지 못하면 None이고, 이유는 log로 남긴다."""
    log = log or (lambda msg: None)
    paper = await (s2_fetch or _s2_fetch_default)("arXiv:" + arxiv_id)
    if not paper or not paper.get("title"):
        log("  Semantic Scholar에 arXiv:%s 가 없다" % arxiv_id)
        return None
    return await openalex_of(src, paper, log)


async def lookup(
    src: OpenAlexSource, q: str, s2_fetch=None, log=None,
) -> tuple[str, dict[str, Any] | None, str | None]:
    """식별자 하나 → (종류, 기록, 출처). 출처는 openalex | s2 | None(못 찾음).

    OpenAlex 기록이 있으면 그것을 쓴다. DOI·arXiv·S2 id가 OpenAlex에 없으면
    Semantic Scholar 기록을 돌려준다. 검색어면 ("search", None, None).
    """
    log = log or (lambda msg: None)
    s2_fetch = s2_fetch or _s2_fetch_default
    kind, value = classify(q)
    if kind == "search":
        return kind, None, None
    if kind == "openalex":
        row = await src.get_work(value, RESULT_SELECT)
        return kind, row, "openalex" if row else None
    if kind == "doi":
        row = await src.get_work("doi:" + value, RESULT_SELECT)
        if row:
            return kind, row, "openalex"
        paper = await s2_fetch("DOI:" + value)
    elif kind == "arxiv":
        paper = await s2_fetch("arXiv:" + value)
    else:  # s2
        paper = await s2_fetch(value)
    if not paper or not paper.get("title"):
        log("  Semantic Scholar에도 없다: %s" % q)
        return kind, None, None
    row = await openalex_of(src, paper, log)
    if row:
        return kind, row, "openalex"
    return kind, paper, "s2"


def summarize_s2(rec: dict[str, Any]) -> dict[str, Any]:
    """S2 기록 → 검색 결과 항목. 모양은 OpenAlex 결과(`summarize`)와 같다."""
    from ..sources.base import norm_doi
    doi = norm_doi((rec.get("externalIds") or {}).get("DOI"))
    return {
        "id": "s2:" + rec["paperId"],
        "title": (rec.get("title") or "").strip() or "(제목 없음)",
        "year": rec.get("year"),
        "authors": [a["name"] for a in rec.get("authors") or [] if a.get("name")][:5],
        "venue": rec.get("venue") or None,
        "cited_by_count": rec.get("citationCount"),
        "doi": "https://doi.org/" + doi if doi else None,
        "has_abstract": bool((rec.get("abstract") or "").strip()),
        "source": "s2",
    }


def item(record: dict[str, Any], source: str) -> dict[str, Any]:
    return summarize(record) if source == "openalex" else summarize_s2(record)


async def search(
    src: OpenAlexSource, q: str, page: int = 1, s2_fetch=None,
    source: str = "openalex", s2=None,
) -> dict[str, Any]:
    """검색어 또는 식별자로 찾는다. 식별자면 결과는 0–1편이고, 출처와 관계없이
    OpenAlex 기록을 먼저 쓴다. 검색어는 `source`(openalex | s2)에서 찾는다."""
    q = q.strip()
    if not q:
        raise ValueError("검색어가 필요합니다.")
    if source not in ("openalex", "s2"):
        raise ValueError("source는 openalex 또는 s2여야 합니다.")
    if not 1 <= page <= MAX_PAGE:
        raise ValueError("page 값은 1–%d 사이여야 합니다." % MAX_PAGE)
    kind, record, found = await lookup(src, q, s2_fetch)
    if kind != "search":
        items = [item(record, found)] if record else []
        return {"query": q, "kind": kind, "source": found or source,
                "total": len(items), "page": 1, "items": items}
    if source == "s2":
        if s2 is None:
            from ..sources.semanticscholar import S2Client
            async with S2Client() as client:
                total, rows = await client.search(q, (page - 1) * PER_PAGE, PER_PAGE)
        else:
            total, rows = await s2.search(q, (page - 1) * PER_PAGE, PER_PAGE)
        # S2 관련도 검색은 1,000건까지만 준다.
        return {"query": q, "kind": "search", "source": "s2", "total": min(total, 1000),
                "page": page, "items": [summarize_s2(r) for r in rows]}
    total, rows = await src.search_works(q, page, PER_PAGE, RESULT_SELECT)
    return {"query": q, "kind": "search", "source": "openalex", "total": total, "page": page,
            "items": [summarize(r) for r in rows]}
