"""Semantic Scholar — 초록 결손 보강 전용.

전체 소스 어댑터가 아니다. OpenAlex가 못 주는 초록만 메운다.

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
from typing import Iterable

import httpx

BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch"
BATCH_SIZE = 500
PAUSE = 3.0
MAX_RETRIES = 6          # 인증 없이 쓰는 공용 풀이라 넉넉히 둔다

_DOI_PREFIX = re.compile(r"^https?://(dx\.)?doi\.org/", re.I)


def to_s2_id(doi: str) -> str:
    return "DOI:" + _DOI_PREFIX.sub("", doi.strip())


async def fetch_abstracts(
    dois: list[str], log=print
) -> dict[str, str]:
    """{원본 DOI 문자열: 초록} 를 돌려준다. 못 찾은 건 빠진다."""
    out: dict[str, str] = {}
    if not dois:
        return out

    async with httpx.AsyncClient(
        timeout=90.0, headers={"User-Agent": "Constellation/0.1"}
    ) as client:
        nbatch = (len(dois) + BATCH_SIZE - 1) // BATCH_SIZE
        for i in range(0, len(dois), BATCH_SIZE):
            chunk = dois[i:i + BATCH_SIZE]
            bno = i // BATCH_SIZE + 1
            payload = {"ids": [to_s2_id(d) for d in chunk]}
            delay = 5.0
            recs = None

            # 인증 없이 쓰면 공용 풀이라 429가 흔하다. 건너뛰면 그 배치가
            # 통째로 날아가므로 반드시 백오프 후 재시도한다.
            for attempt in range(MAX_RETRIES):
                try:
                    r = await client.post(
                        BATCH_URL, params={"fields": "abstract"}, json=payload
                    )
                except httpx.TransportError as e:
                    log("  배치 %d: 네트워크 오류 (%s), %.0f초 후 재시도"
                        % (bno, type(e).__name__, delay))
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue

                if r.status_code == 200:
                    recs = r.json()
                    break
                if r.status_code in (429, 500, 502, 503, 504):
                    wait = float(r.headers.get("Retry-After") or delay)
                    log("  배치 %d: HTTP %d, %.0f초 대기 (%d/%d)"
                        % (bno, r.status_code, wait, attempt + 1, MAX_RETRIES))
                    await asyncio.sleep(wait)
                    delay = min(delay * 2, 60.0)
                    continue
                log("  배치 %d: HTTP %d — 건너뜀" % (bno, r.status_code))
                break

            if recs is None:
                log("  배치 %d: 재시도 한도 초과 — 건너뜀" % bno)
                continue

            for doi, rec in zip(chunk, recs):
                if rec and rec.get("abstract"):
                    out[doi] = rec["abstract"]

            log("  배치 %d/%d — 누적 %s건 확보"
                % (bno, nbatch, format(len(out), ",")))
            await asyncio.sleep(PAUSE)

    return out
