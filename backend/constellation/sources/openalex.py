"""OpenAlex 어댑터 — 1차 소스.

인용 목록(referenced_works)이 응답에 함께 오는 것이 이 소스를 고른 이유다.
Scopus는 초록과 인용을 서로 다른 API로 받아야 하고 둘 다 entitlement에 걸린다.
"""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any, AsyncIterator

import httpx

from ..config import Settings
from .base import Author, Topic, Work

BASE = "https://api.openalex.org"

# 필요한 필드만 받는다. 페이로드가 3배 이상 차이난다.
SELECT = ",".join([
    "id", "doi", "title", "publication_year", "type",
    "abstract_inverted_index", "referenced_works", "cited_by_count",
    "primary_topic", "topics", "keywords",
    "authorships", "primary_location",
])

PER_PAGE = 200          # OpenAlex 상한
MAX_RETRIES = 5
RATE_PER_SEC = 8.0      # 정책 상한(100/s)보다 한참 아래로 둔다


def strip_id(url: str | None) -> str | None:
    """https://openalex.org/W123 -> W123"""
    if not url:
        return None
    return url.rstrip("/").rsplit("/", 1)[-1]


def reconstruct_abstract(inv: dict[str, list[int]] | None) -> str | None:
    """OpenAlex는 초록을 역인덱스로 준다. {단어: [위치...]} -> 원문."""
    if not inv:
        return None
    positions = [(p, w) for w, ps in inv.items() for p in ps]
    if not positions:
        return None
    positions.sort()
    text = " ".join(w for _, w in positions).strip()
    return text or None


class _RateLimiter:
    """단순 토큰 버킷. 서버가 429로 알려주기 전에 우리가 먼저 지킨다."""

    def __init__(self, per_sec: float) -> None:
        self._interval = 1.0 / per_sec
        self._next = 0.0
        self._lock = asyncio.Lock()

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            if now < self._next:
                await asyncio.sleep(self._next - now)
                now = time.monotonic()
            self._next = now + self._interval


class OpenAlexSource:
    name = "openalex"

    def __init__(self, settings: Settings, raw_dir: Path | None = None) -> None:
        self.settings = settings
        self.raw_dir = raw_dir
        self._limiter = _RateLimiter(RATE_PER_SEC)
        headers = {
            "User-Agent": "Constellation/0.1 (mailto:%s)" % (settings.openalex_mailto or "unknown"),
            "Accept": "application/json",
        }
        if settings.openalex_api_key:
            # 헤더로 보낸다 — 키가 URL이나 접근 로그에 남지 않는다.
            headers["Authorization"] = "Bearer " + settings.openalex_api_key
        self._client = httpx.AsyncClient(headers=headers, timeout=60.0)
        self._page_no = 0

    def supports_abstracts(self) -> bool:
        return True

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "OpenAlexSource":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    # ── HTTP ────────────────────────────────────────────────

    async def _get(self, params: dict[str, Any]) -> dict[str, Any]:
        delay = 1.0
        for attempt in range(MAX_RETRIES):
            await self._limiter.wait()
            try:
                r = await self._client.get(BASE + "/works", params=params)
            except httpx.TransportError as e:
                if attempt == MAX_RETRIES - 1:
                    raise
                print("    네트워크 오류 (%s), %.0f초 후 재시도" % (type(e).__name__, delay))
                await asyncio.sleep(delay)
                delay *= 2
                continue

            if r.status_code == 200:
                return r.json()
            if r.status_code in (429, 500, 502, 503, 504):
                if attempt == MAX_RETRIES - 1:
                    r.raise_for_status()
                wait = float(r.headers.get("Retry-After") or delay)
                print("    HTTP %d, %.0f초 후 재시도 (%d/%d)"
                      % (r.status_code, wait, attempt + 1, MAX_RETRIES))
                await asyncio.sleep(wait)
                delay *= 2
                continue
            # 그 외 4xx는 즉시 실패 — 재시도해도 같은 결과다
            raise RuntimeError("OpenAlex HTTP %d: %s" % (r.status_code, r.text[:300]))
        raise RuntimeError("재시도 한도 초과")

    def _persist(self, payload: dict[str, Any]) -> str | None:
        """원본 페이지를 그대로 보관한다. 파싱 로직이 바뀌어도 재수집이 없다."""
        if not self.raw_dir:
            return None
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self._page_no += 1
        path = self.raw_dir / ("page-%04d.json" % self._page_no)
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return path.name

    # ── 변환 ────────────────────────────────────────────────

    def to_work(self, r: dict[str, Any], raw_ref: str | None) -> Work:
        oid = strip_id(r.get("id")) or ""

        authors: list[Author] = []
        for a in (r.get("authorships") or []):
            au = a.get("author") or {}
            nm = au.get("display_name")
            if nm:
                authors.append(Author(id=strip_id(au.get("id")), name=nm, orcid=au.get("orcid")))

        topics: list[Topic] = []
        for t in (r.get("topics") or []):
            if t.get("display_name"):
                topics.append(Topic(name=t["display_name"], score=t.get("score"), kind="topic"))
        for k in (r.get("keywords") or []):
            if k.get("display_name"):
                topics.append(Topic(name=k["display_name"], score=k.get("score"), kind="keyword"))

        loc = r.get("primary_location") or {}
        src = loc.get("source") or {}

        refs: list[str] = []
        for u in (r.get("referenced_works") or []):
            s = strip_id(u)
            if s:
                refs.append("openalex:" + s)

        return Work(
            id="openalex:" + oid,
            doi=r.get("doi"),
            title=(r.get("title") or "").strip() or "(제목 없음)",
            abstract=reconstruct_abstract(r.get("abstract_inverted_index")),
            year=r.get("publication_year"),
            venue=src.get("display_name"),
            authors=authors,
            referenced_works=refs,
            topics=topics,
            cited_by_count=r.get("cited_by_count"),
            type=r.get("type"),
            source=self.name,
            raw_ref=raw_ref,
        )

    # ── 공개 API ────────────────────────────────────────────

    async def search(
        self, query: str, limit: int, sort: str | None = None
    ) -> AsyncIterator[Work]:
        """filter 기반 수집.

        검색 엔드포인트는 무료 티어 한도가 1,000회/일로 낮다. 대량 수집은
        반드시 filter 기반이어야 한다.

        sort를 주면 page 방식으로(정렬 순서를 지켜야 하므로), 주지 않으면
        cursor 방식으로 페이지를 넘긴다. page 방식은 1만 건이 상한이지만
        정렬 수집은 연도별 할당량 단위라 그 아래에서 끝난다.
        """
        yielded = 0
        cursor: str | None = None if sort else "*"
        page_no = 1

        # per-page는 페이지네이션 내내 고정해야 한다.
        #
        # OpenAlex는 오프셋을 (page - 1) * per_page 로 계산한다. 마지막
        # 페이지에서 남은 개수만큼 per-page를 줄이면 오프셋이 앞으로 당겨져
        # 이전 페이지와 통째로 겹친다. 예: 750편을 200,200,200,150으로
        # 요청하면 4번째 페이지의 오프셋이 600이 아니라 450이 되어 150편
        # 전부가 중복이 된다. 넘치는 만큼은 아래에서 잘라낸다.
        page_size = PER_PAGE

        while yielded < limit:
            params: dict[str, Any] = {
                "filter": query,
                "select": SELECT,
                "per-page": page_size,
            }
            if sort:
                params["sort"] = sort
                params["page"] = page_no
            else:
                if not cursor:
                    break
                params["cursor"] = cursor

            payload = await self._get(params)
            raw_ref = self._persist(payload)
            results = payload.get("results") or []
            if not results:
                break
            for r in results:
                if yielded >= limit:
                    break
                yield self.to_work(r, raw_ref)
                yielded += 1

            if sort:
                if len(results) < page_size:
                    break
                page_no += 1
            else:
                cursor = (payload.get("meta") or {}).get("next_cursor")

    async def count(self, query: str) -> int:
        payload = await self._get({"filter": query, "per-page": 1, "select": "id"})
        return int((payload.get("meta") or {}).get("count") or 0)

    async def fetch_by_ids(self, ids: list[str]) -> AsyncIterator[Work]:
        """인용 그래프 확장·결손 보강용. OR 필터로 배치 조회한다."""
        bare = [i.split(":", 1)[-1] for i in ids]
        BATCH = 50
        for i in range(0, len(bare), BATCH):
            chunk = bare[i:i + BATCH]
            payload = await self._get({
                "filter": "openalex_id:" + "|".join(chunk),
                "select": SELECT,
                "per-page": len(chunk),
            })
            raw_ref = self._persist(payload)
            for r in (payload.get("results") or []):
                yield self.to_work(r, raw_ref)
