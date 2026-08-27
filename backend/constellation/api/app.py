"""FastAPI — 지도 데이터를 브라우저에 넘긴다."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from ..config import DB_PATH
from ..db import store
from ..embed.encoder import DEFAULT_MODEL

app = FastAPI(title="Constellation", version="0.1.0")

# 개발 중엔 Vite(5173)가 별도 포트에서 뜬다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _conn():
    """읽기 전용 연결.

    DuckDB는 프로세스 간에 '쓰기 1개 또는 읽기 N개'만 허용한다. collect나
    name 같은 쓰기 명령이 도는 동안 여기서 예외가 올라오면 서버가 통째로
    죽는다(실제로 죽었다). 503으로 바꿔서 서버는 살려둔다.
    """
    if not DB_PATH.exists():
        raise HTTPException(503, "DB가 없다. constellation collect 를 먼저 돌려라.")
    try:
        return store.connect(read_only=True)
    except Exception as e:
        raise HTTPException(
            503,
            "DB가 잠겨 있다 — 쓰기 명령(collect / cluster / name 등)이 도는 중일 수 "
            "있다. 끝난 뒤 새로고침하라. (%s)" % type(e).__name__,
        )


@app.get("/api/runs")
def runs() -> list[dict[str, Any]]:
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT run_id, kind, model, params_json, n_items, created_at "
            "FROM runs WHERE kind = 'project' "
            "ORDER BY (model = '" + DEFAULT_MODEL + "') DESC, created_at DESC"
        ).fetchall()
    finally:
        conn.close()
    return [
        {"run_id": r[0], "kind": r[1], "model": r[2], "params": r[3],
         "n_items": r[4], "created_at": str(r[5])}
        for r in rows
    ]


@app.get("/api/map")
def get_map(run: str | None = Query(None)) -> dict[str, Any]:
    """좌표와 메타데이터를 열 단위 배열로 보낸다.

    객체 배열(`[{id, x, y}, ...]`)로 보내면 키 이름이 1만 번 반복된다.
    열 단위면 크기가 크게 줄고, deck.gl이 그대로 typed array로 받는다.
    """
    conn = _conn()
    try:
        if not run:
            # 그냥 '가장 최근'을 고르면 마지막으로 실험한 모델이 기본이 된다.
            # 확정된 기본 모델의 최신 run을 우선하고, 없을 때만 최근으로 떨어진다.
            row = conn.execute(
                "SELECT run_id FROM runs WHERE kind = 'project' AND model = ? "
                "ORDER BY created_at DESC LIMIT 1", (DEFAULT_MODEL,)
            ).fetchone() or conn.execute(
                "SELECT run_id FROM runs WHERE kind = 'project' "
                "ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
            if not row:
                raise HTTPException(404, "투영 결과가 없다. constellation project 를 돌려라.")
            run = row[0]

        rows = conn.execute(
            "SELECT p.work_id, p.x, p.y, p.z, w.year, w.cited_by_count, "
            "       w.has_abstract, w.title, coalesce(c.cluster_id, -1) "
            "FROM projections p JOIN works w ON w.id = p.work_id "
            "LEFT JOIN clusters c ON c.run_id = p.run_id AND c.work_id = p.work_id "
            "WHERE p.run_id = ? ORDER BY p.work_id",
            (run,),
        ).fetchall()
        if not rows:
            raise HTTPException(404, "run '%s' 에 좌표가 없다" % run)
    finally:
        conn.close()

    return {
        "run_id": run,
        "n": len(rows),
        "id": [r[0] for r in rows],
        "x": [r[1] for r in rows],
        "y": [r[2] for r in rows],
        "z": [r[3] for r in rows],
        "year": [r[4] for r in rows],
        "cited": [r[5] or 0 for r in rows],
        "has_abstract": [bool(r[6]) for r in rows],
        "title": [r[7] for r in rows],
        "cluster": [r[8] for r in rows],
    }


@app.get("/api/clusters")
def clusters(run: str = Query(...)) -> list[dict[str, Any]]:
    """지도에 라벨을 얹기 위한 클러스터 목록."""
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT m.cluster_id, m.label, m.keywords, m.size, m.x, m.y, "
            "       m.year_median, m.top_work_id, w.title "
            "FROM cluster_meta m LEFT JOIN works w ON w.id = m.top_work_id "
            "WHERE m.run_id = ? ORDER BY m.size DESC", (run,)
        ).fetchall()
    finally:
        conn.close()
    return [
        {"cluster_id": r[0], "label": r[1],
         "keywords": (r[2] or "").split(", ") if r[2] else [],
         "size": r[3], "x": r[4], "y": r[5], "year_median": r[6],
         "top_work_id": r[7], "top_work_title": r[8]}
        for r in rows
    ]


@app.get("/api/tree")
def tree(run: str = Query(...)) -> dict[str, Any]:
    """클러스터 계층 트리 전체.

    덴드로그램 배치(잎 순서·병합 높이)에 필요한 것을 모두 담아 한 번에 준다.
    89개 노드라 쪼개 보낼 이유가 없다.
    """
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT node_id, parent_id, left_id, right_id, height, size, "
            "       n_leaves, cluster_id, x, y, leaf_order, label, label_src, keywords "
            "FROM cluster_tree WHERE run_id = ? ORDER BY node_id", (run,)
        ).fetchall()
        if not rows:
            raise HTTPException(404, "트리가 없다. constellation hierarchy 를 돌려라.")
        lv = conn.execute(
            "SELECT level, k, node_id FROM tree_levels WHERE run_id = ? "
            "ORDER BY level, node_id", (run,)
        ).fetchall()
    finally:
        conn.close()

    levels: dict[int, list[int]] = {}
    for level, _k, node in lv:
        levels.setdefault(level, []).append(node)

    return {
        "run_id": run,
        "nodes": [
            {"id": r[0], "parent": r[1], "left": r[2], "right": r[3],
             "height": r[4], "size": r[5], "n_leaves": r[6],
             "cluster_id": r[7], "x": r[8], "y": r[9], "leaf_order": r[10],
             "label": r[11], "label_src": r[12],
             "keywords": (r[13] or "").split(", ") if r[13] else []}
            for r in rows
        ],
        "levels": {str(k): v for k, v in sorted(levels.items())},
    }


@app.get("/api/clusters/{cluster_id}")
def cluster_detail(cluster_id: int, run: str = Query(...)) -> dict[str, Any]:
    conn = _conn()
    try:
        m = conn.execute(
            "SELECT cluster_id, label, keywords, size, year_median "
            "FROM cluster_meta WHERE run_id = ? AND cluster_id = ?",
            (run, cluster_id),
        ).fetchone()
        if not m:
            raise HTTPException(404, "없는 클러스터: %d" % cluster_id)
        top = conn.execute(
            "SELECT w.id, w.title, w.year, coalesce(w.cited_by_count, 0) "
            "FROM clusters c JOIN works w ON w.id = c.work_id "
            "WHERE c.run_id = ? AND c.cluster_id = ? "
            "ORDER BY w.cited_by_count DESC NULLS LAST LIMIT 12",
            (run, cluster_id),
        ).fetchall()
        years = conn.execute(
            "SELECT w.year, count(*) FROM clusters c JOIN works w ON w.id = c.work_id "
            "WHERE c.run_id = ? AND c.cluster_id = ? AND w.year IS NOT NULL "
            "GROUP BY w.year ORDER BY w.year", (run, cluster_id),
        ).fetchall()
    finally:
        conn.close()
    return {
        "cluster_id": m[0], "label": m[1],
        "keywords": (m[2] or "").split(", ") if m[2] else [],
        "size": m[3], "year_median": m[4],
        "top_works": [{"id": r[0], "title": r[1], "year": r[2], "cited": r[3]}
                      for r in top],
        "by_year": [{"year": r[0], "n": r[1]} for r in years],
    }


@app.get("/api/works/{work_id:path}")
def get_work(work_id: str) -> dict[str, Any]:
    conn = _conn()
    try:
        row = conn.execute(
            "SELECT id, doi, title, abstract, year, venue, cited_by_count, type, source "
            "FROM works WHERE id = ?", (work_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "없는 논문: %s" % work_id)

        authors = [r[0] for r in conn.execute(
            "SELECT a.name FROM work_authors wa JOIN authors a ON a.id = wa.author_id "
            "WHERE wa.work_id = ? ORDER BY wa.position LIMIT 25", (work_id,)
        ).fetchall()]
        topics = [{"name": r[0], "kind": r[1]} for r in conn.execute(
            "SELECT topic, kind FROM work_topics WHERE work_id = ? "
            "ORDER BY score DESC NULLS LAST LIMIT 12", (work_id,)
        ).fetchall()]
        n_out = conn.execute(
            "SELECT count(*) FROM citations c JOIN works w ON w.id = c.cited_id "
            "WHERE c.citing_id = ?", (work_id,)
        ).fetchone()[0]
        n_in = conn.execute(
            "SELECT count(*) FROM citations c JOIN works w ON w.id = c.citing_id "
            "WHERE c.cited_id = ?", (work_id,)
        ).fetchone()[0]
    finally:
        conn.close()

    return {
        "id": row[0], "doi": row[1], "title": row[2], "abstract": row[3],
        "year": row[4], "venue": row[5], "cited_by_count": row[6],
        "type": row[7], "source": row[8],
        "authors": authors, "topics": topics,
        "refs_in_corpus": n_out, "cited_by_in_corpus": n_in,
    }


@app.get("/api/search")
def search(q: str = Query(..., min_length=2), limit: int = Query(50, le=200)) -> list[dict]:
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT id, title, year, cited_by_count FROM works "
            "WHERE lower(title) LIKE ? OR lower(abstract) LIKE ? "
            "ORDER BY cited_by_count DESC NULLS LAST LIMIT ?",
            ("%" + q.lower() + "%", "%" + q.lower() + "%", limit),
        ).fetchall()
    finally:
        conn.close()
    return [{"id": r[0], "title": r[1], "year": r[2], "cited_by_count": r[3]}
            for r in rows]


@app.get("/api/health")
def health() -> dict[str, Any]:
    if not DB_PATH.exists():
        return {"ok": False, "reason": "DB 없음"}
    conn = store.connect(read_only=True)
    try:
        n = conn.execute("SELECT count(*) FROM works").fetchone()[0]
        p = conn.execute("SELECT count(*) FROM runs WHERE kind='project'").fetchone()[0]
    finally:
        conn.close()
    return {"ok": True, "works": n, "projection_runs": p}
