use duckdb::{params, OptionalExt};
use serde::Serialize;

use super::WorkBrief;
use crate::{split_keywords, Database, Error, Result};

/// 지도에 라벨을 얹기 위한 클러스터 목록 한 줄.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ClusterInfo {
    pub cluster_id: i32,
    pub label: Option<String>,
    pub keywords: Vec<String>,
    pub size: i32,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub year_median: Option<i32>,
    pub top_work_id: Option<String>,
    pub top_work_title: Option<String>,
}

pub fn clusters(db: &Database, run: &str) -> Result<Vec<ClusterInfo>> {
    let conn = db.connect()?;
    let mut stmt = conn.prepare(
        "SELECT m.cluster_id, m.label, m.keywords, m.size, m.x, m.y, \
                m.year_median, m.top_work_id, w.title \
         FROM cluster_meta m LEFT JOIN works w ON w.id = m.top_work_id \
         WHERE m.run_id = ? ORDER BY m.size DESC",
    )?;
    let rows = stmt
        .query_map(params![run], |r| {
            Ok(ClusterInfo {
                cluster_id: r.get(0)?,
                label: r.get(1)?,
                keywords: split_keywords(r.get(2)?),
                size: r.get(3)?,
                x: r.get(4)?,
                y: r.get(5)?,
                year_median: r.get(6)?,
                top_work_id: r.get(7)?,
                top_work_title: r.get(8)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct YearCount {
    pub year: i32,
    pub n: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ClusterDetail {
    pub cluster_id: i32,
    pub label: Option<String>,
    pub keywords: Vec<String>,
    pub size: i32,
    pub year_median: Option<i32>,
    pub top_works: Vec<WorkBrief>,
    pub by_year: Vec<YearCount>,
}

pub fn cluster_detail(db: &Database, run: &str, cluster_id: i32) -> Result<ClusterDetail> {
    let conn = db.connect()?;
    let meta: Option<(i32, Option<String>, Option<String>, i32, Option<i32>)> = conn
        .query_row(
            "SELECT cluster_id, label, keywords, size, year_median \
             FROM cluster_meta WHERE run_id = ? AND cluster_id = ?",
            params![run, cluster_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .optional()?;
    let (id, label, keywords, size, year_median) =
        meta.ok_or_else(|| Error::not_found(format!("없는 클러스터: {cluster_id}")))?;

    let top_works = conn
        .prepare(
            "SELECT w.id, w.title, w.year, coalesce(w.cited_by_count, 0) \
             FROM clusters c JOIN works w ON w.id = c.work_id \
             WHERE c.run_id = ? AND c.cluster_id = ? \
             ORDER BY w.cited_by_count DESC NULLS LAST LIMIT 12",
        )?
        .query_map(params![run, cluster_id], |r| {
            Ok(WorkBrief {
                id: r.get(0)?,
                title: r.get(1)?,
                year: r.get(2)?,
                cited: r.get(3)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let by_year = conn
        .prepare(
            "SELECT w.year, count(*) FROM clusters c JOIN works w ON w.id = c.work_id \
             WHERE c.run_id = ? AND c.cluster_id = ? AND w.year IS NOT NULL \
             GROUP BY w.year ORDER BY w.year",
        )?
        .query_map(params![run, cluster_id], |r| {
            Ok(YearCount {
                year: r.get(0)?,
                n: r.get(1)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(ClusterDetail {
        cluster_id: id,
        label,
        keywords: split_keywords(keywords),
        size,
        year_median,
        top_works,
        by_year,
    })
}
