"""설정. .env에서 읽고, 없으면 환경변수로 폴백한다."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_load_dotenv()
# Explicit paths are resolved independently of the shell's current directory.
_data_override = os.environ.get("CONSTELLATION_DATA_DIR")
DATA = Path(_data_override).expanduser() if _data_override else ROOT / "data"
if not DATA.is_absolute():
    DATA = ROOT / DATA
RAW = DATA / "raw"
# 앱의 작업 실행기는 앱이 연 DB 파일을 그대로 넘긴다. 파일 이름이 달라도 된다.
_db_override = os.environ.get("CONSTELLATION_DB")
DB_PATH = Path(_db_override).expanduser() if _db_override else DATA / "constellation.duckdb"


@dataclass(frozen=True)
class Settings:
    openalex_api_key: str | None
    openalex_mailto: str | None
    scopus_api_key: str | None
    scopus_insttoken: str | None
    # 없어도 동작한다(공용 한도). 있으면 x-api-key로 보내고 초당 1회로 맞춘다.
    semantic_scholar_api_key: str | None = None

    @classmethod
    def load(cls) -> "Settings":
        _load_dotenv()
        g = lambda k: (os.environ.get(k) or "").strip() or None
        return cls(
            openalex_api_key=g("OPENALEX_API_KEY"),
            openalex_mailto=g("OPENALEX_MAILTO"),
            scopus_api_key=g("SCOPUS_API_KEY"),
            scopus_insttoken=g("SCOPUS_INSTTOKEN"),
            semantic_scholar_api_key=g("SEMANTIC_SCHOLAR_API_KEY"),
        )
