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

    fn sql(&self) -> (String, Vec<Value>) {
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
    let (sql, values) = filter.sql();
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
    let (sql, values) = filter.sql();
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
    let refs_in_corpus: i64 = conn.query_row(
        "SELECT count(*) FROM citations c JOIN works w ON w.id = c.cited_id WHERE c.citing_id = ?",
        params![work_id],
        |r| r.get(0),
    )?;
    let cited_by_in_corpus: i64 = conn.query_row(
        "SELECT count(*) FROM citations c JOIN works w ON w.id = c.citing_id WHERE c.cited_id = ?",
        params![work_id],
        |r| r.get(0),
    )?;
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
    })
}
