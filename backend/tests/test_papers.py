"""외부 검색과 지도에 논문 추가·빼기: 식별자 판별, arXiv 해석, kNN 배정, 배치·빼기, 실패 시 무변화."""
import asyncio
import hashlib
import pickle
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from constellation import pipeline
from constellation.analyze import place as place_mod
from constellation.config import Settings
from constellation.db import store
from constellation.embed.cache import EmbeddingStore
from constellation.ingest import identify
from constellation.sources.base import Work

KEY = Settings(openalex_api_key="k", openalex_mailto=None, scopus_api_key=None,
               scopus_insttoken=None)


class ClassifyTests(unittest.TestCase):
    def test_identifier_kinds(self):
        cases = {
            "W2194775991": ("openalex", "W2194775991"),
            "https://openalex.org/w123": ("openalex", "W123"),
            "openalex:W5": ("openalex", "W5"),
            "2005.11401": ("arxiv", "2005.11401"),
            "arXiv:2005.11401v3": ("arxiv", "2005.11401"),
            "https://arxiv.org/abs/1706.03762v7": ("arxiv", "1706.03762"),
            "https://arxiv.org/pdf/1706.03762.pdf": ("arxiv", "1706.03762"),
            "hep-th/9901001": ("arxiv", "hep-th/9901001"),
            "10.48550/arXiv.2005.11401": ("arxiv", "2005.11401"),
            "https://doi.org/10.1109/CVPR.2016.90": ("doi", "10.1109/cvpr.2016.90"),
            "doi:10.1145/3065386": ("doi", "10.1145/3065386"),
            "retrieval augmented generation": ("search", "retrieval augmented generation"),
            "2020": ("search", "2020"),
        }
        for q, want in cases.items():
            with self.subTest(q=q):
                self.assertEqual(identify.classify(q), want)


def row(wid, title, year=2020, cited=1, doi=None):
    return {"id": "https://openalex.org/" + wid, "title": title, "publication_year": year,
            "cited_by_count": cited, "doi": doi, "authorships": [], "primary_location": {},
            "abstract_inverted_index": {"a": [0]}}


class FakeSource:
    """OpenAlex 대신. W3027879771은 제목이 덮인 기록, W3098425262가 같은 논문의 다른 기록."""
    works = {"W3027879771": row("W3027879771", "Affordance-Compiled Intelligence"),
             "W1": row("W1", "Paper One"), "W2": row("W2", "Paper Two"),
             "W9": row("W9", "Paper Nine")}

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        pass

    async def get_work(self, key, select=None):
        if key.startswith("doi:"):
            return {"doi:10.1/one": self.works["W1"]}.get(key)
        return self.works.get(key)

    async def _get(self, params, endpoint="/works", missing_ok=False):
        assert params["filter"].startswith("title.search:")
        return {"results": [
            row("W3098425262", "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", 2020, 18),
            row("W77", "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", 2015, 999),
        ]}

    async def search_works(self, q, page, per_page, select=None):
        return 2, [self.works["W1"], self.works["W2"]]

    async def fetch_by_ids(self, ids):
        for i in ids:
            wid = i.split(":", 1)[-1]
            yield Work(id="openalex:" + wid, title="Paper " + wid, abstract="abs " + wid,
                       year=2021, source="openalex")


async def s2(arxiv_key):
    return {"arXiv:2005.11401": {"title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
                                 "year": 2020, "externalIds": {"MAG": "3027879771", "ArXiv": "2005.11401"}},
            "arXiv:1111.1111": {"title": "Paper One", "year": 2020,
                                "externalIds": {"DOI": "10.1/ONE"}}}.get(arxiv_key)


class ResolveTests(unittest.TestCase):
    def test_arxiv_skips_mismatched_record_and_falls_back_to_title(self):
        r = asyncio.run(identify.resolve_arxiv(FakeSource(), "2005.11401", s2))
        # MAG 기록은 제목이 달라 버리고, 제목 검색에서 연도가 맞는 기록을 고른다.
        self.assertEqual(r["id"], "https://openalex.org/W3098425262")

    def test_arxiv_uses_doi_record_when_title_matches(self):
        r = asyncio.run(identify.resolve_arxiv(FakeSource(), "1111.1111", s2))
        self.assertEqual(r["id"], "https://openalex.org/W1")

    def test_unknown_arxiv_is_none(self):
        self.assertIsNone(asyncio.run(identify.resolve_arxiv(FakeSource(), "9999.99999", s2)))

    def test_search_returns_summaries_or_single_lookup(self):
        r = asyncio.run(identify.search(FakeSource(), "graph", 1, s2))
        self.assertEqual((r["kind"], r["total"], [i["id"] for i in r["items"]]),
                         ("search", 2, ["openalex:W1", "openalex:W2"]))
        self.assertTrue(r["items"][0]["has_abstract"])
        r = asyncio.run(identify.search(FakeSource(), "W404", 1, s2))
        self.assertEqual((r["kind"], r["items"]), ("openalex", []))
        with self.assertRaises(ValueError):
            asyncio.run(identify.search(FakeSource(), "x", 41, s2))


class AssignTests(unittest.TestCase):
    def test_majority_noise_and_ties(self):
        sims = np.array([0.9, 0.8, 0.7, 0.6, 0.5])
        self.assertEqual(place_mod.assign(sims, np.array([1, 1, 2, -1, 2]), 5)[:2], (1, 0.4))
        # 동률(2:2)이면 유사도 합이 큰 쪽
        self.assertEqual(place_mod.assign(sims, np.array([2, 1, 1, 2, -1]), 5)[0], 2)
        # 이웃 과반이 미분류면 미분류
        self.assertEqual(place_mod.assign(sims, np.array([-1, -1, -1, 1, 1]), 5)[0], -1)
        self.assertAlmostEqual(place_mod.assign(sims, np.array([1, 1, 1, 1, 1]), 5)[2], 0.9)


def _hash(w):
    return hashlib.sha1(w.encode()).hexdigest()


class Fixture:
    """지도 하나(코퍼스 c, 모델 scincl): 세 무리 × 12편, 무리 2는 미분류. 실제 PCA·UMAP를 학습해 둔다."""

    def __init__(self):
        from sklearn.decomposition import PCA
        import umap

        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.db = root / "c.duckdb"
        self.emb = root / "emb"
        self.models = root / "models"
        rng = np.random.default_rng(0)
        centers = np.eye(3, 8) * 3
        self.centers = centers
        ids, vecs, labels = [], [], []
        for g in range(3):
            for i in range(12):
                ids.append("openalex:G%d_%02d" % (g, i))
                v = centers[g] + rng.normal(0, 0.1, 8)
                vecs.append(v / np.linalg.norm(v))
                labels.append(g if g < 2 else -1)
        self.old_ids = ids
        vecs = np.array(vecs, dtype=np.float32)

        c = store.connect(self.db)
        store.ensure_corpus(c, "c", "C")
        for w in ids:
            c.execute("INSERT INTO works (id,title,has_abstract,year,source,collected_at) "
                      "VALUES (?,?,true,2020,'test',CURRENT_TIMESTAMP)", (w, w))
        store.add_members(c, "c", ids, "collect")
        c.execute("INSERT INTO runs (run_id,kind,model,created_at,corpus_id) VALUES "
                  "('m','project','scincl',CURRENT_TIMESTAMP,'c'),"
                  "('m2','project','specter',CURRENT_TIMESTAMP,'c')")
        pca = PCA(n_components=4, random_state=0).fit(vecs)
        red = pca.transform(vecs)
        u2 = umap.UMAP(n_components=2, n_neighbors=5, random_state=0).fit(red)
        u3 = umap.UMAP(n_components=3, n_neighbors=5, random_state=0).fit(red)
        for i, w in enumerate(ids):
            c.execute("INSERT INTO projections VALUES ('m', ?, ?, ?, ?)",
                      (w, float(u2.embedding_[i, 0]), float(u2.embedding_[i, 1]),
                       float(u3.embedding_[i, 2])))
            c.execute("INSERT INTO clusters VALUES ('m', ?, ?, 1.0)", (w, labels[i]))
        c.execute("INSERT INTO cluster_meta (run_id,cluster_id,label,size) VALUES "
                  "('m',0,'zero',12),('m',1,'one',12)")
        c.close()
        d = self.models / "c" / "scincl"
        d.mkdir(parents=True)
        for name, obj in (("pca", pca), ("umap2", u2), ("umap3", u3)):
            with open(d / ("%s.pkl" % name), "wb") as f:
                pickle.dump(obj, f)
        self.write_vectors(ids, vecs)

    def write_vectors(self, ids, vecs):
        st = EmbeddingStore("scincl", self.emb / "scincl")
        hs = [_hash(w) for w in ids]
        todo = st.missing(hs)
        st.add(todo, np.array([vecs[hs.index(h)] for h in todo], dtype=np.float32))
        st.save()
        path = st.dir / "works.parquet"
        m = {}
        if path.exists():
            t = pq.read_table(path)
            m = dict(zip(t.column("work_id").to_pylist(), t.column("text_hash").to_pylist()))
        m.update(zip(ids, hs))
        keys = sorted(m)
        pq.write_table(pa.table({"work_id": keys, "text_hash": [m[k] for k in keys]}), path)

    def near(self, g, seed):
        v = self.centers[g] + np.random.default_rng(seed).normal(0, 0.1, 8)
        return (v / np.linalg.norm(v)).astype(np.float32)

    def patches(self):
        return [mock.patch.object(store, "DB_PATH", self.db),
                mock.patch("constellation.embed.cache.EMB_DIR", self.emb),
                mock.patch("constellation.analyze.project.MODEL_DIR", self.models)]

    def snapshot(self):
        c = store.connect(self.db, read_only=True)
        try:
            return (c.execute("SELECT * FROM projections WHERE work_id LIKE 'openalex:G%' "
                              "ORDER BY run_id, work_id").fetchall(),
                    c.execute("SELECT * FROM clusters WHERE work_id LIKE 'openalex:G%' "
                              "ORDER BY run_id, work_id").fetchall())
        finally:
            c.close()

    def q(self, sql, *args):
        c = store.connect(self.db, read_only=True)
        try:
            return c.execute(sql, args).fetchall()
        finally:
            c.close()


class PlaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fx = Fixture()

    @classmethod
    def tearDownClass(cls):
        cls.fx.tmp.cleanup()

    def _add_works(self, ids):
        c = store.connect(self.fx.db)
        for w in ids:
            c.execute("INSERT OR IGNORE INTO works (id,title,has_abstract,year,source,collected_at) "
                      "VALUES (?,?,false,2021,'test',CURRENT_TIMESTAMP)", (w, w))
        c.close()

    def test_place_then_remove_keeps_existing_rows(self):
        fx = self.fx
        new = ["openalex:N0", "openalex:N2"]
        with ExitStack() as s:
            for p in fx.patches():
                s.enter_context(p)
            self._add_works(new)
            fx.write_vectors(new, np.array([fx.near(0, 1), fx.near(2, 2)]))
            before = fx.snapshot()
            out = place_mod.place("m", new, log=lambda *_: None)
            self.assertEqual([(r["id"], r["cluster"], r["label"]) for r in out],
                             [("openalex:N0", 0, "zero"), ("openalex:N2", -1, None)])
            self.assertTrue(out[0]["title_only"])
            self.assertGreater(out[0]["similarity"], 0.9)
            self.assertEqual(fx.snapshot(), before)
            self.assertEqual(fx.q("SELECT size FROM cluster_meta WHERE cluster_id = 0"), [(13,)])
            self.assertEqual(sorted(fx.q("SELECT work_id FROM corpus_works WHERE via = 'manual'")),
                             [("openalex:N0",), ("openalex:N2",)])
            self.assertEqual(place_mod.added_ratio("m"), (2, 36))
            with self.assertRaises(ValueError):
                place_mod.place("m", ["openalex:N0"], log=lambda *_: None)

            with self.assertRaisesRegex(ValueError, "수집으로"):
                place_mod.remove("m", ["openalex:N0", "openalex:G0_00"], log=lambda *_: None)
            self.assertEqual(place_mod.remove("m", new, log=lambda *_: None), new)
            self.assertEqual(fx.snapshot(), before)
            self.assertEqual(fx.q("SELECT size FROM cluster_meta WHERE cluster_id = 0"), [(12,)])
            self.assertEqual(fx.q("SELECT count(*) FROM corpus_works WHERE via = 'manual'"), [(0,)])

    def test_remove_keeps_membership_when_another_map_has_paper(self):
        fx = self.fx
        with ExitStack() as s:
            for p in fx.patches():
                s.enter_context(p)
            self._add_works(["openalex:N5"])
            fx.write_vectors(["openalex:N5"], np.array([fx.near(1, 5)]))
            place_mod.place("m", ["openalex:N5"], log=lambda *_: None)
            c = store.connect(fx.db)
            c.execute("INSERT INTO projections VALUES ('m2','openalex:N5',0,0,0)")
            c.close()
            place_mod.remove("m", ["openalex:N5"], log=lambda *_: None)
            self.assertEqual(fx.q("SELECT via FROM corpus_works WHERE work_id = 'openalex:N5'"),
                             [("manual",)])
            c = store.connect(fx.db)
            c.execute("DELETE FROM projections WHERE run_id = 'm2'")
            c.execute("DELETE FROM corpus_works WHERE work_id = 'openalex:N5'")
            c.close()

    def test_map_without_models_is_rejected(self):
        with ExitStack() as s:
            for p in self.fx.patches():
                s.enter_context(p)
            with self.assertRaisesRegex(ValueError, "투영 모델"):
                pipeline.check_papers("m2", ["W1"])
            with self.assertRaisesRegex(ValueError, "없는 지도"):
                pipeline.check_papers("nope", ["W1"])
            with self.assertRaises(ValueError):
                pipeline.check_papers("m", [])
            self.assertEqual(pipeline.check_papers("m", [" W1", "W1"]), ["W1"])

    def _run_add(self, ids, embed=None):
        fx = self.fx
        events = []

        async def no_enrich(**k):
            return {}

        def fake_embed(model, log, progress, work_ids):
            fx.write_vectors(work_ids, np.array([fx.near(1, i) for i, _ in enumerate(work_ids)]))

        async def lookup(src, q, s2_fetch=None):
            kind, value = identify.classify(q)
            return kind, FakeSource.works.get(value)

        with ExitStack() as s:
            for p in fx.patches() + [
                mock.patch("constellation.sources.openalex.OpenAlexSource", FakeSource),
                mock.patch("constellation.ingest.identify.lookup", lookup),
                mock.patch("constellation.ingest.collect.enrich_abstracts", no_enrich),
                mock.patch("constellation.embed.run.embed_corpus", embed or fake_embed),
            ]:
                s.enter_context(p)
            try:
                return pipeline.add_papers("m", ids, events.append, KEY), events
            except pipeline.StageError as e:
                return e, events

    def test_add_papers_pipeline(self):
        result, events = self._run_add(["W1", "openalex:W9", "W404", "graph search"])
        self.assertEqual([e["stage"] for e in events if e["event"] == "stage"], list(pipeline.ADD_STAGES))
        self.assertEqual([a["id"] for a in result["added"]], ["openalex:W1", "openalex:W9"])
        self.assertTrue(all(a["cluster"] == 1 and a["label"] == "one" for a in result["added"]))
        self.assertEqual(result["not_found"], ["W404", "graph search"])
        self.assertEqual(result["skipped"], [])
        self.assertFalse(result["recompute_suggested"])
        self.assertEqual(events[-1]["event"], "done")
        self.assertEqual(events[-1]["map_id"], "m")
        # 이미 지도에 있으면 건너뛰고, 배치할 것이 없으면 뒤 단계를 돌지 않는다.
        again, events = self._run_add(["W1"])
        self.assertEqual(again["skipped"], [{"id": "openalex:W1", "reason": "이미 지도에 있다"}])
        self.assertEqual(again["added"], [])
        self.assertEqual([e["stage"] for e in events if e["event"] == "stage"], ["resolve"])
        with ExitStack() as s:
            for p in self.fx.patches():
                s.enter_context(p)
            place_mod.remove("m", ["openalex:W1", "openalex:W9"], log=lambda *_: None)

    def test_failure_before_place_changes_nothing(self):
        before = self.fx.snapshot()

        def boom(*a, **k):
            raise RuntimeError("모델을 불러오지 못했다")
        err, events = self._run_add(["W2"], embed=boom)
        self.assertIsInstance(err, pipeline.StageError)
        self.assertEqual(err.stage, "embed")
        self.assertEqual(self.fx.snapshot(), before)
        self.assertEqual(self.fx.q("SELECT count(*) FROM corpus_works WHERE via = 'manual'"), [(0,)])
        self.assertEqual(self.fx.q("SELECT count(*) FROM projections WHERE work_id = 'openalex:W2'"), [(0,)])


if __name__ == "__main__":
    unittest.main()
