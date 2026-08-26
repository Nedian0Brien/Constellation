"""DuckDB 접근 계층."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

import duckdb
import pyarrow as pa

from ..config import DB_PATH
from ..sources.base import Work

SCHEMA = Path(__file__).with_name("schema.sql")


def connect(path: Path | None = None, read_only: bool = False) -> duckdb.DuckDBPyConnection:
    p = path or DB_PATH
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(p), read_only=read_only)
    if not read_only:
        conn.execute(SCHEMA.read_text(encoding="utf-8"))
    return conn


_STAGE = "_stage_bulk"


def _bulk_insert(
    conn: duckdb.DuckDBPyConnection,
    table: str,
    cols: Sequence[str],
    rows: Sequence[tuple],
) -> None:
    """Arrow 테이블을 등록해 한 번의 SELECT로 밀어 넣는다.

    측정 결과 (인용 29,266행 기준):
        executemany                 매우 느림
        다중 행 VALUES               47.5초  — 플레이스홀더 파싱이 병목
        PK 제거 + plain INSERT       47.5초  — 제약조건은 원인이 아니었다
        Arrow 등록                   아래 경로

    파라미터 바인딩을 통째로 우회하는 것이 유일하게 효과가 있었다.
    """
    if not rows:
        return
    columns = list(zip(*rows))
    tbl = pa.table({c: pa.array(list(v)) for c, v in zip(cols, columns)})
    conn.register(_STAGE, tbl)
    try:
        conn.execute(
            "INSERT OR REPLACE INTO %s (%s) SELECT * FROM %s"
            % (table, ",".join(cols), _STAGE)
        )
    finally:
        conn.unregister(_STAGE)


bulk_insert = _bulk_insert   # 공개 이름


def upsert_works(conn: duckdb.DuckDBPyConnection, works: Sequence[Work]) -> int:
    """works와 딸린 테이블을 한 번에 밀어 넣는다. 이미 있는 id는 교체한다."""
    if not works:
        return 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    _bulk_insert(
        conn, "works",
        ["id", "doi", "title", "abstract", "has_abstract", "year", "venue",
         "cited_by_count", "type", "source", "raw_ref", "collected_at"],
        [(w.id, w.doi, w.title, w.abstract, w.has_abstract, w.year, w.venue,
          w.cited_by_count, w.type, w.source, w.raw_ref, now) for w in works],
    )

    authors: dict[str, tuple[str, str, str | None]] = {}
    links: list[tuple[str, str, int]] = []
    for w in works:
        for i, a in enumerate(w.authors):
            if not a.id:
                continue
            authors[a.id] = (a.id, a.name, a.orcid)
            links.append((w.id, a.id, i))
    _bulk_insert(conn, "authors", ["id", "name", "orcid"], list(authors.values()))
    _bulk_insert(conn, "work_authors", ["work_id", "author_id", "position"], links)

    # 같은 (citing, cited) 쌍이 한 배치에 두 번 오면 DuckDB가 거부한다.
    cites = {(w.id, r) for w in works for r in w.referenced_works}
    _bulk_insert(conn, "citations", ["citing_id", "cited_id"], list(cites))

    topics: dict[tuple[str, str, str], tuple[str, str, float | None, str]] = {}
    for w in works:
        for t in w.topics:
            topics[(w.id, t.name, t.kind)] = (w.id, t.name, t.score, t.kind)
    _bulk_insert(conn, "work_topics", ["work_id", "topic", "score", "kind"],
                 list(topics.values()))

    return len(works)


def record_collection(
    conn: duckdb.DuckDBPyConnection,
    run_id: str,
    query_set: str,
    query_name: str,
    filter_expr: str,
    source: str,
    n_returned: int,
    n_new: int,
    total_matched: int | None,
) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO collections "
        "(run_id, query_set, query_name, filter_expr, source, n_returned, n_new, "
        " total_matched, collected_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (run_id, query_set, query_name, filter_expr, source, n_returned, n_new,
         total_matched, datetime.now(timezone.utc).replace(tzinfo=None)),
    )


def existing_ids(conn: duckdb.DuckDBPyConnection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT id FROM works").fetchall()}


# ── 통계 ────────────────────────────────────────────────────

def stats(conn: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    """M0의 관문. 초록 커버리지와 내부 인용 밀도를 잰다."""
    one = lambda q: conn.execute(q).fetchone()

    n_works, n_abs, y_min, y_max = one(
        "SELECT count(*), count(*) FILTER (WHERE has_abstract), min(year), max(year) FROM works"
    )
    if not n_works:
        return {"n_works": 0}

    n_edges = one("SELECT count(*) FROM citations")[0]
    # 양 끝이 모두 코퍼스 안에 있는 엣지 — Flow/Lineage가 실제로 쓸 수 있는 것
    n_internal = one(
        "SELECT count(*) FROM citations c "
        "JOIN works a ON a.id = c.citing_id JOIN works b ON b.id = c.cited_id"
    )[0]
    n_cited_in = one(
        "SELECT count(DISTINCT c.cited_id) FROM citations c JOIN works b ON b.id = c.cited_id"
    )[0]

    by_year = conn.execute(
        "SELECT year, count(*), count(*) FILTER (WHERE has_abstract) "
        "FROM works WHERE year IS NOT NULL GROUP BY year ORDER BY year"
    ).fetchall()

    top_topics = conn.execute(
        "SELECT topic, count(*) n FROM work_topics WHERE kind = 'topic' "
        "GROUP BY topic ORDER BY n DESC LIMIT 12"
    ).fetchall()

    top_venues = conn.execute(
        "SELECT venue, count(*) n FROM works WHERE venue IS NOT NULL "
        "GROUP BY venue ORDER BY n DESC LIMIT 10"
    ).fetchall()

    no_abs_by_year = conn.execute(
        "SELECT year, count(*) n FROM works WHERE NOT has_abstract AND year IS NOT NULL "
        "GROUP BY year ORDER BY n DESC LIMIT 5"
    ).fetchall()

    return {
        "n_works": n_works,
        "n_abstract": n_abs,
        "abstract_pct": n_abs / n_works * 100,
        "year_min": y_min,
        "year_max": y_max,
        "n_edges": n_edges,
        "n_internal_edges": n_internal,
        "internal_pct": (n_internal / n_edges * 100) if n_edges else 0.0,
        "n_cited_in_corpus": n_cited_in,
        "avg_refs": n_edges / n_works,
        "avg_internal_refs": n_internal / n_works,
        "by_year": by_year,
        "top_topics": top_topics,
        "top_venues": top_venues,
        "no_abs_by_year": no_abs_by_year,
    }
