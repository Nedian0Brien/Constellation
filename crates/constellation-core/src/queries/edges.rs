use duckdb::params;
use serde::Serialize;

use crate::{Database, Error, Result};

/// run 안에서 닫힌 인용 관계 전부. 지도가 마우스를 올린 논문의 이웃을 바로 그리려고
/// 한 번에 받는다(SciNCL run 10,604편에 62,703건).
///
/// `citing[k]`·`cited[k]`는 `/map` 배열의 인덱스다 — 둘 다 `projections`를 같은
/// `ORDER BY work_id`로 세므로 같은 자리를 가리킨다. 자기 인용과 run 밖 논문으로 가는
/// 인용은 뺀다. 열 단위 배열인 이유는 `MapData`와 같다.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct EdgesData {
    pub run_id: String,
    pub n: usize,
    pub citing: Vec<u32>,
    pub cited: Vec<u32>,
}

pub fn edges(db: &Database, run: &str) -> Result<EdgesData> {
    let conn = db.connect()?;
    let n: usize = conn.query_row(
        "SELECT count(*) FROM projections WHERE run_id = ?",
        params![run],
        |r| r.get::<_, i64>(0).map(|v| v as usize),
    )?;
    if n == 0 {
        return Err(Error::not_found(format!("run '{run}' 에 좌표가 없다")));
    }
    let mut stmt = conn.prepare(
        "WITH p AS (SELECT work_id, row_number() OVER (ORDER BY work_id) - 1 AS i \
                    FROM projections WHERE run_id = ?) \
         SELECT a.i, b.i FROM citations c \
         JOIN p a ON a.work_id = c.citing_id \
         JOIN p b ON b.work_id = c.cited_id \
         WHERE c.citing_id <> c.cited_id ORDER BY 1, 2",
    )?;
    let mut data = EdgesData {
        run_id: run.to_string(),
        n,
        citing: Vec::new(),
        cited: Vec::new(),
    };
    let mut rows = stmt.query(params![run])?;
    while let Some(r) = rows.next()? {
        data.citing.push(r.get::<_, i64>(0)? as u32);
        data.cited.push(r.get::<_, i64>(1)? as u32);
    }
    Ok(data)
}
