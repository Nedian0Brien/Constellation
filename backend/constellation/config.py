"""설정. .env에서 읽고, 없으면 환경변수로 폴백한다."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"
DB_PATH = DATA / "constellation.duckdb"


def _load_dotenv(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


@dataclass(frozen=True)
class Settings:
    openalex_api_key: str | None
    openalex_mailto: str | None
    scopus_api_key: str | None
    scopus_insttoken: str | None

    @classmethod
    def load(cls) -> "Settings":
        _load_dotenv()
        g = lambda k: (os.environ.get(k) or "").strip() or None
        return cls(
            openalex_api_key=g("OPENALEX_API_KEY"),
            openalex_mailto=g("OPENALEX_MAILTO"),
            scopus_api_key=g("SCOPUS_API_KEY"),
            scopus_insttoken=g("SCOPUS_INSTTOKEN"),
        )
