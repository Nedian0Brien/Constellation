"""naming의 순수 함수와 저장 경로. CLI는 부르지 않는다 — 가짜 Namer로 대신한다."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from constellation.analyze import naming
from constellation.db import store


class MalformedTests(unittest.TestCase):
    def test_accepts_plain_and_compound(self):
        self.assertIsNone(naming.is_malformed("Dense Retrieval"))
        self.assertIsNone(naming.is_malformed(
            "Private Information Retrieval and Quantum Theory · Software Bug Localization",
            coherent=False))

    def test_rejects(self):
        self.assertEqual(naming.is_malformed(""), "빈 출력")
        self.assertEqual(naming.is_malformed("신문 검색"), "영어가 아님")
        self.assertEqual(naming.is_malformed("Mixed: A and B"), "Mixed 접두")
        self.assertEqual(naming.is_malformed("a b c d e f g h i"), "너무 김")
        self.assertEqual(naming.is_malformed("A · ", coherent=False), "빈 쪽")


class CheckNamesTests(unittest.TestCase):
    def test_missing_and_bad_go_to_retry(self):
        ok, bad = naming.check_names([1, 2, 3, 4], {"names": [
            {"id": 1, "name": "Name: Federated Learning", "coherent": True},
            {"id": 2, "name": "Mixed: A and B", "coherent": False},
            {"id": 4, "name": "A · B", "coherent": False},
            {"id": 9, "name": "Not Asked", "coherent": True},
        ]})
        self.assertEqual(ok, {1: ("Federated Learning", True), 4: ("A · B", False)})
        self.assertEqual(bad, [2, 3])


class SplitLevelsTests(unittest.TestCase):
    #        6
    #      /   \
    #     4     5
    #    / \   / \
    #   0   1 2   3
    children = {0: (None, None), 1: (None, None), 2: (None, None), 3: (None, None),
                4: (0, 1), 5: (2, 3), 6: (4, 5)}

    def test_expands_incoherent_at_every_level_and_keeps_leaf_level(self):
        levels = {0: [4, 5], 1: [4, 2, 3], 2: [0, 1, 2, 3]}
        out = naming.split_levels(levels, self.children, {4: False, 5: True})
        self.assertEqual(out, {0: [0, 1, 5], 1: [0, 1, 2, 3], 2: [0, 1, 2, 3]})

    def test_recurses_and_ignores_leaf_flags(self):
        levels = {0: [6], 1: [0, 1, 2, 3]}
        out = naming.split_levels(levels, self.children, {6: False, 4: False, 0: False})
        self.assertEqual(out, {0: [0, 1, 5], 1: [0, 1, 2, 3]})


class FakeNamer:
    label = "fake/test"

    def __init__(self, answers):
        self.answers = list(answers)
        self.prompts = []

    def complete(self, prompt):
        self.prompts.append(prompt)
        return self.answers.pop(0)


def _populate(path: Path):
    c = store.connect(path)
    c.execute("INSERT INTO runs (run_id,kind,model,created_at) VALUES "
              "('r','project','scincl',CURRENT_TIMESTAMP)")
    c.execute("INSERT INTO works (id,title,abstract,year,cited_by_count,has_abstract,"
              "source,collected_at) VALUES "
              "('w1','Dense passage retrieval','a',2020,10,true,'t',CURRENT_TIMESTAMP),"
              "('w2','Music genre tagging','a',2020,5,true,'t',CURRENT_TIMESTAMP),"
              "('w3','Arabic stemming','a',2020,3,true,'t',CURRENT_TIMESTAMP)")
    c.execute("INSERT INTO clusters (run_id,work_id,cluster_id,probability) VALUES "
              "('r','w1',0,1),('r','w2',1,1),('r','w3',2,1)")
    c.execute("INSERT INTO cluster_meta (run_id,cluster_id,label,keywords,size,x,y) VALUES "
              "('r',0,'dense · passage','dense, passage, bert',3,0,0),"
              "('r',1,'music · audio','music, audio, genre',2,1,1),"
              "('r',2,'arabic · stemming','arabic, stemming, clir',2,2,2)")
    c.execute("INSERT INTO cluster_tree (run_id,node_id,parent_id,left_id,right_id,height,"
              "size,n_leaves,cluster_id,x,y,leaf_order,label,label_src,keywords) VALUES "
              "('r',0,4,NULL,NULL,0,3,1,0,0,0,0,'dense · passage','ctfidf','dense, passage, bert'),"
              "('r',1,3,NULL,NULL,0,2,1,1,1,1,1,'music · audio','ctfidf','music, audio, genre'),"
              "('r',2,3,NULL,NULL,0,2,1,2,2,2,2,'arabic · stemming','ctfidf','arabic, stemming, clir'),"
              "('r',3,4,1,2,1,4,2,NULL,1.5,1.5,NULL,'music · arabic','ctfidf','music, arabic, audio'),"
              "('r',4,NULL,0,3,2,7,3,NULL,1,1,NULL,'dense · music','ctfidf','dense, music, arabic')")
    c.execute("INSERT INTO tree_levels (run_id,level,k,node_id) VALUES "
              "('r',0,2,0),('r',0,2,3),('r',1,3,0),('r',1,3,1),('r',1,3,2)")
    c.commit()
    c.close()


class RunTests(unittest.TestCase):
    def test_names_splits_and_audits(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / "t.duckdb"
            _populate(db)
            namer = FakeNamer([
                {"names": [{"id": 0, "name": "Dense Retrieval", "coherent": True},
                           {"id": 1, "name": "Music Information Retrieval", "coherent": True},
                           {"id": 2, "name": "신문 검색", "coherent": True}]},
                {"names": [{"id": 2, "name": "Arabic Text Processing", "coherent": True}]},
                {"names": [{"id": 3, "name": "Music Information Retrieval · Arabic Text Processing",
                            "coherent": False},
                           {"id": 4, "name": "Broken", "coherent": True, "extra": 1}]},
            ])
            with mock.patch.object(store, "DB_PATH", db):
                r = naming.run(run_id="r", namer=namer, log=lambda s: None)
            self.assertEqual(r["n"], 5)
            self.assertEqual(r["levels"], {0: 3, 1: 3})
            self.assertEqual(r["splits"], [(0, [3], 3)])
            # 잎 프롬프트에는 제목이, 내부 프롬프트에는 새 잎 이름이 들어간다
            self.assertIn("Dense passage retrieval", namer.prompts[0])
            self.assertIn("[id 2]", namer.prompts[1])
            self.assertIn("Group A (3 papers): Dense Retrieval (3)", namer.prompts[2])
            self.assertIn("Music Information Retrieval (2), Arabic Text Processing (2)",
                          namer.prompts[2])

            c = store.connect(db, read_only=True)
            rows = dict(c.execute(
                "SELECT node_id, label FROM cluster_tree WHERE run_id='r'").fetchall())
            self.assertEqual(rows[2], "Arabic Text Processing")
            self.assertEqual(rows[3], "Music Information Retrieval · Arabic Text Processing")
            self.assertEqual(rows[4], "Broken")
            self.assertEqual(
                c.execute("SELECT label FROM cluster_meta WHERE cluster_id=0").fetchone()[0],
                "Dense Retrieval")
            self.assertEqual(
                c.execute("SELECT node_id FROM tree_levels WHERE level=0 ORDER BY node_id")
                .fetchall(), [(0,), (1,), (2,)])
            self.assertEqual(
                c.execute("SELECT k FROM tree_levels WHERE level=0 LIMIT 1").fetchone()[0], 3)
            audit = dict(c.execute(
                "SELECT node_id, output FROM naming_audit WHERE run_id='r'").fetchall())
            self.assertEqual(len(audit), 5)
            self.assertIn('"coherent": false', audit[3])
            self.assertEqual(
                c.execute("SELECT DISTINCT model FROM naming_audit").fetchone()[0], "fake/test")
            c.close()

    def test_fallback_keeps_ctfidf(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / "t.duckdb"
            _populate(db)
            namer = FakeNamer([{"names": []}, {"names": []}, {"names": []}, {"names": []}])
            with mock.patch.object(store, "DB_PATH", db):
                r = naming.run(run_id="r", namer=namer, log=lambda s: None)
            self.assertEqual(r["fallback"], 5)
            c = store.connect(db, read_only=True)
            self.assertEqual(
                c.execute("SELECT label, label_src FROM cluster_tree WHERE node_id=4").fetchone(),
                ("dense · music · arabic", "ctfidf"))
            c.close()


if __name__ == "__main__":
    unittest.main()
