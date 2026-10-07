use duckdb::{params, params_from_iter, types::Value, OptionalExt};
use serde::{Deserialize, Serialize};

use crate::{Database, Error, Result};

/// 목록과 지도가 같은 조건을 쓴다. Python의 `PaperFilter`.
#[derive(Debug, Clone, Default, Deserialize, PartialEq)]
pub struct PaperFilter {
    pub run: String,
    #[serde(default)]
    pub q: String,
    #[serde(default)]
    pub year_from: Option<i32>,
    #[serde(default)]
    pub year_to: Option<i32>,
    /// true면 사용자가 추가한 논문만, false면 수집으로 들어온 논문만.
    #[serde(default)]
    pub added: Option<bool>,
}

impl PaperFilter {
    /// 검증하고 검색어를 다듬는다. 1자 검색과 역전된 연도는 422.
    pub fn validated(mut self) -> Result<Self> {
        if self.run.is_empty() || self.run.len() > 200 {
            return Err(Error::invalid("run 값이 잘못되었습니다."));
        }
        if self.q.len() > 500 {
            return Err(Error::invalid("검색어가 너무 깁니다."));
        }
        self.q = self.q.trim().to_string();
        if self.q.chars().count() == 1 {
            return Err(Error::invalid("검색어는 두 글자 이상 입력해주세요."));
        }
        for y in [self.year_from, self.year_to].into_iter().flatten() {
            if !(0..=9999).contains(&y) {
                return Err(Error::invalid("연도 값이 잘못되었습니다."));
            }
        }
        if let (Some(a), Some(b)) = (self.year_from, self.year_to) {
            if a > b {
                return Err(Error::invalid("시작 연도는 종료 연도보다 클 수 없습니다."));
            }
        }
        Ok(self)
    }

    fn sql(&self, added_expr: &str) -> (String, Vec<Value>) {
        let mut terms = vec!["p.run_id = ?".to_string()];
        let mut values = vec![Value::Text(self.run.clone())];
        if !self.q.is_empty() {
            terms.push(
                "(contains(lower(w.title), ?) OR contains(lower(coalesce(w.abstract, '')), ?))"
                    .to_string(),
            );
            let needle = self.q.to_lowercase();
            values.push(Value::Text(needle.clone()));
            values.push(Value::Text(needle));
        }
        if let Some(y) = self.year_from {
            terms.push("(w.year IS NULL OR w.year >= ?)".to_string());
            values.push(Value::Int(y));
        }
        if let Some(y) = self.year_to {
            terms.push("(w.year IS NULL OR w.year <= ?)".to_string());
            values.push(Value::Int(y));
        }
        match self.added {
            Some(true) => terms.push(added_expr.to_string()),
            Some(false) => terms.push(format!("NOT {added_expr}")),
            None => {}
        }
        (
            format!(
                " FROM projections p JOIN works w ON w.id = p.work_id WHERE {}",
                terms.join(" AND ")
            ),
            values,
        )
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Sort {
    Title,
    Year,
    Cited,
}

impl Sort {
    pub fn parse(s: &str) -> Result<Self> {
        match s {
            "title" => Ok(Self::Title),
            "year" => Ok(Self::Year),
            "cited" => Ok(Self::Cited),
            _ => Err(Error::invalid("허용되지 않은 정렬입니다.")),
        }
    }
    fn column(self) -> &'static str {
        match self {
            Self::Title => "lower(w.title)",
            Self::Year => "w.year",
            Self::Cited => "w.cited_by_count",
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Order {
    Asc,
    Desc,
}

impl Order {
    pub fn parse(s: &str) -> Result<Self> {
        match s {
            "asc" => Ok(Self::Asc),
            "desc" => Ok(Self::Desc),
            _ => Err(Error::invalid("허용되지 않은 정렬입니다.")),
        }
    }
    fn keyword(self) -> &'static str {
        match self {
            Self::Asc => "asc",
            Self::Desc => "desc",
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PaperRow {
    pub id: String,
    pub title: String,
    pub year: Option<i32>,
    pub cited_by_count: Option<i32>,
    pub has_abstract: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PaperPage {
    pub items: Vec<PaperRow>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Matches {
    pub ids: Vec<String>,
    pub total: usize,
}

fn require_run(conn: &duckdb::Connection, run: &str) -> Result<()> {
    let found: Option<i32> = conn
        .query_row(
            "SELECT 1 FROM runs WHERE run_id = ? AND kind = 'project'",
            params![run],
            |r| r.get(0),
        )
        .optional()?;
    if found.is_none() {
        return Err(Error::not_found("분석 실행을 찾을 수 없습니다."));
    }
    Ok(())
}

/// 논문 목록 한 페이지. 서버 정렬·페이지. 동률은 논문 id로 정렬한다.
pub fn works(
    db: &Database,
    filter: PaperFilter,
    sort: Sort,
    order: Order,
    page: u32,
    page_size: u32,
) -> Result<PaperPage> {
    if page < 1 || page > 1_000_000 || !(1..=100).contains(&page_size) {
        return Err(Error::invalid("잘못된 페이지 범위입니다."));
    }
    let filter = filter.validated()?;
    let conn = db.connect()?;
    require_run(&conn, &filter.run)?;
    let (sql, values) = filter.sql(super::runs::added_expr(&conn)?);
    let total: i64 = conn.query_row(
        &format!("SELECT count(*){sql}"),
        params_from_iter(values.iter().cloned()),
        |r| r.get(0),
    )?;
    let mut page_values = values.clone();
    page_values.push(Value::Int(page_size as i32));
    page_values.push(Value::Int(((page - 1) * page_size) as i32));
    let items = conn
        .prepare(&format!(
            "SELECT w.id, w.title, w.year, w.cited_by_count, w.has_abstract{sql} \
             ORDER BY {} {} NULLS LAST, w.id ASC LIMIT ? OFFSET ?",
            sort.column(),
            order.keyword()
        ))?
        .query_map(params_from_iter(page_values), |r| {
            Ok(PaperRow {
                id: r.get(0)?,
                title: r.get(1)?,
                year: r.get(2)?,
                cited_by_count: r.get(3)?,
                has_abstract: r.get(4)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(PaperPage {
        items,
        total,
        page,
        page_size,
    })
}

/// 같은 조건에 맞는 논문 id 전체. 지도 강조와 건수에 쓴다.
pub fn matches(db: &Database, filter: PaperFilter) -> Result<Matches> {
    let filter = filter.validated()?;
    let conn = db.connect()?;
    require_run(&conn, &filter.run)?;
    let (sql, values) = filter.sql(super::runs::added_expr(&conn)?);
    let ids = conn
        .prepare(&format!("SELECT w.id{sql} ORDER BY w.id"))?
        .query_map(params_from_iter(values), |r| r.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let total = ids.len();
    Ok(Matches { ids, total })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Topic {
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Work {
    pub id: String,
    pub doi: Option<String>,
    pub title: String,
    #[serde(rename = "abstract")]
    pub abstract_: Option<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub cited_by_count: Option<i32>,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub source: String,
    pub authors: Vec<String>,
    pub topics: Vec<Topic>,
    pub refs_in_corpus: i64,
    pub cited_by_in_corpus: i64,
    /// 사용자가 지도에 추가한 시각. run이 있으면 그 지도의 코퍼스 기준이다.
    pub added_at: Option<String>,
}

/// 논문 상세. run이 주어지면 그 run에 투영된 논문만 준다.
pub fn work(db: &Database, work_id: &str, run: Option<&str>) -> Result<Work> {
    let conn = db.connect()?;
    if let Some(run) = run.filter(|r| !r.is_empty()) {
        let inside: Option<i32> = conn
            .query_row(
                "SELECT 1 FROM projections WHERE run_id = ? AND work_id = ?",
                params![run, work_id],
                |r| r.get(0),
            )
            .optional()?;
        if inside.is_none() {
            return Err(Error::not_found("현재 분석에 포함되지 않은 논문입니다."));
        }
    }
    type Row = (
        String,
        Option<String>,
        String,
        Option<String>,
        Option<i32>,
        Option<String>,
        Option<i32>,
        Option<String>,
        String,
    );
    let row: Option<Row> = conn
        .query_row(
            "SELECT id, doi, title, abstract, year, venue, cited_by_count, type, source \
             FROM works WHERE id = ?",
            params![work_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                ))
            },
        )
        .optional()?;
    let (id, doi, title, abstract_, year, venue, cited_by_count, type_, source) =
        row.ok_or_else(|| Error::not_found(format!("없는 논문: {work_id}")))?;

    let authors = conn
        .prepare(
            "SELECT a.name FROM work_authors wa JOIN authors a ON a.id = wa.author_id \
             WHERE wa.work_id = ? ORDER BY wa.position LIMIT 25",
        )?
        .query_map(params![work_id], |r| r.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let topics = conn
        .prepare(
            "SELECT topic, kind FROM work_topics WHERE work_id = ? \
             ORDER BY score DESC NULLS LAST LIMIT 12",
        )?
        .query_map(params![work_id], |r| {
            Ok(Topic {
                name: r.get(0)?,
                kind: r.get(1)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    // "코퍼스 안" 인용은 지금 보고 있는 지도에 있는 논문과의 인용이다. DB 하나에
    // 코퍼스가 여럿이므로 works 전체와 조인하면 다른 코퍼스 논문까지 센다.
    let in_map = |side: &str, me: &str| -> Result<i64> {
        Ok(match run.filter(|r| !r.is_empty()) {
            Some(run) => conn.query_row(
                &format!(
                    "SELECT count(*) FROM citations c JOIN projections p \
                     ON p.work_id = c.{side} AND p.run_id = ? WHERE c.{me} = ?"
                ),
                params![run, work_id],
                |r| r.get(0),
            )?,
            None => conn.query_row(
                &format!(
                    "SELECT count(*) FROM citations c JOIN works w ON w.id = c.{side} \
                     WHERE c.{me} = ?"
                ),
                params![work_id],
                |r| r.get(0),
            )?,
        })
    };
    let refs_in_corpus = in_map("cited_id", "citing_id")?;
    let cited_by_in_corpus = in_map("citing_id", "cited_id")?;
    let added_at: Option<String> = if super::runs::has_corpus_columns(&conn)? {
        conn.query_row(
            "SELECT CAST(min(m.added_at) AS VARCHAR) FROM corpus_works m \
             WHERE m.work_id = ? AND m.via = 'manual' AND (? IS NULL OR m.corpus_id = \
               (SELECT corpus_id FROM runs WHERE run_id = ?))",
            params![work_id, run, run],
            |r| r.get(0),
        )?
    } else {
        None
    };
    Ok(Work {
        id,
        doi,
        title,
        abstract_,
        year,
        venue,
        cited_by_count,
        type_,
        source,
        authors,
        topics,
        refs_in_corpus,
        cited_by_in_corpus,
        added_at,
    })
}

/// 외부 검색 결과의 논문들이 지도에 있는지, 추가한 논문인지.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Membership {
    pub id: String,
    pub in_map: bool,
    pub added: bool,
}

/// 소속을 판정할 논문. 다른 출처의 id(`s2:…`)라도 DOI나 제목+연도가 같으면 지도에 있는 것으로 본다.
#[derive(Debug, Clone, Default, Deserialize, PartialEq)]
pub struct PaperKey {
    pub id: String,
    #[serde(default)]
    pub doi: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub year: Option<i32>,
}

/// DOI 비교 형식: 소문자, `https://doi.org/` 제거. Python `sources.base.norm_doi`와 같다.
pub fn norm_doi(doi: &str) -> Option<String> {
    let d = doi.trim().to_lowercase();
    let d = ["https://doi.org/", "http://doi.org/", "https://dx.doi.org/", "http://dx.doi.org/"]
        .iter()
        .find_map(|p| d.strip_prefix(p))
        .unwrap_or(&d)
        .to_string();
    (!d.is_empty()).then_some(d)
}

/// 제목 비교 형식: 소문자에서 a–z·0–9만 남긴다. Python `sources.base.norm_title`과 같고,
/// SQL 쪽은 `regexp_replace(lower(title), '[^a-z0-9]', '', 'g')`다.
pub fn norm_title(title: &str) -> Option<String> {
    let t: String = title
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        .collect();
    (!t.is_empty()).then_some(t)
}

pub fn membership(db: &Database, run: &str, keys: &[PaperKey]) -> Result<Vec<Membership>> {
    let conn = db.connect()?;
    require_run(&conn, run)?;
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let added = super::runs::added_expr(&conn)?;
    let mut out = Vec::with_capacity(keys.len());
    // duckdb-rs는 목록 인자를 바인딩하지 못한다. 검색 한 페이지(25편) 단위라 VALUES 행을 늘린다.
    for chunk in keys.chunks(200) {
        let rows = vec!["(?::INTEGER, ?::VARCHAR, ?::VARCHAR, ?::VARCHAR, ?::INTEGER)"; chunk.len()]
            .join(",");
        let sql = format!(
            "WITH k(i, id, doi, title, year) AS (VALUES {rows}), \
             m AS (SELECT p.work_id AS id, \
                     regexp_replace(lower(w.doi), '^https?://(dx\\.)?doi\\.org/', '') AS doi, \
                     regexp_replace(lower(w.title), '[^a-z0-9]', '', 'g') AS title, \
                     w.year, {added} AS added \
                   FROM projections p JOIN works w ON w.id = p.work_id WHERE p.run_id = ?) \
             SELECT k.i, count(m.id) > 0, coalesce(bool_or(m.added), false) FROM k \
             LEFT JOIN m ON m.id = k.id \
               OR (k.doi IS NOT NULL AND m.doi = k.doi) \
               OR (k.title IS NOT NULL AND m.title = k.title \
                   AND (k.year IS NULL OR m.year IS NULL OR abs(m.year - k.year) <= 1)) \
             GROUP BY k.i ORDER BY k.i"
        );
        let mut values = Vec::with_capacity(chunk.len() * 5 + 1);
        for (i, k) in chunk.iter().enumerate() {
            values.push(Value::Int(i as i32));
            values.push(Value::Text(k.id.clone()));
            values.push(k.doi.as_deref().and_then(norm_doi).map_or(Value::Null, Value::Text));
            values.push(k.title.as_deref().and_then(norm_title).map_or(Value::Null, Value::Text));
            values.push(k.year.map_or(Value::Null, Value::Int));
        }
        values.push(Value::Text(run.to_string()));
        let flags = conn
            .prepare(&sql)?
            .query_map(params_from_iter(values), |r| Ok((r.get::<_, bool>(1)?, r.get::<_, bool>(2)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        out.extend(chunk.iter().zip(flags).map(|(k, (in_map, added))| Membership {
            id: k.id.clone(),
            in_map,
            added,
        }));
    }
    Ok(out)
}

/// 인용 목록의 방향. `Both`가 기본이다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    References,
    CitedBy,
    Both,
}

impl Direction {
    pub fn parse(s: &str) -> Result<Self> {
        match s {
            "references" => Ok(Self::References),
            "cited_by" => Ok(Self::CitedBy),
            "both" => Ok(Self::Both),
            _ => Err(Error::invalid("허용되지 않은 방향입니다.")),
        }
    }
}

/// 인용 목록의 한 줄. `cluster`는 그 run에서의 주제이고 run 밖이면 None이다.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CitedWork {
    pub id: String,
    pub title: String,
    pub year: Option<i32>,
    pub cited: i32,
    pub cluster: Option<i32>,
}

/// 논문 하나의 코퍼스 안 참고문헌·피인용. 총계는 limit·방향과 무관하다.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Citations {
    pub id: String,
    pub references: Vec<CitedWork>,
    pub cited_by: Vec<CitedWork>,
    pub ref_total: i64,
    pub cited_by_total: i64,
}

/// 참고문헌·피인용 목록. 코퍼스(`works`)에 있는 논문만 세고 피인용 순으로 `limit`개.
pub fn citations(
    db: &Database,
    run: &str,
    work_id: &str,
    direction: Direction,
    limit: u32,
) -> Result<Citations> {
    if !(1..=500).contains(&limit) {
        return Err(Error::invalid("limit은 1 이상 500 이하여야 합니다."));
    }
    let conn = db.connect()?;
    let exists: Option<i32> = conn
        .query_row("SELECT 1 FROM works WHERE id = ?", params![work_id], |r| {
            r.get(0)
        })
        .optional()?;
    if exists.is_none() {
        return Err(Error::not_found(format!("없는 논문: {work_id}")));
    }
    // `side`는 목록에 나올 쪽, `me`는 주어진 논문이 놓인 쪽이다.
    let list = |side: &str, me: &str| -> Result<Vec<CitedWork>> {
        let sql = format!(
            "SELECT w.id, w.title, w.year, coalesce(w.cited_by_count, 0), k.cluster_id \
             FROM citations c JOIN works w ON w.id = c.{side} \
             JOIN projections p ON p.work_id = w.id AND p.run_id = ? \
             LEFT JOIN clusters k ON k.run_id = p.run_id AND k.work_id = w.id \
             WHERE c.{me} = ? \
             ORDER BY w.cited_by_count DESC NULLS LAST, w.id LIMIT ?"
        );
        let rows = conn
            .prepare(&sql)?
            .query_map(params![run, work_id, limit as i64], |r| {
                Ok(CitedWork {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    year: r.get(2)?,
                    cited: r.get(3)?,
                    cluster: r.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    };
    let count = |side: &str, me: &str| -> Result<i64> {
        let sql = format!(
            "SELECT count(*) FROM citations c JOIN projections p \
             ON p.work_id = c.{side} AND p.run_id = ? WHERE c.{me} = ?"
        );
        Ok(conn.query_row(&sql, params![run, work_id], |r| r.get(0))?)
    };
    let references = if direction != Direction::CitedBy {
        list("cited_id", "citing_id")?
    } else {
        Vec::new()
    };
    let cited_by = if direction != Direction::References {
        list("citing_id", "cited_id")?
    } else {
        Vec::new()
    };
    Ok(Citations {
        id: work_id.to_string(),
        references,
        cited_by,
        ref_total: count("cited_id", "citing_id")?,
        cited_by_total: count("citing_id", "cited_id")?,
    })
}
