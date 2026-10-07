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


def classify(q: str) -> tuple[str, str]:
    """(종류, 값). 종류는 openalex | arxiv | doi | search."""
    s = q.strip()
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
    }


async def resolve_arxiv(
    src: OpenAlexSource, arxiv_id: str, s2_fetch=None,
) -> dict[str, Any] | None:
    """arXiv ID → OpenAlex 원본 행. 찾지 못하면 None."""
    if s2_fetch is None:
        from ..sources.semanticscholar import fetch_paper as s2_fetch
    paper = await s2_fetch("arXiv:" + arxiv_id)
    if not paper or not paper.get("title"):
        return None
    want = norm_title(paper["title"])
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

    # 제목 검색은 list+filter 요금이다. 쉼표는 필터 구분자라 뺀다.
    title = re.sub(r"[,|:]", " ", paper["title"])
    payload = await src._get({"filter": "title.search:" + title,
                              "select": RESULT_SELECT, "per-page": 25})
    same = [r for r in payload.get("results") or []
            if norm_title(r.get("title")) == want
            and (year is None or r.get("publication_year") is None
                 or abs(r["publication_year"] - year) <= 1)]
    if not same:
        return None
    return max(same, key=lambda r: r.get("cited_by_count") or 0)


async def lookup(src: OpenAlexSource, q: str, s2_fetch=None) -> tuple[str, dict[str, Any] | None]:
    """식별자 하나 → (종류, OpenAlex 원본 행). 검색어면 ("search", None)."""
    kind, value = classify(q)
    if kind == "openalex":
        return kind, await src.get_work(value, RESULT_SELECT)
    if kind == "doi":
        return kind, await src.get_work("doi:" + value, RESULT_SELECT)
    if kind == "arxiv":
        return kind, await resolve_arxiv(src, value, s2_fetch)
    return kind, None


async def search(src: OpenAlexSource, q: str, page: int = 1, s2_fetch=None) -> dict[str, Any]:
    """검색어 또는 식별자로 찾는다. 식별자면 결과는 0–1편이다."""
    q = q.strip()
    if not q:
        raise ValueError("검색어가 필요합니다.")
    if not 1 <= page <= MAX_PAGE:
        raise ValueError("page 값은 1–%d 사이여야 합니다." % MAX_PAGE)
    kind, row = await lookup(src, q, s2_fetch)
    if kind != "search":
        items = [summarize(row)] if row else []
        return {"query": q, "kind": kind, "total": len(items), "page": 1, "items": items}
    total, rows = await src.search_works(q, page, PER_PAGE, RESULT_SELECT)
    return {"query": q, "kind": "search", "total": total, "page": page,
            "items": [summarize(r) for r in rows]}
