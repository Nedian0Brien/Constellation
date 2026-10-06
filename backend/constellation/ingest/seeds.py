"""시드 논문에서 넓혀 수집한다.

시드의 참고문헌과 시드를 인용한 논문을 모아 피인용 수 상위 `limit`편을 받는다.
한 단계만 넓힌다. 두 단계부터는 후보가 수십만 편으로 늘어 주제가 흐려진다.

후보를 고르는 동안에는 id와 피인용 수만 받는다. 초록까지 받는 전체 필드는
고른 논문에 대해서만 받는다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..config import RAW, Settings
from ..db import store
from ..sources.openalex import OpenAlexSource, strip_id
from .collect import Count, Progress, _no_count
from .definition import SeedsDef

BATCH = 50   # OR 필터 한 번에 넣는 id 수. fetch_by_ids와 같다.
LIGHT = "id,cited_by_count"


async def resolve_seeds(src: OpenAlexSource, dois: list[str]) -> list[dict[str, Any]]:
    """DOI로 시드를 찾는다. 찾은 행에는 참고문헌 id 목록이 있다."""
    out: list[dict[str, Any]] = []
    for i in range(0, len(dois), BATCH):
        chunk = dois[i:i + BATCH]
        payload = await src._get({
            "filter": "doi:" + "|".join(chunk),
            "select": "id,doi,display_name,referenced_works,cited_by_count",
            "per-page": len(chunk),
        })
        out.extend(payload.get("results") or [])
    return out


async def candidates(
    src: OpenAlexSource, seeds: list[dict[str, Any]], limit: int,
    types: tuple[str, ...],
) -> dict[str, int]:
    """후보 id → 피인용 수. 시드 자신은 빠진다."""
    seed_ids = {strip_id(s["id"]) for s in seeds}
    refs: set[str] = set()
    for s in seeds:
        refs.update(filter(None, (strip_id(u) for u in s.get("referenced_works") or [])))
    refs -= seed_ids

    cited: dict[str, int] = {}
    ref_list = sorted(refs)
    for i in range(0, len(ref_list), BATCH):
        chunk = ref_list[i:i + BATCH]
        payload = await src._get({"filter": "openalex_id:" + "|".join(chunk),
                                  "select": LIGHT, "per-page": len(chunk)})
        for r in payload.get("results") or []:
            cited[strip_id(r["id"])] = r.get("cited_by_count") or 0

    for sid in sorted(seed_ids):
        filt = "cites:%s,type:%s" % (sid, "|".join(types))
        async for r in src.rows(filt, limit, "cited_by_count:desc", LIGHT):
            wid = strip_id(r["id"])
            if wid not in seed_ids:
                cited[wid] = r.get("cited_by_count") or 0
    return cited


def pick(cands: dict[str, int], limit: int) -> list[str]:
    """피인용 수 상위 limit편. 같으면 id 순으로 고정한다."""
    return [w for w, _ in sorted(cands.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]]


async def collect_seeds(
    defn: SeedsDef,
    settings: Settings,
    *,
    corpus: str,
    log: Progress = print,
    progress: Count = _no_count,
) -> dict[str, int]:
    from .definition import DEFAULT_TYPES

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    raw_dir = RAW / "openalex" / corpus / run_id
    conn = store.connect()
    try:
        seen_before = store.existing_ids(conn)
        async with OpenAlexSource(settings, raw_dir=raw_dir) as src:
            seeds = await resolve_seeds(src, list(defn.dois))
            found = {(s.get("doi") or "").lower().removeprefix("https://doi.org/")
                     for s in seeds}
            for d in defn.dois:
                if d not in found:
                    log("  DOI를 찾지 못했다: %s" % d)
            if not seeds:
                raise RuntimeError("시드 DOI를 하나도 찾지 못했습니다.")
            for s in seeds:
                log("  시드 %s — %s" % (strip_id(s["id"]), s.get("display_name")))

            cands = await candidates(src, seeds, defn.limit, DEFAULT_TYPES)
            chosen = pick(cands, defn.limit)
            ids = [strip_id(s["id"]) for s in seeds] + chosen
            log("후보 %s편 중 %s편과 시드 %d편을 받는다"
                % (format(len(cands), ","), format(len(chosen), ","), len(seeds)))

            works = []
            async for w in src.fetch_by_ids(["openalex:" + i for i in ids]):
                works.append(w)
                if len(works) % 50 == 0:
                    progress(len(works), len(ids))
            progress(len(works), len(ids))

        n_new = sum(1 for w in works if w.id not in seen_before)
        store.upsert_works(conn, works)
        store.add_members(conn, corpus, (w.id for w in works), "collect")
        store.record_collection(
            conn, run_id, corpus, corpus, "seeds",
            "seeds:" + "|".join(defn.dois), "openalex", len(works), n_new,
            len(cands) + len(seeds))
        conn.commit()
        n_abs = sum(1 for w in works if w.has_abstract)
        log("수집 완료: %s편 (신규 %s, 초록 %s)"
            % (format(len(works), ","), format(n_new, ","), format(n_abs, ",")))
        return {"total": len(works), "new": n_new, "run_id": run_id}
    finally:
        conn.close()
