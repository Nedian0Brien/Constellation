import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from constellation.api.app import app
from constellation.db import store
from fixtures import populate

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'test.duckdb'
        populate(self.path)
        self.patcher=patch('constellation.api.app._conn',lambda:store.connect(self.path,read_only=True))
        self.patcher.start()
        self.client=TestClient(app)
    def tearDown(self):
        self.client.close();self.patcher.stop();self.temp.cleanup()
    def test_list_and_matches(self):
        params={'run':'a','q':'retrieval','year_from':2020,'year_to':2020}
        a=self.client.get('/api/works',params=params).json()
        b=self.client.get('/api/matches',params=params).json()
        self.assertEqual(a['total'],b['total'])
        self.assertEqual([r['id'] for r in a['items']],b['ids'])
    def test_bad_queries(self):
        for suffix in ['&q=x','&year_from=2022&year_to=2020','&sort=bad','&page=0','&page_size=101']:
            self.assertEqual(self.client.get('/api/works?run=a'+suffix).status_code,422)
        self.assertEqual(self.client.get('/api/works?run=missing').status_code,404)
    def test_detail_scope(self):
        self.assertEqual(self.client.get('/api/works/4?run=a').status_code,404)
        self.assertEqual(self.client.get('/api/works/1?run=a').status_code,200)
