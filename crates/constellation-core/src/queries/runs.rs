use duckdb::params;
use serde::Serialize;

use crate::{Database, Result, DEFAULT_MODEL};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RunInfo {
    pub run_id: String,
    pub kind: String,
    pub model: Option<String>,
    pub params: Option<String>,
    pub n_items: Option<i32>,
    pub created_at: String,
}

/// 투영 run 목록. 기본 모델의 run이 먼저, 그 안에서 최신순.
pub fn runs(db: &Database) -> Result<Vec<RunInfo>> {
    let conn = db.connect()?;
    let mut stmt = conn.prepare(
        "SELECT run_id, kind, model, params_json, n_items, CAST(created_at AS VARCHAR) \
         FROM runs WHERE kind = 'project' \
         ORDER BY (model = ?) DESC, created_at DESC",
    )?;
    let rows = stmt
        .query_map(params![DEFAULT_MODEL], |r| {
            Ok(RunInfo {
                run_id: r.get(0)?,
                kind: r.get(1)?,
                model: r.get(2)?,
                params: r.get(3)?,
                n_items: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Health {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub works: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub projection_runs: Option<i64>,
}

pub fn health(db: &Database) -> Result<Health> {
    if !db.exists() {
        return Ok(Health {
            ok: false,
            reason: Some("DB 없음".into()),
            works: None,
            projection_runs: None,
        });
    }
    let conn = db.connect()?;
    let works: i64 = conn.query_row("SELECT count(*) FROM works", [], |r| r.get(0))?;
    let runs: i64 = conn.query_row("SELECT count(*) FROM runs WHERE kind='project'", [], |r| {
        r.get(0)
    })?;
    Ok(Health {
        ok: true,
        reason: None,
        works: Some(works),
        projection_runs: Some(runs),
    })
}
