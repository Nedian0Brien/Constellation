use std::collections::BTreeMap;

use duckdb::params;
use serde::Serialize;

use crate::{split_keywords, Database, Error, Result};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TreeNode {
    pub id: i32,
    pub parent: Option<i32>,
    pub left: Option<i32>,
    pub right: Option<i32>,
    pub height: f64,
    pub size: i32,
    pub n_leaves: i32,
    pub cluster_id: Option<i32>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub leaf_order: Option<i32>,
    pub label: Option<String>,
    pub label_src: Option<String>,
    pub keywords: Vec<String>,
}

/// 클러스터 계층 트리 전체. 덴드로그램 배치에 필요한 것을 한 번에 준다.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TreeData {
    pub run_id: String,
    pub nodes: Vec<TreeNode>,
    /// level → 그 레벨에서 자른 노드 id 목록. 키는 Python처럼 문자열이다.
    pub levels: BTreeMap<String, Vec<i32>>,
}

pub fn tree(db: &Database, run: &str) -> Result<TreeData> {
    let conn = db.connect()?;
    let nodes = conn
        .prepare(
            "SELECT node_id, parent_id, left_id, right_id, height, size, \
                    n_leaves, cluster_id, x, y, leaf_order, label, label_src, keywords \
             FROM cluster_tree WHERE run_id = ? ORDER BY node_id",
        )?
        .query_map(params![run], |r| {
            Ok(TreeNode {
                id: r.get(0)?,
                parent: r.get(1)?,
                left: r.get(2)?,
                right: r.get(3)?,
                height: r.get(4)?,
                size: r.get(5)?,
                n_leaves: r.get(6)?,
                cluster_id: r.get(7)?,
                x: r.get(8)?,
                y: r.get(9)?,
                leaf_order: r.get(10)?,
                label: r.get(11)?,
                label_src: r.get(12)?,
                keywords: split_keywords(r.get(13)?),
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    if nodes.is_empty() {
        return Err(Error::not_found("이 분석에는 계층 트리 결과가 없습니다."));
    }

    // 숫자 키로 모은 뒤 문자열 키로 바꾼다. JSON에서는 "10"이 "2" 앞에 오지만
    // 프론트는 키로 찾아 쓰므로 순서는 의미가 없다.
    let mut by_level: BTreeMap<i32, Vec<i32>> = BTreeMap::new();
    let mut stmt = conn.prepare(
        "SELECT level, k, node_id FROM tree_levels WHERE run_id = ? ORDER BY level, node_id",
    )?;
    let mut rows = stmt.query(params![run])?;
    while let Some(r) = rows.next()? {
        let level: i32 = r.get(0)?;
        let node: i32 = r.get(2)?;
        by_level.entry(level).or_default().push(node);
    }
    let levels = by_level.into_iter().map(|(k, v)| (k.to_string(), v)).collect();
    Ok(TreeData { run_id: run.to_string(), nodes, levels })
}
