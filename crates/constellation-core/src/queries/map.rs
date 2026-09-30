use duckdb::params;
use serde::Serialize;

use crate::{Database, Error, Result};

/// 좌표와 메타데이터를 열 단위 배열로 준다.
///
/// 객체 배열(`[{id, x, y}, ...]`)로 보내면 키 이름이 1만 번 반복된다. 열 단위면
/// 크기가 크게 줄고 deck.gl이 그대로 typed array로 받는다.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MapData {
    pub run_id: String,
    pub n: usize,
    pub id: Vec<String>,
    pub x: Vec<Option<f64>>,
    pub y: Vec<Option<f64>>,
    pub z: Vec<Option<f64>>,
    pub year: Vec<Option<i32>>,
    pub cited: Vec<i32>,
    pub has_abstract: Vec<bool>,
    pub title: Vec<String>,
    pub cluster: Vec<i32>,
}

/// run이 없으면 지도 목록(`runs`)의 첫 항목 — 분석이 끝난 기본 모델의 최신 지도.
pub fn map(db: &Database, run: Option<&str>) -> Result<MapData> {
    let run = match run.filter(|r| !r.is_empty()) {
        Some(r) => r.to_string(),
        None => super::runs(db)?
            .into_iter()
            .next()
            .map(|r| r.run_id)
            .ok_or_else(|| {
                Error::not_found("투영 결과가 없다. constellation project 를 돌려라.")
            })?,
    };
    let conn = db.connect()?;

    let mut stmt = conn.prepare(
        "SELECT p.work_id, p.x, p.y, p.z, w.year, w.cited_by_count, \
                w.has_abstract, w.title, coalesce(c.cluster_id, -1) \
         FROM projections p JOIN works w ON w.id = p.work_id \
         LEFT JOIN clusters c ON c.run_id = p.run_id AND c.work_id = p.work_id \
         WHERE p.run_id = ? ORDER BY p.work_id",
    )?;
    let mut data = MapData {
        run_id: run.clone(),
        n: 0,
        id: Vec::new(),
        x: Vec::new(),
        y: Vec::new(),
        z: Vec::new(),
        year: Vec::new(),
        cited: Vec::new(),
        has_abstract: Vec::new(),
        title: Vec::new(),
        cluster: Vec::new(),
    };
    let mut rows = stmt.query(params![run])?;
    while let Some(r) = rows.next()? {
        data.id.push(r.get(0)?);
        data.x.push(r.get(1)?);
        data.y.push(r.get(2)?);
        data.z.push(r.get(3)?);
        data.year.push(r.get(4)?);
        data.cited.push(r.get::<_, Option<i32>>(5)?.unwrap_or(0));
        data.has_abstract.push(r.get(6)?);
        data.title.push(r.get(7)?);
        data.cluster.push(r.get(8)?);
    }
    data.n = data.id.len();
    if data.n == 0 {
        return Err(Error::not_found(format!("run '{run}' 에 좌표가 없다")));
    }
    Ok(data)
}
