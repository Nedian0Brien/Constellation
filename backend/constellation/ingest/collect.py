"""수집 오케스트레이션.

연도별로 나눠 돌면서 중복을 제거하고 DuckDB에 넣는다. 원본 페이지는
source 어댑터가 data/raw/ 아래에 그대로 보관한다.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from ..config import RAW, Settings
from ..db import store
from ..queries import QuerySet
from ..sources.base import Topic, Work, dedupe_key
from ..sources.openalex import OpenAlexSource

Progress = Callable[[str], None]


def tag_facets(w: Work, facets: dict[str, list[str]]) -> None:
    """제목+초록에 어떤 갈래의 용어가 나타나는지 표시한다.

    OpenAlex의 topics가 너무 성기어서(대부분 'Topic Modeling' 같은 상위 분류)
    분야 내부 구분에는 쓸 수 없다. 이건 M2의 c-TF-IDF 라벨링 전까지
    Facets 패널을 채우는 임시 수단이다.
    """
    if not facets:
        return
    hay = (w.title + " " + (w.abstract or "")).lower()
    for name, terms in facets.items():
        if any(t.lower() in hay for t in terms):
            w.topics.append(Topic(name=name, score=None, kind="facet"))


async def collect(
    qs: QuerySet,
    settings: Settings,
    *,
    limit: int | None = None,
    log: Progress = print,
) -> dict[str, int]:
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    raw_dir = RAW / "openalex" / qs.name / run_id
    conn = store.connect()

    try:
        seen_before = store.existing_ids(conn)
        seen: set[str] = set()
        dedupe: set[str] = set()
        total_new = 0
        total_seen = 0
        budget = limit if limit is not None else qs.target

        log("수집 세트: %s — %s" % (qs.name, qs.description))
        log("연도 %d–%d, 연도당 %d편, 목표 %s편"
            % (qs.year_from, qs.year_to, qs.per_year, format(budget, ",")))
        log("원본 보관: %s" % raw_dir)
        log("")

        async with OpenAlexSource(settings, raw_dir=raw_dir) as src:
            for year in qs.years:
                if total_seen >= budget:
                    break
                filt = qs.filter_for_year(year)
                quota = min(qs.per_year, budget - total_seen)

                matched = await src.count(filt)
                batch: list[Work] = []
                async for w in src.search(filt, quota, sort="cited_by_count:desc"):
                    total_seen += 1
                    key = dedupe_key(w)
                    if w.id in seen or key in dedupe:
                        continue
                    seen.add(w.id)
                    dedupe.add(key)
                    tag_facets(w, qs.facets)
                    batch.append(w)

                n_new = sum(1 for w in batch if w.id not in seen_before)
                store.upsert_works(conn, batch)
                store.record_collection(
                    conn, run_id, qs.name, str(year), filt, "openalex",
                    len(batch), n_new, matched,
                )
                total_new += n_new
                n_abs = sum(1 for w in batch if w.has_abstract)
                log("  %d  매칭 %8s  수집 %4d  신규 %4d  초록 %3d (%.0f%%)"
                    % (year, format(matched, ","), len(batch), n_new, n_abs,
                       (n_abs / len(batch) * 100) if batch else 0))

        conn.commit()
        return {"total": len(seen), "new": total_new, "run_id": run_id}
    finally:
        conn.close()


async def backfill_citations(
    settings: Settings, *, max_fetch: int = 2000, log: Progress = print
) -> dict[str, int]:
    """코퍼스 안 논문들이 자주 인용하는 바깥 논문을 끌어온다.

    Flow와 Lineage는 양 끝이 모두 코퍼스 안에 있는 엣지만 쓸 수 있다.
    자주 인용되는 바깥 논문(= 이 분야의 뿌리)을 채우면 내부 엣지 밀도가
    크게 오른다.
    """
    conn = store.connect()
    try:
        rows = conn.execute(
            "SELECT c.cited_id, count(*) n FROM citations c "
            "LEFT JOIN works w ON w.id = c.cited_id "
            "WHERE w.id IS NULL GROUP BY c.cited_id "
            "HAVING n >= 2 ORDER BY n DESC LIMIT ?",
            (max_fetch,),
        ).fetchall()
        if not rows:
            log("보강할 대상이 없다.")
            return {"fetched": 0}

        ids = [r[0] for r in rows]
        log("코퍼스 밖에서 2회 이상 인용된 논문 %s편을 끌어온다 "
            "(최다 %d회)" % (format(len(ids), ","), rows[0][1]))

        run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        raw_dir = RAW / "openalex" / "backfill" / run_id
        fetched: list[Work] = []
        async with OpenAlexSource(settings, raw_dir=raw_dir) as src:
            async for w in src.fetch_by_ids(ids):
                fetched.append(w)
                if len(fetched) % 500 == 0:
                    log("  %s편..." % format(len(fetched), ","))

        store.upsert_works(conn, fetched)
        conn.commit()
        n_abs = sum(1 for w in fetched if w.has_abstract)
        log("보강 완료: %s편 (초록 %s편, %.0f%%)"
            % (format(len(fetched), ","), format(n_abs, ","),
               (n_abs / len(fetched) * 100) if fetched else 0))
        return {"fetched": len(fetched)}
    finally:
        conn.close()


async def enrich_abstracts(*, log: Progress = print) -> dict[str, int]:
    """초록이 없는 논문을 Semantic Scholar로 메운다.

    결손의 대부분은 Elsevier·Springer 저널이고, 그건 구조적으로 Scopus의
    영역이다. 여기서 메워지는 건 그중 일부다 — 실측 31%.
    """
    from ..sources import semanticscholar as s2

    conn = store.connect()
    try:
        rows = conn.execute(
            "SELECT id, doi FROM works WHERE NOT has_abstract AND doi IS NOT NULL"
        ).fetchall()
        if not rows:
            log("보강할 대상이 없다.")
            return {"filled": 0}

        log("초록 결손 %s편 (DOI 보유분)을 Semantic Scholar에 물어본다"
            % format(len(rows), ","))
        by_doi = {doi: wid for wid, doi in rows}
        found = await s2.fetch_abstracts([doi for _, doi in rows], log=log)

        updates = [(text, by_doi[doi]) for doi, text in found.items() if doi in by_doi]
        for text, wid in updates:
            conn.execute(
                "UPDATE works SET abstract = ?, has_abstract = TRUE WHERE id = ?",
                (text, wid),
            )
        conn.commit()

        log("보강 완료: %s편 (%.0f%% 적중)"
            % (format(len(updates), ","),
               len(updates) / len(rows) * 100 if rows else 0))
        return {"filled": len(updates), "attempted": len(rows)}
    finally:
        conn.close()
