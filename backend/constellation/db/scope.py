"""파이프라인 명령의 대상(코퍼스·지도)을 확정한다.

DB 하나에 코퍼스가 여러 개 있으므로, 각 단계가 "최신 run"을 암묵적으로
고르면 실행 순서에 따라 다른 지도에 작업하게 된다. 대상은 여기서만 정한다.
"""
from __future__ import annotations

import duckdb


class ScopeError(RuntimeError):
    """대상을 확정할 수 없다. 메시지에 고를 수 있는 목록을 담는다."""


def corpora(conn: duckdb.DuckDBPyConnection) -> list[tuple[str, str, int]]:
    """(id, 이름, 논문 수) 목록."""
    return conn.execute(
        "SELECT c.id, c.name, count(m.work_id) FROM corpora c "
        "LEFT JOIN corpus_works m ON m.corpus_id = c.id "
        "GROUP BY c.id, c.name ORDER BY c.name"
    ).fetchall()


def _listing(conn: duckdb.DuckDBPyConnection) -> str:
    rows = corpora(conn)
    if not rows:
        return "코퍼스가 없다. `constellation corpus adopt` 또는 `collect`로 만든다."
    return "코퍼스: " + ", ".join("%s(%s, %s편)" % (i, n, format(k, ","))
                                   for i, n, k in rows)


def resolve_corpus(conn: duckdb.DuckDBPyConnection, corpus: str | None) -> str:
    """코퍼스 id를 확정한다. 생략하면 코퍼스가 하나일 때만 그것을 쓴다."""
    rows = corpora(conn)
    if corpus:
        if not any(r[0] == corpus for r in rows):
            raise ScopeError("없는 코퍼스: %s. %s" % (corpus, _listing(conn)))
        return corpus
    if len(rows) == 1:
        return rows[0][0]
    raise ScopeError("--corpus 로 대상을 정해라. %s" % _listing(conn))


def resolve_map(
    conn: duckdb.DuckDBPyConnection,
    map_id: str | None,
    corpus: str | None,
    model: str,
) -> str:
    """지도(project run) id를 확정한다.

    --map 이 있으면 그것, 없으면 코퍼스(생략 시 유일한 코퍼스)의 해당 모델
    최신 지도.
    """
    if map_id:
        row = conn.execute(
            "SELECT run_id FROM runs WHERE run_id = ? AND kind = 'project'",
            (map_id,)).fetchone()
        if not row:
            raise ScopeError("없는 지도: %s" % map_id)
        return map_id
    cid = resolve_corpus(conn, corpus)
    row = conn.execute(
        "SELECT run_id FROM runs WHERE kind = 'project' AND model = ? "
        "AND corpus_id = ? ORDER BY created_at DESC LIMIT 1",
        (model, cid)).fetchone()
    if not row:
        raise ScopeError("%s 코퍼스에 %s 지도가 없다. project 를 먼저 돌려라."
                         % (cid, model))
    return row[0]


def map_corpus(conn: duckdb.DuckDBPyConnection, run_id: str) -> str | None:
    row = conn.execute(
        "SELECT corpus_id FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    return row[0] if row else None


def corpus_work_ids(conn: duckdb.DuckDBPyConnection, corpus: str) -> list[str]:
    return [r[0] for r in conn.execute(
        "SELECT work_id FROM corpus_works WHERE corpus_id = ? ORDER BY work_id",
        (corpus,)).fetchall()]
