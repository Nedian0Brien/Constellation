"""arXiv API — arXiv 논문의 초록.

S2 기록에 초록이 없을 때(출판사 라이선스) arXiv 논문만 여기서 보충한다.
이용 약관: 3초에 한 번, 연결 하나(2026-10-07 info.arxiv.org/help/api/tou.html).
메타데이터는 CC0로 저장·변형할 수 있다.
"""
from __future__ import annotations

import asyncio
import time
import xml.etree.ElementTree as ET

import httpx

API = "https://export.arxiv.org/api/query"
INTERVAL = 3.0
_ATOM = "{http://www.w3.org/2005/Atom}"
_lock = asyncio.Lock()
_last = 0.0


def parse_abstract(xml: str) -> str | None:
    entry = ET.fromstring(xml).find(_ATOM + "entry")
    if entry is None:
        return None
    summary = entry.findtext(_ATOM + "summary")
    text = " ".join((summary or "").split())
    return text or None


async def abstract(arxiv_id: str, *, transport: httpx.AsyncBaseTransport | None = None,
                   sleep=asyncio.sleep) -> str | None:
    """arXiv ID의 초록. 없거나 실패하면 None."""
    global _last
    async with _lock:
        wait = _last + INTERVAL - time.monotonic()
        if wait > 0:
            await sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=30.0, transport=transport,
                                         follow_redirects=True) as client:
                r = await client.get(API, params={"id_list": arxiv_id})
        except httpx.TransportError:
            return None
        finally:
            _last = time.monotonic()
    if r.status_code != 200:
        return None
    return parse_abstract(r.text)
