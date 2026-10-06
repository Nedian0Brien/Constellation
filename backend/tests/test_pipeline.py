"""새 지도 파이프라인: 단계 순서와 이벤트, 이름 짓기 대체, 실패 시 코퍼스 상태, 이벤트 출력."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

from constellation import pipeline
from constellation.config import Settings
from constellation.db import store
from constellation.ingest.definition import parse

ROOT = Path(__file__).resolve().parents[2]
DEFN = parse({"kind": "terms", "name": "Robot Learning", "terms": ["robot learning"],
              "year_from": 2020, "year_to": 2021, "per_year": 10})
KEY = Settings(openalex_api_key="k", openalex_mailto=None, scopus_api_key=None,
               scopus_insttoken=None)


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "c.duckdb"
        store.connect(self.db).close()
        self.calls = []

    def tearDown(self):
        self.tmp.cleanup()

    def _stub(self, fail_at=None, naming_fails=False):
        calls, db = self.calls, self.db

        def rec(name, fn=None):
            def f(*a, **k):
                calls.append(name)
                if name == fail_at:
                    raise RuntimeError("%s 실패" % name)
                return fn(*a, **k) if fn else {}
            return f

        async def collect(defn, settings, *, corpus, log, progress):
            calls.append("collect")
            progress(5, 20)
            c = store.connect()
            c.execute("INSERT INTO works (id,title,year,has_abstract,source,collected_at) "
                      "VALUES ('w1','t',2020,false,'test',CURRENT_TIMESTAMP)")
            store.add_members(c, corpus, ["w1"], "collect")
            c.commit()
            c.close()
            return {}

        async def backfill(settings, corpus, **k):
            calls.append("backfill")

        async def enrich(corpus, **k):
            calls.append("enrich")

        def project(model, corpus, log):
            calls.append("project")
            c = store.connect()
            c.execute("INSERT INTO runs (run_id,kind,model,created_at,corpus_id) "
                      "VALUES ('project-x','project',?,CURRENT_TIMESTAMP,?)", (model, corpus))
            c.commit()
            c.close()

        def naming(**k):
            calls.append("name")
            if naming_fails:
                raise RuntimeError("codex CLI가 PATH에 없다.")

        self.embedded = []

        def embed(model, log, progress, work_ids):
            calls.append("embed")
            self.embedded = work_ids

        return [
            mock.patch.object(store, "DB_PATH", db),
            mock.patch("constellation.ingest.collect.collect", collect),
            mock.patch("constellation.ingest.collect.backfill_citations", backfill),
            mock.patch("constellation.ingest.collect.enrich_abstracts", enrich),
            mock.patch("constellation.embed.run.embed_corpus", embed),
            mock.patch("constellation.analyze.project.project", project),
            mock.patch("constellation.analyze.cluster.cluster", rec("cluster")),
            mock.patch("constellation.analyze.hierarchy.build", rec("hierarchy")),
            mock.patch("constellation.analyze.naming.run", naming),
            mock.patch("constellation.analyze.flow.build", rec("flow")),
            mock.patch("constellation.analyze.lineage.build", rec("lineage")),
        ]

    def _build(self, **stub):
        events = []
        with ExitStack() as stack:
            for p in self._stub(**stub):
                stack.enter_context(p)
            try:
                pipeline.build(DEFN, events.append, KEY)
            except pipeline.StageError as e:
                return events, e
        return events, None

    def _status(self):
        c = store.connect(self.db, read_only=True)
        try:
            return c.execute("SELECT id, status, definition_json FROM corpora").fetchall()
        finally:
            c.close()

    def test_runs_all_stages_in_order_and_marks_ready(self):
        events, err = self._build(naming_fails=True)
        self.assertIsNone(err)
        self.assertEqual(self.calls, list(pipeline.STAGES))
        stages = [e for e in events if e["event"] == "stage"]
        self.assertEqual([e["index"] for e in stages], list(range(10)))
        self.assertTrue(all(e["count"] == 10 for e in stages))
        self.assertIn({"event": "progress", "stage": "collect", "done": 5, "total": 20}, events)
        self.assertEqual(events[0], {"event": "corpus", "corpus_id": "robot-learning"})
        self.assertEqual(events[-1], {"event": "done", "corpus_id": "robot-learning",
                                      "map_id": "project-x", "naming": "ctfidf"})
        self.assertTrue(any(e["event"] == "log" and e["stage"] == "name"
                            and "c-TF-IDF" in e["message"] for e in events))
        self.assertEqual(self.embedded, ["w1"])
        (cid, status, definition), = self._status()
        self.assertEqual(status, "ready")
        self.assertEqual(json.loads(definition)["terms"], ['"robot learning"'])

    def test_naming_success_reports_llm(self):
        events, _ = self._build()
        self.assertEqual(events[-1]["naming"], "llm")

    def test_failure_keeps_corpus_building_and_names_stage(self):
        events, err = self._build(fail_at="cluster")
        self.assertEqual(err.stage, "cluster")
        self.assertIn("cluster 실패", str(err))
        self.assertNotIn("hierarchy", self.calls)
        self.assertEqual(self._status()[0][1], "building")

    def test_missing_key_fails_before_creating_corpus(self):
        nokey = Settings(None, None, None, None)
        with mock.patch.object(store, "DB_PATH", self.db):
            with self.assertRaises(pipeline.StageError) as cm:
                pipeline.build(DEFN, lambda e: None, nokey)
        self.assertEqual(cm.exception.stage, "collect")
        self.assertEqual(self._status(), [])


class EventsModeTests(unittest.TestCase):
    def test_stdout_carries_only_json_events(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "d.json"
            f.write_text(json.dumps(DEFN.to_json()), encoding="utf-8")
            env = {**os.environ, "OPENALEX_API_KEY": "", "PYTHONPATH": str(ROOT / "backend"),
                   "CONSTELLATION_DB": str(Path(tmp) / "c.duckdb"),
                   "CONSTELLATION_DATA_DIR": tmp}
            p = subprocess.run(
                [sys.executable, "-m", "constellation.cli", "build", "-d", str(f), "--events"],
                capture_output=True, text=True, env=env, timeout=120)
        self.assertEqual(p.returncode, 1)
        lines = [json.loads(line) for line in p.stdout.splitlines()]
        self.assertEqual(lines, [{"event": "error", "stage": "collect",
                                  "message": "OPENALEX_API_KEY가 없습니다. 저장소의 .env에 넣으세요."}])

    def test_corpus_drop_command_refuses_ready_corpus(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "c.duckdb"
            c = store.connect(db)
            store.ensure_corpus(c, "done", "Done", status="ready")
            store.ensure_corpus(c, "half", "Half", status="building")
            c.close()
            (Path(tmp) / "models" / "half" / "scincl").mkdir(parents=True)
            env = {**os.environ, "PYTHONPATH": str(ROOT / "backend"),
                   "CONSTELLATION_DB": str(db), "CONSTELLATION_DATA_DIR": tmp}
            run = lambda cid: subprocess.run(
                [sys.executable, "-m", "constellation.cli", "corpus", "drop", "--id", cid,
                 "--only-building"], capture_output=True, text=True, env=env, timeout=120)
            self.assertEqual(run("done").returncode, 1)
            self.assertEqual(run("half").returncode, 0)
            self.assertFalse((Path(tmp) / "models" / "half").exists())
            c = store.connect(db, read_only=True)
            self.assertEqual(c.execute("SELECT id FROM corpora").fetchall(), [("done",)])
            c.close()


if __name__ == "__main__":
    unittest.main()
