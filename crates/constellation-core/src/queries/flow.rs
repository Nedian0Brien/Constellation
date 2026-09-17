use duckdb::params;
use serde::Serialize;

use super::WorkBrief;
use crate::{split_keywords, Database, Error, Result};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct FlowWindow {
    pub idx: i32,
    pub year_from: i32,
    pub year_to: i32,
    pub n_works: i32,
    pub n_clusters: i32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct FlowCluster {
    pub window: i32,
    pub id: i32,
    pub label: Option<String>,
    pub label_src: Option<String>,
    pub keywords: Vec<String>,
    pub size: i32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct FlowEdge {
    pub from_window: i32,
    pub from_cluster: i32,
    pub to_window: i32,
    pub to_cluster: i32,
    pub weight: f64,
    pub citation: f64,
    pub semantic: f64,
    pub author: f64,
    pub n_papers: Option<i32>,
}

/// 시간 창별 클러스터와 그 사이 흐름.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct FlowData {
    pub run_id: String,
    pub windows: Vec<FlowWindow>,
    pub clusters: Vec<FlowCluster>,
    pub flows: Vec<FlowEdge>,
}

pub fn flow(db: &Database, run: &str) -> Result<FlowData> {
    let conn = db.connect()?;
    let windows = conn
        .prepare(
            "SELECT window_idx, year_from, year_to, n_works, n_clusters \
             FROM flow_windows WHERE run_id = ? ORDER BY window_idx",
        )?
        .query_map(params![run], |r| {
            Ok(FlowWindow {
                idx: r.get(0)?,
                year_from: r.get(1)?,
                year_to: r.get(2)?,
                n_works: r.get(3)?,
                n_clusters: r.get(4)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    if windows.is_empty() {
        return Err(Error::not_found(
            "이 분석에는 시간대별 흐름 결과가 없습니다.",
        ));
    }
    let clusters = conn
        .prepare(
            "SELECT window_idx, cluster_id, label, label_src, keywords, size \
             FROM flow_clusters WHERE run_id = ? ORDER BY window_idx, -size",
        )?
        .query_map(params![run], |r| {
            Ok(FlowCluster {
                window: r.get(0)?,
                id: r.get(1)?,
                label: r.get(2)?,
                label_src: r.get(3)?,
                keywords: split_keywords(r.get(4)?),
                size: r.get(5)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let flows = conn
        .prepare(
            "SELECT from_window, from_cluster, to_window, to_cluster, weight, \
                    w_citation, w_semantic, w_author, n_papers \
             FROM flows WHERE run_id = ? ORDER BY to_window, to_cluster, -weight",
        )?
        .query_map(params![run], |r| {
            Ok(FlowEdge {
                from_window: r.get(0)?,
                from_cluster: r.get(1)?,
                to_window: r.get(2)?,
                to_cluster: r.get(3)?,
                weight: r.get(4)?,
                citation: r.get(5)?,
                semantic: r.get(6)?,
                author: r.get(7)?,
                n_papers: r.get(8)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(FlowData {
        run_id: run.to_string(),
        windows,
        clusters,
        flows,
    })
}

/// 한 창-클러스터에 속한 논문들 (피인용 상위).
pub fn flow_papers(
    db: &Database,
    run: &str,
    window: i32,
    cluster: i32,
    limit: u32,
) -> Result<Vec<WorkBrief>> {
    if limit > 60 {
        return Err(Error::invalid("limit은 60 이하여야 합니다."));
    }
    let conn = db.connect()?;
    let rows = conn
        .prepare(
            "SELECT w.id, w.title, w.year, coalesce(w.cited_by_count, 0) \
             FROM flow_members m JOIN works w ON w.id = m.work_id \
             WHERE m.run_id = ? AND m.window_idx = ? AND m.cluster_id = ? \
             ORDER BY w.cited_by_count DESC NULLS LAST LIMIT ?",
        )?
        .query_map(params![run, window, cluster, limit], |r| {
            Ok(WorkBrief {
                id: r.get(0)?,
                title: r.get(1)?,
                year: r.get(2)?,
                cited: r.get(3)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}
