"""코퍼스 도입 이전 DB를 코퍼스 구조로 옮긴다.

- adopt: 현재 DB에서 아직 어느 코퍼스에도 속하지 않은 논문·run을 한 코퍼스에 배정한다.
- import_db: 다른 분석 DB(와 그 옆의 embeddings/, models/)를 현재 DB로 옮긴다.

둘 다 다시 실행해도 결과가 같다. 분석 산출물은 다시 계산하지 않고 그대로
옮긴다 — 영역 이름 짓기가 비결정적이라 다시 돌리면 다른 이름이 나온다.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Callable

import duckdb
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from ..config import DATA
from . import store

Progress = Callable[[str], None]

# run_id를 키로 갖는 분석 산출물. 옮길 때 run_id를 그대로 쓴다.
RUN_TABLES = [
    "projections", "clusters", "cluster_meta", "cluster_tree", "tree_levels",
    "flow_windows", "flow_clusters", "flow_members", "flows", "citation_spc",
    "naming_audit",
]
SOURCE_TABLES = ["authors", "work_authors", "citations", "work_topics"]


def _tables(conn: duckdb.DuckDBPyConnection, catalog: str) -> set[str]:
    return {r[0] for r in conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_catalog = ?",
        (catalog,)).fetchall()}


def _columns(conn: duckdb.DuckDBPyConnection, catalog: str, table: str) -> list[str]:
    return [r[0] for r in conn.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_catalog = ? AND table_name = ? ORDER BY ordinal_position",
        (catalog, table)).fetchall()]


def adopt(
    conn: duckdb.DuckDBPyConnection,
    corpus: str,
    name: str,
    *,
    data_dir: Path = DATA,
    log: Progress = print,
) -> dict[str, int]:
    """소속 없는 논문과 코퍼스 없는 run·수집 이력을 corpus에 배정한다.

    import 보다 먼저 실행한다. import 가 먼저 들어오면 두 DB에 같이 있던 논문은
    이미 그 코퍼스 소속이라 여기서 배정되지 않는다.
    """
    others = [r[0] for r in conn.execute(
        "SELECT id FROM corpora WHERE id <> ?", (corpus,)).fetchall()]
    if others:
        log("[경고] 다른 코퍼스(%s)가 이미 있다. 그 코퍼스에 속한 논문은 %s에 "
            "배정되지 않는다 — adopt는 import보다 먼저 돌린다."
            % (", ".join(others), corpus))
    store.ensure_corpus(conn, corpus, name, {"kind": "adopted"})
    orphans = [r[0] for r in conn.execute(
        "SELECT w.id FROM works w WHERE NOT EXISTS "
        "(SELECT 1 FROM corpus_works m WHERE m.work_id = w.id)").fetchall()]
    added = store.add_members(conn, corpus, orphans, "adopt")
    runs = conn.execute(
        "UPDATE runs SET corpus_id = ? WHERE corpus_id IS NULL "
        "AND kind <> 'embed' RETURNING run_id", (corpus,)).fetchall()
    conn.execute(
        "UPDATE runs SET name = ? || ' · ' || model "
        "WHERE corpus_id = ? AND kind = 'project' AND name IS NULL", (name, corpus))
    conn.execute(
        "UPDATE collections SET corpus_id = ? WHERE corpus_id IS NULL", (corpus,))
    conn.commit()
    moved = _move_models(data_dir / "models", corpus, log)
    log("adopt %s: 논문 %s편, run %d개, 투영 모델 %d개"
        % (corpus, format(added, ","), len(runs), moved))
    return {"works": added, "runs": len(runs), "models": moved}


def _move_models(models: Path, corpus: str, log: Progress) -> int:
    """models/<model>/ 을 models/<corpus>/<model>/ 로 옮긴다.

    <model> 폴더는 pca.pkl 이 들어 있는 것으로 가린다. 코퍼스 폴더는 그 아래에
    다시 모델 폴더를 가지므로 pca.pkl 이 없다.
    """
    if not models.exists():
        return 0
    n = 0
    for d in sorted(p for p in models.iterdir() if p.is_dir()):
        if not (d / "pca.pkl").exists():
            continue
        dest = models / corpus / d.name
        if dest.exists():
            log("  투영 모델 %s 는 이미 %s 에 있다 — 옛 폴더는 그대로 둔다"
                % (d.name, dest))
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(d), str(dest))
        n += 1
    return n


def import_db(
    conn: duckdb.DuckDBPyConnection,
    src: Path,
    corpus: str,
    name: str,
    *,
    data_dir: Path = DATA,
    log: Progress = print,
) -> dict[str, int]:
    """다른 분석 DB를 현재 DB의 corpus로 옮긴다. 원본은 읽기만 한다."""
    src = src.resolve()
    if not src.exists():
        raise FileNotFoundError(src)
    store.ensure_corpus(conn, corpus, name,
                        {"kind": "imported", "source": str(src)})
    conn.execute("ATTACH '%s' AS src (READ_ONLY)" % str(src).replace("'", "''"))
    try:
        have = _tables(conn, "src")

        # works: 같은 id가 있으면 초록이 있는 쪽, 둘 다 같으면 나중에 수집한 쪽을
        # 남긴다. 피인용 수와 제목은 OpenAlex에서 계속 바뀌므로 새 값이 맞다.
        n_before = conn.execute("SELECT count(*) FROM works").fetchone()[0]
        newer = ("(NOT w.has_abstract AND s.has_abstract) OR "
                 "(w.has_abstract = s.has_abstract AND s.collected_at > w.collected_at)")
        n_better = conn.execute(
            "SELECT count(*) FROM works w JOIN src.works s ON s.id = w.id WHERE "
            + newer).fetchone()[0]
        conn.execute(
            "INSERT OR REPLACE INTO works SELECT s.* FROM src.works s "
            "LEFT JOIN works w ON w.id = s.id WHERE w.id IS NULL OR " + newer)
        n_works = conn.execute("SELECT count(*) FROM works").fetchone()[0] - n_before

        for t in SOURCE_TABLES:
            if t in have:
                conn.execute("INSERT OR IGNORE INTO %s SELECT * FROM src.%s" % (t, t))

        members = [r[0] for r in conn.execute("SELECT id FROM src.works").fetchall()]
        n_members = store.add_members(conn, corpus, members, "import")

        # 수집 이력: 원본 컬럼만 옮기고 corpus_id를 적는다.
        if "collections" in have:
            cols = [c for c in _columns(conn, "src", "collections") if c != "corpus_id"]
            conn.execute(
                "INSERT OR IGNORE INTO collections (%s, corpus_id) "
                "SELECT %s, ? FROM src.collections" % (",".join(cols), ",".join(cols)),
                (corpus,))

        # run: 이미 있는 run_id는 건너뛴다. 파생 run(`|cluster` 등)도 함께 옮긴다.
        src_runs = [r[0] for r in conn.execute("SELECT run_id FROM src.runs").fetchall()]
        existing = {r[0] for r in conn.execute("SELECT run_id FROM runs").fetchall()}
        clash = [r for r in src_runs if r in existing]
        new_runs = [r for r in src_runs if r not in existing]
        rcols = [c for c in _columns(conn, "src", "runs") if c not in ("corpus_id", "name")]
        if new_runs:
            conn.execute("CREATE OR REPLACE TEMP TABLE _new_runs (run_id TEXT)")
            conn.executemany("INSERT INTO _new_runs VALUES (?)", [(r,) for r in new_runs])
            conn.execute(
                "INSERT INTO runs (%s, corpus_id, name) "
                "SELECT %s, CASE WHEN kind = 'embed' THEN NULL ELSE ? END, "
                "CASE WHEN kind = 'project' THEN ? || ' · ' || model END "
                "FROM src.runs WHERE run_id IN (SELECT run_id FROM _new_runs)"
                % (",".join(rcols), ",".join("src.runs.%s" % c for c in rcols)),
                (corpus, name))
            bases = sorted({r.split("|", 1)[0] for r in new_runs})
            conn.execute("CREATE OR REPLACE TEMP TABLE _new_bases (run_id TEXT)")
            conn.executemany("INSERT INTO _new_bases VALUES (?)", [(r,) for r in bases])
            for t in RUN_TABLES:
                if t not in have:
                    continue
                if t == "naming_audit":
                    conn.execute(
                        "CREATE TABLE IF NOT EXISTS naming_audit ("
                        "run_id TEXT NOT NULL, node_id INTEGER NOT NULL, "
                        "prompt TEXT NOT NULL, output TEXT NOT NULL, model TEXT NOT NULL, "
                        "created_at TIMESTAMP NOT NULL, PRIMARY KEY (run_id, node_id))")
                conn.execute(
                    "INSERT OR IGNORE INTO %s SELECT * FROM src.%s "
                    "WHERE run_id IN (SELECT run_id FROM _new_bases)" % (t, t))
        conn.commit()
    finally:
        conn.execute("DETACH src")

    n_vec = _merge_embeddings(src.parent / "embeddings", data_dir / "embeddings", log)
    rewrite_work_index(conn, data_dir / "embeddings")
    n_models = _copy_models(src.parent / "models", data_dir / "models" / corpus, log)

    if clash:
        log("  이미 있는 run %d개는 건너뛰었다: %s" % (len(clash), ", ".join(clash[:5])))
    log("import %s: 새 논문 %s편(기존 논문 갱신 %s편), 소속 %s편, run %d개, "
        "임베딩 %s개, 투영 모델 %d개"
        % (corpus, format(n_works, ","), format(n_better, ","),
           format(n_members, ","), len(new_runs), format(n_vec, ","), n_models))
    return {"works": n_works, "updated": n_better, "members": n_members,
            "runs": len(new_runs), "skipped_runs": len(clash),
            "vectors": n_vec, "models": n_models}


def _merge_embeddings(src_dir: Path, dst_dir: Path, log: Progress) -> int:
    """원본 캐시에서 현재 캐시에 없는 해시의 벡터만 더한다. 모델마다 따로."""
    from ..embed.cache import EmbeddingStore

    if not src_dir.exists():
        return 0
    total = 0
    for d in sorted(p for p in src_dir.iterdir() if (p / "index.parquet").exists()):
        tbl = pq.read_table(d / "index.parquet")
        hashes = tbl.column("text_hash").to_pylist()
        rows = tbl.column("row").to_pylist()
        vecs = np.load(d / "vectors.npy")
        st = EmbeddingStore.at(dst_dir / d.name, d.name)
        todo = [(h, r) for h, r in zip(hashes, rows) if h not in st.row_of]
        if todo:
            st.add([h for h, _ in todo], vecs[[r for _, r in todo]])
            st.save()
        total += len(todo)
        log("  임베딩 %s: 원본 %s개 중 %s개 추가"
            % (d.name, format(len(hashes), ","), format(len(todo), ",")))
    return total


def rewrite_work_index(conn: duckdb.DuckDBPyConnection, emb_dir: Path) -> None:
    """모델마다 works.parquet(work_id → text_hash)를 합친 works 기준으로 다시 쓴다.

    텍스트 해시는 embed 단계와 같은 규칙으로 계산한다. 캐시에 없는 해시의
    논문은 빠진다 — 그 논문은 다음 embed 실행 때 계산된다.
    """
    from ..embed.cache import EmbeddingStore
    from ..embed.encoder import build_text, get_spec, text_hash

    if not emb_dir.exists():
        return
    rows = conn.execute(
        "SELECT id, title, abstract FROM works ORDER BY id").fetchall()
    for d in sorted(p for p in emb_dir.iterdir() if (p / "index.parquet").exists()):
        spec = get_spec(d.name)
        st = EmbeddingStore.at(d, d.name)
        ids, hs = [], []
        for wid, title, abstract in rows:
            h = text_hash(build_text(title, abstract, spec), spec)
            if h in st.row_of:
                ids.append(wid)
                hs.append(h)
        pq.write_table(pa.table({"work_id": pa.array(ids), "text_hash": pa.array(hs)}),
                       d / "works.parquet")


def _copy_models(src_dir: Path, dst_dir: Path, log: Progress) -> int:
    if not src_dir.exists():
        return 0
    n = 0
    for d in sorted(p for p in src_dir.iterdir() if (p / "pca.pkl").exists()):
        dest = dst_dir / d.name
        if dest.exists():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(d, dest)
        n += 1
    return n
