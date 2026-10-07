"""Semantic Scholar — 초록 결손 보강과 OpenAlex에 없는 논문.

수집(collect)은 OpenAlex가 맡는다. 여기서는 OpenAlex가 못 주는 초록을 메우고,
지도에 추가할 논문이 OpenAlex에 없을 때 그 논문의 기록·참고문헌·피인용을 받는다.

왜 이것만 쓰는가 — 실측 (결손 논문 표본 기준):

    Crossref            5%   (2/40)    출판사가 초록을 예치하지 않는다
    Semantic Scholar   31%   (31/100)  배치 엔드포인트로 싸게 가져온다

결손은 Elsevier·Springer 저널에 몰려 있다 (LNCS 348/356, Information
Processing & Management 104/114). 이건 구조적으로 **Scopus가 가진 것**이며,
기관 entitlement가 생기면 그쪽이 정답이다. S2는 그때까지의 최선이다.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any, Iterable

import httpx

from .base import Author, Work, norm_doi

BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch"
BATCH_SIZE = 500
PAUSE = 3.0
MAX_RETRIES = 6          # 인증 없이 쓰는 공용 풀이라 넉넉히 둔다

_DOI_PREFIX = re.compile(r"^https?://(dx\.)?doi\.org/", re.I)


def to_s2_id(doi: str) -> str:
    return "DOI:" + _DOI_PREFIX.sub("", doi.strip())


API = "https://api.semanticscholar.org/graph/v1"
# 논문 기록에 받는 필드. 초록이 없는 기록이 있다(출판사 라이선스).
PAPER_FIELDS = ("paperId,title,abstract,year,venue,authors,externalIds,"
                "citationCount,publicationTypes")
LINK_FIELDS = "paperId,title,year,externalIds"
# 키 기본 한도는 초당 1회다(2026-10-07 semanticscholar.org/product/api).
KEYED_INTERVAL = 1.05
CITATION_PAGE = 500         # graph/v1 swagger의 /citations 예시가 limit=500을 쓴다
MAX_CITATION_PAGES = 20


class S2Client:
    """S2 Graph API 클라이언트. 키 헤더(`x-api-key`), 요청 간격, 429 재시도를 한 곳에서 한다.

    키가 없으면 모든 사용자가 나눠 쓰는 공용 한도라 429가 잦다. 그때는 지수 대기로
    다시 묻는다.
    """

    def __init__(self, api_key: str | None = ..., *, transport: httpx.AsyncBaseTransport | None = None,
                 sleep=asyncio.sleep, log=None, retries: int = MAX_RETRIES) -> None:
        if api_key is ...:
            from ..config import Settings
            api_key = Settings.load().semantic_scholar_api_key
        headers = {"User-Agent": "Constellation/0.1"}
        if api_key:
            headers["x-api-key"] = api_key
        self.keyed = bool(api_key)
        self._client = httpx.AsyncClient(timeout=60.0, headers=headers, transport=transport)
        self._sleep = sleep
        self._log = log or (lambda msg: None)
        self._retries = retries
        self._last = 0.0

    async def __aenter__(self) -> "S2Client":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self._client.aclose()

    async def _pace(self) -> None:
        if not self.keyed:
            return
        wait = self._last + KEYED_INTERVAL - time.monotonic()
        if wait > 0:
            await self._sleep(wait)
        self._last = time.monotonic()

    async def request(self, method: str, path: str, *, params: dict | None = None,
                      json_body: Any = None, missing_ok: bool = True) -> Any:
        """응답 JSON. 404는 None(missing_ok). 재시도 한도를 넘으면 RuntimeError."""
        delay = 2.0
        for attempt in range(self._retries):
            await self._pace()
            try:
                r = await self._client.request(method, API + path, params=params, json=json_body)
            except httpx.TransportError as e:
                if attempt == self._retries - 1:
                    raise RuntimeError("Semantic Scholar 네트워크 오류: %s" % type(e).__name__)
                await self._sleep(delay)
                delay = min(delay * 2, 60.0)
                continue
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404 and missing_ok:
                return None
            if r.status_code in (429, 500, 502, 503, 504) and attempt < self._retries - 1:
                wait = float(r.headers.get("Retry-After") or delay)
                self._log("  Semantic Scholar HTTP %d, %.0f초 대기 (%d/%d)"
                          % (r.status_code, wait, attempt + 1, self._retries))
                await self._sleep(wait)
                delay = min(delay * 2, 60.0)
                continue
            raise RuntimeError("Semantic Scholar HTTP %d: %s" % (r.status_code, r.text[:200]))
        raise RuntimeError("Semantic Scholar 재시도 한도 초과")

    async def paper(self, s2_id: str, fields: str = PAPER_FIELDS) -> dict | None:
        """단건 조회. id는 paperId, `ARXIV:…`, `DOI:…`, `MAG:…` 형식."""
        return await self.request("GET", "/paper/" + s2_id, params={"fields": fields})

    async def search(self, q: str, offset: int, limit: int,
                     fields: str = PAPER_FIELDS) -> tuple[int, list[dict]]:
        """관련도 검색. S2는 1,000건까지만 준다."""
        d = await self.request("GET", "/paper/search",
                               params={"query": q, "offset": offset, "limit": limit,
                                       "fields": fields}, missing_ok=False)
        return int(d.get("total") or 0), d.get("data") or []

    async def references(self, s2_id: str) -> list[dict]:
        out: list[dict] = []
        offset = 0
        while True:
            d = await self.request("GET", "/paper/%s/references" % s2_id,
                                   params={"fields": LINK_FIELDS, "offset": offset,
                                           "limit": CITATION_PAGE}) or {}
            out.extend(x["citedPaper"] for x in d.get("data") or [] if x.get("citedPaper"))
            if d.get("next") is None:
                return out
            offset = d["next"]

    async def citations(self, s2_id: str, max_pages: int = MAX_CITATION_PAGES,
                        progress=None) -> tuple[list[dict], bool]:
        """(인용한 논문 목록, 쪽 한도에서 멈췄는지)."""
        out: list[dict] = []
        offset = 0
        for page in range(max_pages):
            d = await self.request("GET", "/paper/%s/citations" % s2_id,
                                   params={"fields": LINK_FIELDS, "offset": offset,
                                           "limit": CITATION_PAGE}) or {}
            out.extend(x["citingPaper"] for x in d.get("data") or [] if x.get("citingPaper"))
            if progress:
                progress(page + 1, max_pages)
            if d.get("next") is None:
                return out, False
            offset = d["next"]
        return out, True


def to_work(rec: dict[str, Any]) -> Work:
    """S2 기록 → Work. id는 `s2:<paperId>`, 저자 id는 `s2:<authorId>`."""
    ext = rec.get("externalIds") or {}
    doi = norm_doi(ext.get("DOI"))
    types = rec.get("publicationTypes") or []
    return Work(
        id="s2:" + rec["paperId"],
        doi="https://doi.org/" + doi if doi else None,
        title=(rec.get("title") or "").strip() or "(제목 없음)",
        abstract=(rec.get("abstract") or "").strip() or None,
        year=rec.get("year"),
        venue=rec.get("venue") or None,
        authors=[Author(id="s2:" + a["authorId"] if a.get("authorId") else None, name=a["name"])
                 for a in rec.get("authors") or [] if a.get("name")],
        cited_by_count=rec.get("citationCount"),
        type=types[0].lower() if types else None,
        source="semanticscholar",
    )


async def fetch_abstracts(
    dois: list[str], log=print
) -> dict[str, str]:
    """{원본 DOI 문자열: 초록} 를 돌려준다. 못 찾은 건 빠진다."""
    out: dict[str, str] = {}
    if not dois:
        return out
    async with S2Client(log=log) as s2:
        nbatch = (len(dois) + BATCH_SIZE - 1) // BATCH_SIZE
        for i in range(0, len(dois), BATCH_SIZE):
            chunk = dois[i:i + BATCH_SIZE]
            bno = i // BATCH_SIZE + 1
            try:
                recs = await s2.request("POST", "/paper/batch", params={"fields": "abstract"},
                                        json_body={"ids": [to_s2_id(d) for d in chunk]},
                                        missing_ok=False)
            except RuntimeError as e:
                # 건너뛰면 그 배치가 통째로 날아가지만, 초록 보강은 없어도 지도를 만든다.
                log("  배치 %d: %s — 건너뜀" % (bno, e))
                continue
            for doi, rec in zip(chunk, recs):
                if rec and rec.get("abstract"):
                    out[doi] = rec["abstract"]
            log("  배치 %d/%d — 누적 %s건 확보"
                % (bno, nbatch, format(len(out), ",")))
            if not s2.keyed:
                await asyncio.sleep(PAUSE)
    return out


async def fetch_paper(s2_id: str, fields: str = "title,year,externalIds") -> dict | None:
    """단건 조회(`arXiv:2005.11401` 등). 없으면 None."""
    async with S2Client() as s2:
        return await s2.paper(s2_id, fields)
