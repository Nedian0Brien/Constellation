import unittest
import tempfile
from pathlib import Path
from constellation.db import store, queries
from fixtures import populate

class QueryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'test.duckdb'
        populate(self.path)
        self.db = store.connect(self.path, read_only=True)
    def tearDown(self):
        self.db.close()
        self.temp.cleanup()
    def test_filter_same_in_map_and_list_and_includes_unknown_year(self):
        f = queries.PaperFilter('a', ' RETRIEVAL ', 2020, 2020)
        self.assertEqual(queries.matches(self.db, f)['ids'], ['1','2'])
        self.assertEqual([r['id'] for r in queries.papers(self.db, f)['items']], ['1','2'])
    def test_stable_paging_nulls_last_and_isolation(self):
        f=queries.PaperFilter('a')
        ids=[queries.papers(self.db,f,page=i,page_size=1)['items'][0]['id'] for i in range(1,5)]
        self.assertEqual(ids,['1','2','5','3'])
        self.assertEqual(queries.papers(self.db,f,page=9)['items'],[])
        self.assertEqual(queries.matches(self.db,queries.PaperFilter('b'))['ids'],['4'])
    def test_literal_search_and_empty_results(self):
        self.assertEqual(queries.matches(self.db,queries.PaperFilter('a','0%'))['ids'],['5'])
        self.assertEqual(queries.matches(self.db,queries.PaperFilter('a','zzzz'))['total'],0)
    def test_invalid_filters(self):
        for args in [('a','x'),('a','',2022,2020)]:
            with self.assertRaises(ValueError): queries.PaperFilter(*args)
