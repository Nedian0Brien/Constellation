import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
import tempfile
from constellation.config import ROOT

class ConfigTests(unittest.TestCase):
    def test_data_override_resolves_from_repo_not_cwd(self):
        env={**os.environ, 'CONSTELLATION_DATA_DIR':'alternate-data'}
        output=subprocess.check_output([sys.executable,'-c',
            'import json; from constellation.config import DATA; print(json.dumps(str(DATA)))'],cwd=tempfile.gettempdir(),env=env,text=True)
        self.assertEqual(Path(json.loads(output)),ROOT/'alternate-data')
