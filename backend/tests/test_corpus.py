"""코퍼스 구조: 대상 해석, adopt·import 이전, backfill 후보, 코퍼스 범위 통계."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from constellation.db import migrate, scope, store
from constellation.embed.encoder import build_text, get_spec, text_hash


def _works(c, rows):
    for wid, title, abstract in rows:
        c.execute(
            "INSERT INTO works (id,title,abstract,has_abstract,year,source,collected_at) "
            "VALUES (?,?,?,?,2020,'test',CURRENT_TIMESTAMP)",
            (wid, title, abstract, abstract is not None))


def _legacy(path: Path, works, run_id: str, cites=()):
    """코퍼스 도입 이전 모양의 DB: works·runs·projections·clusters만 있다."""
    c = store.connect(path)
    _works(c, works)
    for a, b in cites:
        c.execute("INSERT INTO citations VALUES (?,?)", (a, b))
    c.execute("INSERT INTO runs (run_id,kind,model,created_at) VALUES "
              "(?, 'project', 'scincl', CURRENT_TIMESTAMP)", (run_id,))
    c.execute("INSERT INTO runs (run_id,kind,model,created_at) VALUES "
              "(?, 'cluster', 'scincl', CURRENT_TIMESTAMP)", (run_id + "|cluster",))
    for i, (wid, _, _) in enumerate(works):
        c.execute("INSERT INTO projections VALUES (?,?,?,?,0)", (run_id, wid, i, i))
        c.execute("INSERT INTO clusters VALUES (?,?,0,1.0)", (run_id, wid))
    c.close()


def _cache(emb: Path, works):
    """works의 텍스트 해시로 작은 scincl 캐시를 만든다."""
    spec = get_spec("scincl")
    d = emb / "scincl"
    d.mkdir(parents=True)
    hs = [text_hash(build_text(t, a, spec), spec) for _, t, a in works]
    np.save(d / "vectors.npy", np.eye(len(hs), 4, dtype=np.float32))
    pq.write_table(pa.table({"text_hash": pa.array(hs),
                             "row": pa.array(list(range(len(hs))), type=pa.int64())}),
                   d / "index.parquet")


RAG = [("w1", "Dense retrieval", "abs"), ("w2", "Shared paper", None)]
PAI = [("w2", "Shared paper", "now with abstract"), ("w3", "Robot policy", "abs")]


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.main = root / "data"
        self.other = root / "pai"
        _legacy(self.main / "constellation.duckdb", RAG, "project-scincl-A")
        _legacy(self.other / "constellation.duckdb", PAI, "project-scincl-B")
        _cache(self.main / "embeddings", RAG)
        _cache(self.other / "embeddings", PAI)
        for d in (self.main / "models" / "scincl", self.other / "models" / "scincl"):
            d.mkdir(parents=True)
            (d / "pca.pkl").write_bytes(b"x")

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self):
        c = store.connect(self.main / "constellation.duckdb")
        try:
            migrate.adopt(c, "rag-ir", "RAG/IR", data_dir=self.main, log=lambda *_: None)
            migrate.import_db(c, self.other / "constellation.duckdb", "physical-ai",
                              "Physical AI", data_dir=self.main, log=lambda *_: None)
        finally:
            c.close()

    def _counts(self):
        c = store.connect(self.main / "constellation.duckdb", read_only=True)
        try:
            return {t: c.execute("SELECT count(*) FROM %s" % t).fetchone()[0]
                    for t in ("works", "corpus_works", "runs", "projections", "clusters")}
        finally:
            c.close()

    def test_adopt_then_import(self):
        self._run()
        c = store.connect(self.main / "constellation.duckdb", read_only=True)
        try:
            self.assertEqual(scope.corpus_work_ids(c, "rag-ir"), ["w1", "w2"])
            self.assertEqual(scope.corpus_work_ids(c, "physical-ai"), ["w2", "w3"])
            runs = dict(c.execute(
                "SELECT run_id, corpus_id FROM runs").fetchall())
            self.assertEqual(runs, {
                "project-scincl-A": "rag-ir", "project-scincl-A|cluster": "rag-ir",
                "project-scincl-B": "physical-ai",
                "project-scincl-B|cluster": "physical-ai"})
            self.assertEqual(c.execute(
                "SELECT name FROM runs WHERE run_id = 'project-scincl-B'").fetchone()[0],
                "Physical AI · scincl")
            # 공유 논문은 초록이 있는 쪽을 남긴다(여기서는 나중에 수집한 쪽이기도 하다).
            self.assertEqual(c.execute(
                "SELECT abstract FROM works WHERE id = 'w2'").fetchone()[0],
                "now with abstract")
            self.assertEqual(c.execute(
                "SELECT count(*) FROM projections WHERE run_id = 'project-scincl-B'"
            ).fetchone()[0], 2)
        finally:
            c.close()
        self.assertTrue((self.main / "models" / "rag-ir" / "scincl" / "pca.pkl").exists())
        self.assertTrue((self.main / "models" / "physical-ai" / "scincl" / "pca.pkl").exists())
        # 캐시는 w2의 두 판(초록 없음·있음)과 w1·w3 해시를 모두 가진다.
        idx = pq.read_table(self.main / "embeddings" / "scincl" / "index.parquet")
        self.assertEqual(idx.num_rows, 4)
        works = pq.read_table(self.main / "embeddings" / "scincl" / "works.parquet")
        self.assertEqual(sorted(works.column("work_id").to_pylist()), ["w1", "w2", "w3"])

    def test_rerun_is_idempotent(self):
        self._run()
        first = self._counts()
        self._run()
        self.assertEqual(self._counts(), first)


class ScopeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "c.duckdb"
        self.c = store.connect(self.db)
        _works(self.c, RAG + PAI[1:])
        for cid in ("rag-ir", "physical-ai"):
            store.ensure_corpus(self.c, cid, cid)
        store.add_members(self.c, "rag-ir", ["w1", "w2"], "collect")
        store.add_members(self.c, "physical-ai", ["w3"], "collect")
        self.c.execute("INSERT INTO runs (run_id,kind,model,created_at,corpus_id) VALUES "
                       "('old','project','scincl','2026-01-01','physical-ai'),"
                       "('new','project','scincl','2026-02-01','physical-ai'),"
                       "('rag','project','scincl','2026-03-01','rag-ir')")

    def tearDown(self):
        self.c.close()
        self.tmp.cleanup()

    def test_ambiguous_corpus_lists_choices(self):
        with self.assertRaises(scope.ScopeError) as e:
            scope.resolve_corpus(self.c, None)
        self.assertIn("rag-ir", str(e.exception))
        self.assertIn("physical-ai", str(e.exception))

    def test_map_by_corpus_picks_latest_of_that_corpus(self):
        self.assertEqual(scope.resolve_map(self.c, None, "physical-ai", "scincl"), "new")
        self.assertEqual(scope.resolve_map(self.c, "old", None, "scincl"), "old")
        with self.assertRaises(scope.ScopeError):
            scope.resolve_map(self.c, "missing", None, "scincl")
        with self.assertRaises(scope.ScopeError):
            scope.resolve_map(self.c, None, "rag-ir", "specter2")

    def test_members_keep_first_record(self):
        self.assertEqual(store.add_members(self.c, "rag-ir", ["w1", "w3"], "backfill"), 1)
        via = dict(self.c.execute(
            "SELECT work_id, via FROM corpus_works WHERE corpus_id='rag-ir'").fetchall())
        self.assertEqual(via, {"w1": "collect", "w2": "collect", "w3": "backfill"})

    def test_stats_counts_one_corpus(self):
        self.c.execute("INSERT INTO citations VALUES ('w1','w2'),('w1','w3'),('w3','w1')")
        st = store.stats(self.c, "rag-ir")
        self.assertEqual(st["n_works"], 2)
        self.assertEqual(st["n_edges"], 2)          # w1이 인용한 것만
        self.assertEqual(st["n_internal_edges"], 1)  # w1 → w2

    def test_backfill_links_known_and_fetches_unknown(self):
        from constellation.ingest import collect

        # rag-ir 논문 둘이 w3(다른 코퍼스에 있음)과 x9(DB에 없음)을 인용한다.
        _works(self.c, [("w4", "Another", "abs")])
        store.add_members(self.c, "rag-ir", ["w4"], "collect")
        self.c.execute("INSERT INTO citations VALUES "
                       "('w1','w3'),('w4','w3'),('w1','x9'),('w4','x9')")
        self.c.close()

        fetched_ids = []

        class FakeSource:
            def __init__(self, *a, **k): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def fetch_by_ids(self, ids):
                fetched_ids.extend(ids)
                if False:
                    yield None

        with mock.patch.object(store, "connect",
                               side_effect=lambda *a, **k: store.duckdb.connect(str(self.db))), \
             mock.patch.object(collect, "OpenAlexSource", FakeSource):
            r = asyncio.run(collect.backfill_citations(None, "rag-ir", log=lambda *_: None))
        self.c = store.connect(self.db)
        self.assertEqual(fetched_ids, ["x9"])
        self.assertEqual(r["linked"], 1)
        self.assertIn("w3", scope.corpus_work_ids(self.c, "rag-ir"))


if __name__ == "__main__":
    unittest.main()
