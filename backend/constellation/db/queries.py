"""Read-only, run-scoped paper queries shared by the list and the map."""
from dataclasses import dataclass


@dataclass(frozen=True)
class PaperFilter:
    run: str
    q: str = ""
    year_from: int | None = None
    year_to: int | None = None

    def __post_init__(self):
        object.__setattr__(self, "q", self.q.strip())
        if len(self.q) == 1:
            raise ValueError("검색어는 두 글자 이상 입력해주세요.")
        if self.year_from is not None and self.year_to is not None and self.year_from > self.year_to:
            raise ValueError("시작 연도는 종료 연도보다 클 수 없습니다.")

    def sql(self):
        terms, values = ["p.run_id = ?"], [self.run]
        if self.q:
            terms.append("(contains(lower(w.title), ?) OR contains(lower(coalesce(w.abstract, '')), ?))")
            values.extend([self.q.lower(), self.q.lower()])
        if self.year_from is not None:
            terms.append("(w.year IS NULL OR w.year >= ?)")
            values.append(self.year_from)
        if self.year_to is not None:
            terms.append("(w.year IS NULL OR w.year <= ?)")
            values.append(self.year_to)
        return " FROM projections p JOIN works w ON w.id = p.work_id WHERE " + " AND ".join(terms), values


def exists(conn, run):
    return conn.execute("SELECT 1 FROM runs WHERE run_id = ? AND kind = 'project'", [run]).fetchone() is not None


def matches(conn, filters):
    sql, params = filters.sql()
    ids = [row[0] for row in conn.execute("SELECT w.id" + sql + " ORDER BY w.id", params).fetchall()]
    return {"ids": ids, "total": len(ids)}


def papers(conn, filters, sort="cited", order="desc", page=1, page_size=25):
    if sort not in ("title", "year", "cited") or order not in ("asc", "desc"):
        raise ValueError("허용되지 않은 정렬입니다.")
    if page < 1 or not 1 <= page_size <= 100:
        raise ValueError("잘못된 페이지 범위입니다.")
    sql, params = filters.sql()
    total = conn.execute("SELECT count(*)" + sql, params).fetchone()[0]
    column = {"title": "lower(w.title)", "year": "w.year", "cited": "w.cited_by_count"}[sort]
    rows = conn.execute(
        "SELECT w.id, w.title, w.year, w.cited_by_count, w.has_abstract" + sql
        + f" ORDER BY {column} {order} NULLS LAST, w.id ASC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return {"items": [dict(zip(("id", "title", "year", "cited_by_count", "has_abstract"), row)) for row in rows],
            "total": total, "page": page, "page_size": page_size}
