"""지도 정의 하나로 수집부터 인용 계보까지 차례로 실행한다.

앱의 작업 실행기(`crates/constellation-jobs`)가 `constellation build --events`로
부른다. 진행 상황은 `emit`으로 한 줄에 JSON 하나씩 나간다.

  {"event":"stage","stage":"embed","index":4,"count":10}
  {"event":"progress","stage":"embed","done":512,"total":1500}
  {"event":"log","stage":"embed","message":"..."}
  {"event":"corpus","corpus_id":"..."}
  {"event":"done","corpus_id":"...","map_id":"...","naming":"llm"|"ctfidf"}
  {"event":"error","stage":"...","message":"..."}

코퍼스는 `building`으로 만들고 모든 단계가 끝나야 `ready`가 된다. 실패하면
`building`인 채로 남고, 앱의 지도 목록에 나오지 않는다. 지우는 일은 실행기가
`corpus drop --only-building`으로 한다.
"""
from __future__ import annotations

import asyncio
import shutil
from datetime import datetime, timezone
from typing import Any, Callable

from .config import Settings
from .db import store
from .db.scope import corpus_work_ids, resolve_map
from .ingest.definition import Definition, SeedsDef, corpus_id
from .sources.openalex import strip_id

Emit = Callable[[dict[str, Any]], None]

STAGES = ("collect", "backfill", "enrich", "embed", "project", "cluster",
          "hierarchy", "name", "flow", "lineage")
BACKFILL_MAX = 2000
NAMING_BACKENDS = ("codex", "claude")


class StageError(RuntimeError):
    def __init__(self, stage: str, cause: BaseException) -> None:
        super().__init__(str(cause))
        self.stage = stage
        self.cause = cause


def create_corpus(defn: Definition) -> str:
    """정의로 `building` 코퍼스를 만들고 id를 돌려준다."""
    conn = store.connect()
    try:
        taken = {r[0] for r in conn.execute("SELECT id FROM corpora").fetchall()}
        now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        cid = corpus_id(defn.name, taken, now)
        store.ensure_corpus(conn, cid, defn.name, defn.to_json(), status="building")
        conn.commit()
        return cid
    finally:
        conn.close()


def _flow_start(defn: Definition, cid: str) -> int:
    """갈래 흐름의 시작 연도. 시드 지도는 코퍼스 출판 연도의 5백분위수."""
    if not isinstance(defn, SeedsDef):
        return defn.year_from
    conn = store.connect(read_only=True)
    try:
        row = conn.execute(
            "SELECT quantile_disc(w.year, 0.05) FROM works w "
            "JOIN corpus_works m ON m.work_id = w.id AND m.corpus_id = ? "
            "WHERE w.year IS NOT NULL", (cid,)).fetchone()
    finally:
        conn.close()
    return int(row[0]) if row and row[0] is not None else 2014


def build(defn: Definition, emit: Emit, settings: Settings | None = None) -> dict[str, Any]:
    """정의로 지도를 만든다. 실패하면 StageError를 던진다."""
    from .analyze import cluster as cluster_mod
    from .analyze import flow as flow_mod
    from .analyze import hierarchy as hierarchy_mod
    from .analyze import lineage as lineage_mod
    from .analyze import naming as naming_mod
    from .analyze.project import project as run_project
    from .embed.run import embed_corpus
    from .ingest import collect as collect_mod
    from .ingest.seeds import collect_seeds

    settings = settings or Settings.load()
    if not settings.openalex_api_key:
        raise StageError("collect", RuntimeError(
            "OPENALEX_API_KEY가 없습니다. 저장소의 .env에 넣으세요."))
    cid = create_corpus(defn)
    emit({"event": "corpus", "corpus_id": cid})
    state: dict[str, Any] = {"map": None, "naming": "llm"}

    def stage(name: str, fn: Callable[[Callable[[str], None], Callable[[int, int], None]], Any]) -> Any:
        emit({"event": "stage", "stage": name, "index": STAGES.index(name),
              "count": len(STAGES)})

        def log(msg: str) -> None:
            if msg.strip():
                emit({"event": "log", "stage": name, "message": msg})

        def progress(done: int, total: int) -> None:
            emit({"event": "progress", "stage": name, "done": done, "total": total})

        try:
            return fn(log, progress)
        except Exception as e:  # noqa: BLE001 — 단계 이름을 붙여 다시 던진다
            raise StageError(name, e) from e

    def collect(log, progress):
        if isinstance(defn, SeedsDef):
            return asyncio.run(collect_seeds(defn, settings, corpus=cid, log=log,
                                             progress=progress))
        return asyncio.run(collect_mod.collect(defn, settings, corpus=cid, log=log,
                                               progress=progress))

    def project(log, progress):
        run_project(defn.model, cid, log=log)
        conn = store.connect(read_only=True)
        try:
            state["map"] = resolve_map(conn, None, cid, defn.model)
        finally:
            conn.close()

    def name(log, progress):
        # codex를 먼저, 없거나 실패하면 claude. 둘 다 안 되면 c-TF-IDF 라벨로 완성한다.
        reasons = []
        for backend in NAMING_BACKENDS:
            if shutil.which(backend) is None:
                reasons.append("%s CLI 없음" % backend)
                continue
            try:
                log("이름 짓기: %s CLI" % backend)
                naming_mod.run(run_id=state["map"], model_key=defn.model,
                               backend=backend, log=log)
                return
            except Exception as e:  # noqa: BLE001 — 다음 백엔드로 넘어간다
                reasons.append("%s: %s" % (backend, str(e).splitlines()[0][:200]))
        state["naming"] = "ctfidf"
        log("이름 짓기를 건너뛴다 — c-TF-IDF 라벨을 그대로 쓴다. (%s)" % "; ".join(reasons))

    stage("collect", collect)
    stage("backfill", lambda log, progress: asyncio.run(collect_mod.backfill_citations(
        settings, cid, max_fetch=BACKFILL_MAX, log=log, progress=progress)))
    stage("enrich", lambda log, progress: asyncio.run(
        collect_mod.enrich_abstracts(cid, log=log)))
    stage("embed", lambda log, progress: embed_corpus(
        defn.model, log=log, progress=progress, work_ids=_members(cid)))
    stage("project", project)
    stage("cluster", lambda log, progress: cluster_mod.cluster(
        defn.model, run_id=state["map"], log=log))
    stage("hierarchy", lambda log, progress: hierarchy_mod.build(
        defn.model, run_id=state["map"], log=log))
    stage("name", name)
    stage("flow", lambda log, progress: flow_mod.build(
        defn.model, run_id=state["map"], year_min=_flow_start(defn, cid), log=log))
    stage("lineage", lambda log, progress: lineage_mod.build(
        run_id=state["map"], model_key=defn.model, log=log))

    conn = store.connect()
    try:
        store.set_corpus_status(conn, cid, "ready")
        conn.commit()
    finally:
        conn.close()
    result = {"corpus_id": cid, "map_id": state["map"], "naming": state["naming"]}
    emit({"event": "done", **result})
    return result


def _members(cid: str) -> list[str]:
    conn = store.connect(read_only=True)
    try:
        return corpus_work_ids(conn, cid)
    finally:
        conn.close()


async def estimate(defn: Definition, settings: Settings) -> dict[str, Any]:
    """수집 전에 예상 편수를 센다. 수집과 같은 필터를 쓴다."""
    from .sources.openalex import PER_PAGE, OpenAlexSource
    from .ingest.seeds import resolve_seeds

    async with OpenAlexSource(settings) as src:
        if isinstance(defn, SeedsDef):
            seeds = await resolve_seeds(src, list(defn.dois))
            refs = sum(len(s.get("referenced_works") or []) for s in seeds)
            cites = sum(s.get("cited_by_count") or 0 for s in seeds)
            expected = min(defn.limit, refs + cites) + len(seeds)
            out: dict[str, Any] = {
                "expected": expected, "seeds_found": len(seeds),
                "seeds_missing": len(defn.dois) - len(seeds),
                "api_calls": len(seeds) * (1 + defn.limit // PER_PAGE)
                + (refs // 50) + (expected // 50) + 1,
            }
        else:
            per_year = {}
            for y in defn.years:
                per_year[y] = min(await src.count(defn.filter_for_year(y)), defn.per_year)
            expected = sum(per_year.values())
            out = {"expected": expected, "per_year": per_year,
                   "api_calls": len(per_year) + sum(-(-n // PER_PAGE) for n in per_year.values())}
    if expected < 1000:
        out["warning"] = "예상 편수가 1,000편 미만입니다. 주제 영역이 적게 나뉘거나 계층 트리를 만들지 못할 수 있습니다."
    return out


async def search_topics(settings: Settings, q: str, limit: int = 8) -> list[dict[str, Any]]:
    """토픽·서브필드·필드를 이름으로 찾는다."""
    from .sources.openalex import OpenAlexSource, strip_id

    out: list[dict[str, Any]] = []
    async with OpenAlexSource(settings) as src:
        for kind, level in (("fields", "field"), ("subfields", "subfield"), ("topics", "topic")):
            for r in await src.entities(kind, q, limit):
                rid = strip_id(r.get("id"))
                path = [x.get("display_name") for x in
                        (r.get("domain"), r.get("field"), r.get("subfield")) if x]
                out.append({
                    "id": rid if level == "topic" else "%s/%s" % (kind, rid),
                    "name": r.get("display_name"),
                    "level": level,
                    "path": path,
                    "works_count": r.get("works_count"),
                })
    return out


# ── 지도에 논문 추가·빼기 ─────────────────────────────────────

ADD_STAGES = ("resolve", "fetch", "enrich", "embed", "place")
MAX_ADD = 200
RECOMPUTE_RATIO = 0.10   # 기획 5.3절의 제안값. 공식 기준은 없다.


def _stage_runner(emit: Emit, stages: tuple[str, ...]):
    """단계 이벤트·로그·진행률을 붙여 함수를 실행한다. 실패는 StageError로."""
    def stage(name: str, fn):
        emit({"event": "stage", "stage": name, "index": stages.index(name),
              "count": len(stages)})

        def log(msg: str) -> None:
            if msg.strip():
                emit({"event": "log", "stage": name, "message": msg})

        def progress(done: int, total: int) -> None:
            emit({"event": "progress", "stage": name, "done": done, "total": total})

        try:
            return fn(log, progress)
        except Exception as e:  # noqa: BLE001
            raise StageError(name, e) from e
    return stage


def check_papers(run_id: str, ids: Any) -> list[str]:
    """추가·빼기 입력과 지도를 검사한다. 잘못되면 ValueError."""
    from .analyze.place import map_info
    if not isinstance(ids, list) or not all(isinstance(i, str) and i.strip() for i in ids):
        raise ValueError("ids 값은 문자열 목록이어야 합니다.")
    ids = list(dict.fromkeys(i.strip() for i in ids))
    if not 1 <= len(ids) <= MAX_ADD:
        raise ValueError("ids는 1–%d개여야 합니다." % MAX_ADD)
    conn = store.connect(read_only=True)
    try:
        map_info(conn, run_id)
    finally:
        conn.close()
    return ids


def add_papers(run_id: str, ids: list[str], emit: Emit,
               settings: Settings | None = None, s2_fetch=None,
               s2_client=None) -> dict[str, Any]:
    """식별자·검색 결과 id를 지도에 추가한다. 실패하면 StageError.

    OpenAlex 기록이 있으면 그것을, 없으면 Semantic Scholar 기록(`s2:<paperId>`)을 쓴다.
    S2 논문의 참고문헌·피인용은 S2 목록으로 DB 논문과 맞춰 잇는다.
    """
    from .analyze import place as place_mod
    from .embed.run import embed_corpus
    from .ingest import collect as collect_mod
    from .ingest.identify import lookup
    from .ingest.match import keys_of, match_works
    from .sources import arxiv
    from .sources.openalex import OpenAlexSource
    from .sources.semanticscholar import S2Client, to_work

    settings = settings or Settings.load()
    stage = _stage_runner(emit, ADD_STAGES)
    conn = store.connect(read_only=True)
    try:
        info = place_mod.map_info(conn, run_id)
        in_map = {r[0] for r in conn.execute(
            "SELECT work_id FROM projections WHERE run_id = ?", (run_id,)).fetchall()}
        have = store.existing_ids(conn)
    finally:
        conn.close()
    model = info["model"]
    found: dict[str, tuple[str, dict[str, Any]]] = {}   # 입력 → (id, 기록)
    not_found: list[str] = []
    skipped: list[dict[str, str]] = []
    warnings: list[str] = []
    early_skip: list[dict[str, str]] = []

    def resolve(log, progress):
        async def go():
            async with OpenAlexSource(settings) as src:
                for n, raw in enumerate(ids):
                    # 지도에 이미 있는 id(openalex:… · s2:…)는 외부 조회 없이 건너뛴다.
                    if raw in in_map:
                        early_skip.append({"id": raw, "reason": "이미 지도에 있다"})
                        progress(n + 1, len(ids))
                        continue
                    q = raw.removeprefix("openalex:") if raw.startswith("openalex:") else raw
                    try:
                        kind, rec, source = await lookup(src, q, s2_fetch, log)
                    except RuntimeError as e:
                        # 한 편을 못 찾았다고 작업 전체를 멈추지 않는다(S2 공용 한도 429 등).
                        log("  조회 실패: %s (%s)" % (raw, str(e)[:160]))
                        kind, rec, source = "error", None, None
                    if kind == "search":
                        log("  식별자가 아니다: %s" % raw)
                    if not rec:
                        not_found.append(raw)
                        log("  찾지 못했다: %s" % raw)
                    else:
                        wid = ("openalex:" + strip_id(rec["id"]) if source == "openalex"
                               else "s2:" + rec["paperId"])
                        found[raw] = (wid, rec)
                        log("  %s → %s %s" % (raw, wid, (rec.get("title") or "")[:60]))
                    progress(n + 1, len(ids))
        if not settings.openalex_api_key:
            raise RuntimeError("OPENALEX_API_KEY가 없습니다. 저장소의 .env에 넣으세요.")
        asyncio.run(go())

    stage("resolve", resolve)
    # 같은 논문이 다른 출처의 id로 이미 지도에 있을 수 있다(DOI·제목+연도로 판정).
    c = store.connect(read_only=True)
    try:
        same = match_works(c, [keys_of(rec) for _, rec in found.values()], run_id)
    finally:
        c.close()
    targets: list[str] = []
    records: dict[str, dict[str, Any]] = {}
    skipped.extend(early_skip)
    for (wid, rec), twin in zip(found.values(), same):
        if wid in in_map:
            skipped.append({"id": wid, "reason": "이미 지도에 있다"})
        elif twin:
            skipped.append({"id": wid, "reason": "이미 지도에 있다 (%s)" % twin})
        elif wid not in targets:
            targets.append(wid)
            records[wid] = rec

    def fetch(log, progress):
        missing = [w for w in targets if w.startswith("openalex:") and w not in have]
        from_s2 = [w for w in targets if w.startswith("s2:")]

        async def go():
            works, cited_by = [], []
            if missing:
                async with OpenAlexSource(settings) as src:
                    async for w in src.fetch_by_ids(missing):
                        works.append(w)
            if from_s2:
                client = s2_client or S2Client(log=log)
                async with client as s2:
                    for wid in from_s2:
                        works_, rows = await s2_paper(s2, records[wid], log, progress)
                        works.append(works_)
                        cited_by.extend(rows)
            return works, cited_by

        async def s2_paper(s2, rec, log, progress):
            """S2 기록 → Work(참고문헌 포함)와 피인용 행(지도 안 논문 → 이 논문)."""
            pid = rec["paperId"]
            if "abstract" not in rec or "authors" not in rec:
                rec = await s2.paper(pid) or rec
            work = to_work(rec)
            arxiv_id = (rec.get("externalIds") or {}).get("ArXiv")
            if not work.abstract and arxiv_id:
                work.abstract = await arxiv.abstract(arxiv_id)
                log("  초록을 arXiv에서 받았다" if work.abstract else "  초록이 없다(제목만 쓴다)")
            # 인용 목록을 못 받아도(S2 공용 한도 429 등) 논문은 추가한다. 결과에 남긴다.
            try:
                refs = await s2.references(pid)
            except RuntimeError as e:
                refs = []
                warnings.append("%s: 참고문헌을 받지 못했다 (%s)" % (work.id, str(e)[:120]))
            try:
                citing, truncated = await s2.citations(pid, progress=progress)
            except RuntimeError as e:
                citing, truncated = [], False
                warnings.append("%s: 피인용을 받지 못했다 (%s)" % (work.id, str(e)[:120]))
            for w in warnings:
                log("  " + w)
            if truncated:
                log("  피인용이 많아 앞의 %s건만 맞춘다" % format(len(citing), ","))
            c = store.connect(read_only=True)
            try:
                ref_ids = match_works(c, [keys_of(r) for r in refs])
                cit_ids = match_works(c, [keys_of(r) for r in citing], run_id)
            finally:
                c.close()
            work.referenced_works = [m or "s2:" + r["paperId"]
                                     for r, m in zip(refs, ref_ids) if m or r.get("paperId")]
            rows = sorted({(m, work.id) for m in cit_ids if m})
            log("  %s — 참고문헌 %d편(DB에서 찾은 것 %d), 피인용 %d편 중 지도 안 %d편"
                % (work.title[:50], len(refs), sum(1 for m in ref_ids if m),
                   len(citing), len(rows)))
            return work, rows

        works, cited_by = asyncio.run(go())
        c = store.connect()
        try:
            store.upsert_works(c, works)
            store.bulk_insert(c, "citations", ["citing_id", "cited_id"], cited_by)
            c.commit()
        finally:
            c.close()
        log("%d편을 받았다" % len(works))

    if targets:
        stage("fetch", fetch)
        stage("enrich", lambda log, progress: asyncio.run(
            collect_mod.enrich_abstracts(work_ids=targets, log=log)))
        stage("embed", lambda log, progress: embed_corpus(
            model, log=log, progress=progress, work_ids=targets))
        placed = stage("place", lambda log, progress: place_mod.place(run_id, targets, log=log))
    else:
        placed = []
    n_added, n_collected = place_mod.added_ratio(run_id)
    result = {
        "map_id": run_id,
        "added": [{**{k: r[k] for k in ("id", "title", "cluster", "label", "title_only",
                                         "similarity")},
                   "source": "s2" if r["id"].startswith("s2:") else "openalex"}
                  for r in placed],
        "skipped": skipped,
        "not_found": not_found,
        "warnings": warnings,
        "recompute_suggested": n_collected > 0 and n_added > n_collected * RECOMPUTE_RATIO,
    }
    emit({"event": "done", "map_id": run_id, "result": result})
    return result


def remove_papers(run_id: str, ids: list[str], emit: Emit) -> dict[str, Any]:
    from .analyze import place as place_mod
    stage = _stage_runner(emit, ("remove",))
    removed = stage("remove", lambda log, progress: place_mod.remove(run_id, ids, log=log))
    result = {"map_id": run_id, "removed": removed}
    emit({"event": "done", "map_id": run_id, "result": result})
    return result


async def search_papers(settings: Settings, q: str, page: int = 1,
                        source: str = "openalex") -> dict[str, Any]:
    from .ingest.identify import search
    from .sources.openalex import OpenAlexSource
    async with OpenAlexSource(settings) as src:
        return await search(src, q, page, source=source)
