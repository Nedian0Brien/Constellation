"""앱의 지도 정의: 검증, 종류별 수집 필터, 시드 확장, 코퍼스 지우기, 코퍼스 단위 임베딩."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import pyarrow.parquet as pq

from constellation.db import store
from constellation.ingest import seeds as seeds_mod
from constellation.ingest.definition import (
    DefinitionError, SeedsDef, TermsDef, TopicsDef, corpus_id, parse)

TERMS = {"kind": "terms", "name": "RAG", "terms": ["retrieval augmented generation", '"dense retrieval"'],
         "year_from": 2020, "year_to": 2022, "per_year": 300}


class ParseTests(unittest.TestCase):
    def test_terms_quotes_phrases_and_builds_collect_filter(self):
        d = parse(TERMS)
        self.assertIsInstance(d, TermsDef)
        self.assertEqual(d.model, "scincl")
        self.assertEqual(d.years, [2020, 2021, 2022])
        self.assertEqual(d.target, 900)
        self.assertEqual(
            d.filter_for_year(2021),
            'title_and_abstract.search:"retrieval augmented generation" OR "dense retrieval",'
            "publication_year:2021,type:article|preprint|conference-paper")

    def test_invalid_definitions_say_why(self):
        cases = [
            ({**TERMS, "year_from": 2023}, "year_from"),
            ({**TERMS, "model": "nope"}, "모델"),
            ({**TERMS, "terms": []}, "terms"),
            ({**TERMS, "per_year": 0}, "per_year"),
            ({**TERMS, "per_year": True}, "per_year"),
            ({**TERMS, "kind": "zotero"}, "kind"),
            ({**TERMS, "name": " "}, "name"),
        ]
        for d, word in cases:
            with self.subTest(d=d):
                with self.assertRaises(DefinitionError) as cm:
                    parse(d)
                self.assertIn(word, str(cm.exception))

    def test_topics_filter_per_level(self):
        base = {"kind": "topics", "name": "AI", "year_from": 2020, "year_to": 2020, "per_year": 10}
        d = parse({**base, "topics": ["T10181", "https://openalex.org/T10028"]})
        self.assertIsInstance(d, TopicsDef)
        self.assertTrue(d.filter_for_year(2020).startswith("primary_topic.id:T10181|T10028,"))
        d = parse({**base, "topics": ["subfields/1702"]})
        self.assertTrue(d.filter_for_year(2020).startswith("primary_topic.subfield.id:1702,"))
        d = parse({**base, "topics": ["fields/17"]})
        self.assertTrue(d.filter_for_year(2020).startswith("primary_topic.field.id:17,"))
        with self.assertRaises(DefinitionError):
            parse({**base, "topics": ["T10181", "fields/17"]})
        with self.assertRaises(DefinitionError):
            parse({**base, "topics": ["robotics"]})

    def test_seeds_normalize_dois(self):
        d = parse({"kind": "seeds", "name": "S", "dois": [
            "https://doi.org/10.1/ABC", "doi:10.1/abc", "10.2/x"]})
        self.assertIsInstance(d, SeedsDef)
        self.assertEqual(d.dois, ("10.1/abc", "10.2/x"))
        self.assertEqual(d.limit, 3000)
        with self.assertRaises(DefinitionError):
            parse({"kind": "seeds", "name": "S", "dois": ["not-a-doi"]})
        with self.assertRaises(DefinitionError):
            parse({"kind": "seeds", "name": "S", "dois": ["10.1/%d" % i for i in range(51)]})

    def test_definition_round_trips_through_json(self):
        d = parse(TERMS)
        again = parse({**d.to_json()})
        self.assertEqual(d, again)
        self.assertEqual(d.to_json()["kind"], "terms")

    def test_corpus_id_from_name(self):
        self.assertEqual(corpus_id("Robot Learning!", set(), "20261006T000000Z"), "robot-learning")
        self.assertEqual(corpus_id("Robot Learning", {"robot-learning"}, "20261006T000000Z"),
                         "map-20261006t000000z")
        self.assertEqual(corpus_id("로봇 학습", set(), "20261006T000000Z"), "map-20261006t000000z")
        self.assertEqual(corpus_id("로봇", {"map-t"}, "T"), "map-t-2")


class FakeSource:
    """OpenAlex 대신. 시드 둘, 시드끼리 서로 인용, 바깥 논문 셋."""
    rows_by_filter = {
        "cites:W1": [{"id": "https://openalex.org/W2", "cited_by_count": 9},
                     {"id": "https://openalex.org/W10", "cited_by_count": 50}],
        "cites:W2": [{"id": "https://openalex.org/W11", "cited_by_count": 5}],
    }

    def __init__(self, *a, **k):
        self.fetched = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        pass

    async def _get(self, params, endpoint="/works"):
        f = params["filter"]
        if f.startswith("doi:"):
            return {"results": [
                {"id": "https://openalex.org/W1", "doi": "https://doi.org/10.1/a",
                 "display_name": "Seed one", "referenced_works": [
                     "https://openalex.org/W2", "https://openalex.org/W12"], "cited_by_count": 2},
                {"id": "https://openalex.org/W2", "doi": "https://doi.org/10.1/b",
                 "display_name": "Seed two", "referenced_works": [], "cited_by_count": 1}]}
        if f.startswith("openalex_id:"):
            return {"results": [{"id": "https://openalex.org/W12", "cited_by_count": 20}]}
        raise AssertionError(f)

    async def rows(self, query, limit, sort, select):
        self.assert_light = select
        for r in self.rows_by_filter[query.split(",")[0]][:limit]:
            yield r

    async def fetch_by_ids(self, ids):
        from constellation.sources.base import Work
        for i in ids:
            yield Work(id="openalex:" + i.split(":", 1)[-1], title=i, abstract="a", source="openalex")


class SeedTests(unittest.TestCase):
    def test_candidates_exclude_seeds_and_rank_by_citations(self):
        src = FakeSource()
        seeds = asyncio.run(seeds_mod.resolve_seeds(src, ["10.1/a", "10.1/b"]))
        cands = asyncio.run(seeds_mod.candidates(src, seeds, 10, ("article",)))
        self.assertEqual(cands, {"W12": 20, "W10": 50, "W11": 5})
        self.assertEqual(src.assert_light, "id,cited_by_count")
        self.assertEqual(seeds_mod.pick(cands, 2), ["W10", "W12"])

    def test_collect_seeds_writes_members_and_reports_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "c.duckdb"
            c = store.connect(db)
            store.ensure_corpus(c, "s", "S", status="building")
            c.close()
            logs = []
            defn = SeedsDef(name="S", model="scincl",
                            dois=("10.1/a", "10.1/b", "10.9/missing"), limit=2)
            with mock.patch.object(store, "DB_PATH", db), \
                    mock.patch.object(seeds_mod, "OpenAlexSource", FakeSource), \
                    mock.patch.object(seeds_mod, "RAW", Path(tmp) / "raw"):
                r = asyncio.run(seeds_mod.collect_seeds(defn, None, corpus="s", log=logs.append))
            self.assertEqual(r["total"], 4)
            self.assertTrue(any("10.9/missing" in m for m in logs))
            c = store.connect(db, read_only=True)
            members = {w for (w,) in c.execute("SELECT work_id FROM corpus_works WHERE corpus_id='s'").fetchall()}
            c.close()
            self.assertEqual(members, {"openalex:W1", "openalex:W2", "openalex:W10", "openalex:W12"})


def _work(c, wid, title="t"):
    c.execute("INSERT INTO works (id,title,abstract,has_abstract,year,source,collected_at) "
              "VALUES (?,?,'abs',true,2020,'test',CURRENT_TIMESTAMP)", (wid, title))


class DropTests(unittest.TestCase):
    def test_drop_keeps_shared_works_and_other_corpus(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = store.connect(Path(tmp) / "c.duckdb")
            for w in ("a", "b", "c"):
                _work(c, w)
            store.ensure_corpus(c, "old", "Old", status=None)
            store.ensure_corpus(c, "new", "New", status="building")
            store.add_members(c, "old", ["a", "b"], "collect")
            store.add_members(c, "new", ["b", "c"], "collect")
            for run, corpus in (("p-old", "old"), ("p-new", "new")):
                c.execute("INSERT INTO runs (run_id,kind,model,created_at,corpus_id) "
                          "VALUES (?, 'project','scincl',CURRENT_TIMESTAMP,?)", (run, corpus))
                c.execute("INSERT INTO runs (run_id,kind,model,created_at,corpus_id) "
                          "VALUES (?, 'cluster','scincl',CURRENT_TIMESTAMP,NULL)", (run + "|cluster",))
                c.execute("INSERT INTO projections VALUES (?, 'b', 0, 0, 0)", (run,))
                c.execute("INSERT INTO clusters VALUES (?, 'b', 0, 1.0)", (run + "|cluster",))
            store.record_collection(c, "r1", "new", "new", "2020", "f", "openalex", 2, 1, 2)

            with self.assertRaises(ValueError):
                store.drop_corpus(c, "old", only_building=True)
            r = store.drop_corpus(c, "new", only_building=True)
            self.assertEqual(r, {"runs": 2, "members": 2})
            q = lambda sql: c.execute(sql).fetchall()
            self.assertEqual(q("SELECT id FROM corpora"), [("old",)])
            self.assertEqual(sorted(q("SELECT run_id FROM runs")), [("p-old",), ("p-old|cluster",)])
            self.assertEqual(q("SELECT count(*) FROM works"), [(3,)])
            self.assertEqual(q("SELECT count(*) FROM collections"), [(0,)])
            self.assertEqual(q("SELECT run_id FROM clusters"), [("p-old|cluster",)])
            c.close()


class ScopedEmbedTests(unittest.TestCase):
    def test_embedding_one_corpus_keeps_other_rows_in_works_parquet(self):
        from constellation.embed import run as run_mod
        from constellation.embed.cache import EmbeddingStore

        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "c.duckdb"
            c = store.connect(db)
            for w in ("a", "b", "c"):
                _work(c, w, "title " + w)
            c.close()
            emb = Path(tmp) / "emb"
            encoded = []

            def encode(model, texts, batch_size=64):
                encoded.extend(texts)
                return np.ones((len(texts), 4), dtype=np.float32)

            seen = []
            with mock.patch.object(store, "DB_PATH", db), \
                    mock.patch.object(run_mod, "EmbeddingStore",
                                      lambda key: EmbeddingStore(key, emb / key)), \
                    mock.patch.object(run_mod, "load_model", lambda spec: None), \
                    mock.patch.object(run_mod, "encode", encode):
                run_mod.embed_corpus("scincl", work_ids=["a", "b"], log=lambda *_: None)
                run_mod.embed_corpus("scincl", work_ids=["c"], log=lambda *_: None,
                                     progress=lambda d, t: seen.append((d, t)))
            ids = pq.read_table(emb / "scincl" / "works.parquet").column("work_id").to_pylist()
            self.assertEqual(ids, ["a", "b", "c"])
            self.assertEqual(len(encoded), 3)
            self.assertEqual(seen, [(0, 1), (1, 1)])


if __name__ == "__main__":
    unittest.main()
