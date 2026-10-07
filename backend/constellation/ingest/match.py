"""다른 출처의 논문 기록을 DB의 논문과 맞춘다.

S2 기록의 참고문헌·피인용과 추가할 논문을 OpenAlex로 모은 논문과 잇는 데 쓴다.
판정 순서는 DOI → MAG(`openalex:W{MAG}`, 제목이 같을 때만) → 정규화 제목+연도(차이 1 이하)다.

MAG를 제목 확인 없이 믿지 않는다. OpenAlex에는 제목이 다른 논문으로 덮인 기록이
있다(2026-10-06 실측: W3027879771).

정규화 제목은 `sources/base.norm_title`(소문자, 영숫자만)이고, SQL 쪽은
`regexp_replace(lower(title), '[^a-z0-9]', '', 'g')`로 같은 값을 만든다.
"""
from __future__ import annotations

from typing import Any

import duckdb
import pyarrow as pa

from ..sources.base import norm_doi, norm_title

SQL_TITLE = "regexp_replace(lower(%s), '[^a-z0-9]', '', 'g')"
SQL_DOI = "regexp_replace(lower(%s), '^https?://(dx\\.)?doi\\.org/', '')"
_STAGE = "_match_keys"


def keys_of(rec: dict[str, Any]) -> dict[str, Any]:
    """S2 기록(externalIds) 또는 OpenAlex 원본 행(doi) → 맞추기 키."""
    ext = rec.get("externalIds") or {}
    return {
        "doi": norm_doi(ext.get("DOI") or rec.get("doi")),
        "mag": str(ext["MAG"]) if ext.get("MAG") else None,
        "title": norm_title(rec.get("title")) or None,
        "year": rec.get("year") if rec.get("year") is not None else rec.get("publication_year"),
    }


def match_works(
    conn: duckdb.DuckDBPyConnection, keys: list[dict[str, Any]], run_id: str | None = None,
) -> list[str | None]:
    """키마다 DB 논문 id(없으면 None). run_id를 주면 그 지도에 있는 논문만 본다."""
    if not keys:
        return []
    tbl = pa.table({
        "i": pa.array(list(range(len(keys))), type=pa.int64()),
        "doi": pa.array([k.get("doi") for k in keys], type=pa.string()),
        "mag": pa.array(["openalex:W" + k["mag"] if k.get("mag") else None for k in keys],
                        type=pa.string()),
        "title": pa.array([k.get("title") for k in keys], type=pa.string()),
        "year": pa.array([k.get("year") for k in keys], type=pa.int64()),
    })
    scope = ("JOIN projections p ON p.work_id = w.id AND p.run_id = $run" if run_id else "")
    conn.register(_STAGE, tbl)
    try:
        rows = conn.execute(
            f"""
            WITH w AS (
                SELECT w.id, {SQL_DOI % 'w.doi'} AS doi, {SQL_TITLE % 'w.title'} AS title, w.year
                FROM works w {scope}
            )
            SELECT k.i,
                   (SELECT min(w.id) FROM w WHERE k.doi IS NOT NULL AND w.doi = k.doi),
                   (SELECT min(w.id) FROM w WHERE w.id = k.mag AND w.title = k.title),
                   (SELECT min(w.id) FROM w WHERE k.title IS NOT NULL AND k.title <> ''
                      AND w.title = k.title
                      AND (k.year IS NULL OR w.year IS NULL OR abs(w.year - k.year) <= 1))
            FROM {_STAGE} k ORDER BY k.i
            """,
            {"run": run_id} if run_id else {},
        ).fetchall()
    finally:
        conn.unregister(_STAGE)
    return [by_doi or by_mag or by_title for _, by_doi, by_mag, by_title in rows]
