"""OpenAlex에 없는 논문: S2 클라이언트, arXiv 초록, DB 맞추기, 출처 결정, S2 논문 추가와 인용 연결."""
import asyncio
import json
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

import httpx
import numpy as np

from constellation import pipeline
from constellation.analyze import place as place_mod
from constellation.db import store
from constellation.ingest import identify
from constellation.ingest.match import keys_of, match_works
from constellation.sources import arxiv
from constellation.sources import semanticscholar as s2mod

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_papers import KEY, FakeSource, Fixture  # noqa: E402  같은 폴더의 테스트 고정 데이터

SELF_RAG = {
    "paperId": "ddbd8fe782ac98e9c64dd98710687a962195dd9b",
    "title": "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection",
    "abstract": None, "year": 2023, "venue": "ICLR",
    "authors": [{"authorId": "35584853", "name": "Akari Asai"}, {"authorId": None, "name": "X"}],
    "externalIds": {"ArXiv": "2310.11511", "CorpusId": 264288947},
    "citationCount": 2773, "publicationTypes": ["JournalArticle"],
}


class ClientTests(unittest.TestCase):
    def test_key_header_retry_and_pacing(self):
        seen, sleeps = [], []
        replies = iter([httpx.Response(429, json={"code": "429"}),
                        httpx.Response(200, json={"paperId": "p"}),
                        httpx.Response(404, json={}),
                        ])

        def handler(request):
            seen.append(request.headers.get("x-api-key"))
            return next(replies)

        async def sleep(s):
            sleeps.append(s)

        async def go():
            async with s2mod.S2Client("secret", transport=httpx.MockTransport(handler),
                                      sleep=sleep) as s2:
                first = await s2.paper("ARXIV:1")
                second = await s2.paper("ARXIV:2")
            return first, second
        first, second = asyncio.run(go())
        self.assertEqual((first, second), ({"paperId": "p"}, None))
        self.assertEqual(seen, ["secret"] * 3)
        # 429 뒤 대기, 그리고 키가 있으면 요청 사이를 1.05초 이상 둔다.
        self.assertIn(2.0, sleeps)
        self.assertTrue(any(0 < s <= s2mod.KEYED_INTERVAL for s in sleeps if s != 2.0))

    def test_no_key_sends_no_header_and_gives_up(self):
        seen = []

        def handler(request):
            seen.append("x-api-key" in request.headers)
            return httpx.Response(429, json={})

        async def sleep(s):
            pass

        async def go():
            async with s2mod.S2Client(None, transport=httpx.MockTransport(handler),
                                      sleep=sleep, retries=3) as s2:
                await s2.paper("x")
        with self.assertRaisesRegex(RuntimeError, "429"):
            asyncio.run(go())
        self.assertEqual(seen, [False] * 3)

    def test_citation_pages_stop_at_limit(self):
        def handler(request):
            off = int(request.url.params["offset"])
            return httpx.Response(200, json={"next": off + 500, "data": [
                {"citingPaper": {"paperId": "c%d" % off, "title": "t"}}]})

        async def go():
            async with s2mod.S2Client(None, transport=httpx.MockTransport(handler)) as s2:
                return await s2.citations("p", max_pages=3)
        rows, truncated = asyncio.run(go())
        self.assertEqual(([r["paperId"] for r in rows], truncated), (["c0", "c500", "c1000"], True))

    def test_to_work(self):
        w = s2mod.to_work({**SELF_RAG, "externalIds": {**SELF_RAG["externalIds"], "DOI": "10.1/AbC"}})
        self.assertEqual((w.id, w.source, w.doi, w.year, w.type, w.abstract),
                         ("s2:" + SELF_RAG["paperId"], "semanticscholar", "https://doi.org/10.1/abc",
                          2023, "journalarticle", None))
        self.assertEqual([(a.id, a.name) for a in w.authors], [("s2:35584853", "Akari Asai"), (None, "X")])

    def test_arxiv_atom(self):
        xml = ('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title>'
               '<summary>  Line one\n  line two. </summary></entry></feed>')
        self.assertEqual(arxiv.parse_abstract(xml), "Line one line two.")
        self.assertIsNone(arxiv.parse_abstract('<feed xmlns="http://www.w3.org/2005/Atom"/>'))


class MatchTests(unittest.TestCase):
    def test_doi_mag_title_and_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = store.connect(Path(tmp) / "c.duckdb")
            rows = [("openalex:W1", "https://doi.org/10.1/AbC", "Paper One", 2020),
                    ("openalex:W3027879771", None, "Affordance-Compiled Intelligence", 2025),
                    ("openalex:W5", None, "Deep Nets: a Study", 2019)]
            for wid, doi, title, year in rows:
                c.execute("INSERT INTO works (id,doi,title,year,has_abstract,source,collected_at) "
                          "VALUES (?,?,?,?,false,'t',CURRENT_TIMESTAMP)", (wid, doi, title, year))
            c.execute("INSERT INTO projections VALUES ('m','openalex:W5',0,0,0)")
            keys = [
                {"externalIds": {"DOI": "10.1/abc"}, "title": "x"},                       # DOI
                {"externalIds": {"MAG": "3027879771"}, "title": "Retrieval-Augmented Generation"},  # 덮인 MAG
                {"title": "Deep nets — a study!", "year": 2020},                           # 제목+연도
                {"title": "Deep Nets: a Study", "year": 2022},                             # 연도 차이 3
                {"externalIds": {"MAG": "5"}, "title": "Deep Nets: a Study"},              # MAG+제목
            ]
            got = match_works(c, [keys_of(k) for k in keys])
            self.assertEqual(got, ["openalex:W1", None, "openalex:W5", None, "openalex:W5"])
            self.assertEqual(match_works(c, [keys_of(k) for k in keys], "m"),
                             [None, None, "openalex:W5", None, "openalex:W5"])
            self.assertEqual(match_works(c, []), [])
            c.close()


class LookupTests(unittest.TestCase):
    def test_falls_back_to_s2_and_prefers_openalex_twin(self):
        async def s2_fetch(key):
            return {"arXiv:2310.11511": SELF_RAG,
                    "DOI:10.1234/one": {"paperId": "a" * 40, "title": "Paper One", "year": 2020,
                                     "externalIds": {"MAG": "1"}}}.get(key)

        src = FakeSource()
        kind, rec, source = asyncio.run(identify.lookup(src, "2310.11511", s2_fetch))
        self.assertEqual((kind, source, rec["paperId"]), ("arxiv", "s2", SELF_RAG["paperId"]))
        # DOI 단건이 OpenAlex에 없어도 S2 기록의 MAG가 제목이 같은 OpenAlex 기록이면 그것을 쓴다.
        with mock.patch.object(FakeSource, "get_work", side_effect=[None, FakeSource.works["W1"]]):
            kind, rec, source = asyncio.run(identify.lookup(src, "10.1234/one", s2_fetch))
        self.assertEqual((source, rec["id"]), ("openalex", "https://openalex.org/W1"))
        self.assertEqual(asyncio.run(identify.lookup(src, "10.9999/none", s2_fetch))[1:], (None, None))
        self.assertEqual(identify.classify("s2:" + "A" * 40), ("s2", "a" * 40))
        self.assertEqual(identify.classify("https://www.semanticscholar.org/paper/Self-RAG/" + "b" * 40),
                         ("s2", "b" * 40))

    def test_search_source_s2(self):
        class FakeS2:
            async def search(self, q, offset, limit):
                assert (offset, limit) == (25, 25)
                return 5000, [SELF_RAG]
        r = asyncio.run(identify.search(FakeSource(), "self rag", 2, source="s2", s2=FakeS2()))
        self.assertEqual((r["source"], r["total"], r["items"][0]["id"], r["items"][0]["source"]),
                         ("s2", 1000, "s2:" + SELF_RAG["paperId"], "s2"))
        self.assertFalse(r["items"][0]["has_abstract"])
        with self.assertRaises(ValueError):
            asyncio.run(identify.search(FakeSource(), "x", 1, source="crossref"))


class FakeS2Client:
    """참고문헌 둘(하나는 지도 안 논문과 제목이 같다), 피인용 둘(하나는 지도 안)."""

    def __init__(self):
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        pass

    async def paper(self, pid, fields=None):
        self.calls.append("paper")
        return SELF_RAG

    async def references(self, pid):
        return [{"paperId": "r1", "title": "openalex:G0_01", "year": 2020},
                {"paperId": "r2", "title": "Somewhere Else", "year": 2020}]

    async def citations(self, pid, progress=None):
        if getattr(self, "fail_citations", False):
            raise RuntimeError("Semantic Scholar HTTP 429")
        return [{"paperId": "c1", "title": "openalex:G1_03", "year": 2021},
                {"paperId": "c2", "title": "Not In Map", "year": 2021}], False


class AddS2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fx = Fixture()

    @classmethod
    def tearDownClass(cls):
        cls.fx.tmp.cleanup()

    def _run(self, ids, records, client=None):
        fx, events = self.fx, []

        async def lookup(src, q, s2_fetch=None, log=None):
            rec = records.get(q)
            return "s2", rec, "s2" if rec else None

        async def no_enrich(**k):
            return {}

        async def arxiv_abstract(arxiv_id, **k):
            return "abstract from arXiv " + arxiv_id

        def fake_embed(model, log, progress, work_ids):
            fx.write_vectors(work_ids, np.array([fx.near(1, 7) for _ in work_ids]))

        with ExitStack() as s:
            for p in fx.patches() + [
                mock.patch("constellation.sources.openalex.OpenAlexSource", FakeSource),
                mock.patch("constellation.ingest.identify.lookup", lookup),
                mock.patch("constellation.ingest.collect.enrich_abstracts", no_enrich),
                mock.patch("constellation.sources.arxiv.abstract", arxiv_abstract),
                mock.patch("constellation.embed.run.embed_corpus", fake_embed),
            ]:
                s.enter_context(p)
            result = pipeline.add_papers("m", ids, events.append, KEY,
                                         s2_client=client or FakeS2Client())
        return result, events

    def test_add_s2_paper_links_citations_and_skips_twins(self):
        fx = self.fx
        before = fx.snapshot()
        sid = "s2:" + SELF_RAG["paperId"]
        result, events = self._run(["2310.11511"], {"2310.11511": SELF_RAG})
        self.assertEqual([(a["id"], a["source"], a["cluster"]) for a in result["added"]],
                         [(sid, "s2", 1)])
        self.assertEqual(fx.snapshot(), before)
        self.assertEqual(fx.q("SELECT source, abstract, has_abstract FROM works WHERE id = ?", sid),
                         [("semanticscholar", "abstract from arXiv 2310.11511", True)])
        self.assertEqual(sorted(fx.q("SELECT citing_id, cited_id FROM citations WHERE ? IN (citing_id, cited_id)", sid)),
                         [("openalex:G1_03", sid), (sid, "openalex:G0_01"), (sid, "s2:r2")])
        self.assertEqual(fx.q("SELECT via FROM corpus_works WHERE work_id = ?", sid), [("manual",)])

        # 같은 논문을 다른 출처 id로 다시 넣으면(제목·연도가 같다) 건너뛴다.
        twin = {**SELF_RAG, "paperId": "f" * 40, "year": 2024}
        again, _ = self._run(["s2:" + "f" * 40], {"s2:" + "f" * 40: twin})
        self.assertEqual(again["added"], [])
        self.assertEqual(again["skipped"], [{"id": "s2:" + "f" * 40,
                                             "reason": "이미 지도에 있다 (%s)" % sid}])
        self.assertEqual(result["warnings"], [])
        # 지도에 이미 있는 id는 외부 조회 없이 건너뛴다(조회하면 lookup이 None을 준다).
        again, _ = self._run([sid], {})
        self.assertEqual((again["skipped"], again["not_found"]),
                         ([{"id": sid, "reason": "이미 지도에 있다"}], []))
        with ExitStack() as s:
            for p in fx.patches():
                s.enter_context(p)
            place_mod.remove("m", [sid], log=lambda *_: None)
        self.assertEqual(fx.snapshot(), before)

        # 피인용 목록을 못 받아도 논문은 추가하고 경고를 남긴다.
        client = FakeS2Client()
        client.fail_citations = True
        result, _ = self._run(["2310.11511"], {"2310.11511": SELF_RAG}, client)
        self.assertEqual([a["id"] for a in result["added"]], [sid])
        self.assertEqual(len(result["warnings"]), 1)
        self.assertIn("피인용을 받지 못했다", result["warnings"][0])
        with ExitStack() as s:
            for p in fx.patches():
                s.enter_context(p)
            place_mod.remove("m", [sid], log=lambda *_: None)


if __name__ == "__main__":
    unittest.main()
