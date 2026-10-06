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
    /// 지도가 속한 코퍼스. 코퍼스 도입 전 DB면 None.
    pub corpus_id: Option<String>,
    pub corpus_name: Option<String>,
    /// 표시 이름. 비어 있으면 "코퍼스 이름 · 모델"로 채운다.
    pub name: String,
    /// 클러스터 등 분석 산출물이 있는지(`<run>|cluster` run 존재).
    pub analyzed: bool,
}

/// 코퍼스 도입 전 DB도 열 수 있도록 컬럼 존재를 확인한다. 앱 연결은 읽기 전용이라
/// 스키마를 고칠 수 없다.
pub(crate) fn has_corpus_columns(conn: &duckdb::Connection) -> Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT count(*) FROM information_schema.columns \
         WHERE table_name = 'runs' AND column_name = 'corpus_id'",
        [],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

/// 앱이 만드는 중인 코퍼스(`corpora.status = 'building'`)를 거를 수 있는지.
fn has_corpus_status(conn: &duckdb::Connection) -> Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT count(*) FROM information_schema.columns \
         WHERE table_name = 'corpora' AND column_name = 'status'",
        [],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

/// 지도(투영 run) 목록. 만드는 중인 코퍼스의 지도는 빼고, 분석이 끝난 지도 먼저, 그 안에서 기본 모델 먼저, 최신순.
/// 첫 항목이 run을 지정하지 않았을 때 여는 기본 지도다.
pub fn runs(db: &Database) -> Result<Vec<RunInfo>> {
    let conn = db.connect()?;
    let building = if has_corpus_status(&conn)? {
        "AND (c.status IS NULL OR c.status <> 'building') "
    } else {
        ""
    };
    let sql = if has_corpus_columns(&conn)? {
        format!(
            "SELECT r.run_id, r.kind, r.model, r.params_json, r.n_items, \
                    CAST(r.created_at AS VARCHAR), r.corpus_id, c.name, r.name, \
                    EXISTS (SELECT 1 FROM runs d WHERE d.run_id = r.run_id || '|cluster') \
             FROM runs r LEFT JOIN corpora c ON c.id = r.corpus_id \
             WHERE r.kind = 'project' {building}\
             ORDER BY 10 DESC, (r.model = ?) DESC, r.created_at DESC"
        )
    } else {
        "SELECT r.run_id, r.kind, r.model, r.params_json, r.n_items, \
                CAST(r.created_at AS VARCHAR), NULL, NULL, NULL, \
                EXISTS (SELECT 1 FROM runs d WHERE d.run_id = r.run_id || '|cluster') \
         FROM runs r WHERE r.kind = 'project' \
         ORDER BY 10 DESC, (r.model = ?) DESC, r.created_at DESC"
            .to_string()
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params![DEFAULT_MODEL], |r| {
            let model: Option<String> = r.get(2)?;
            let corpus_name: Option<String> = r.get(7)?;
            let name: Option<String> = r.get(8)?;
            let name = name.unwrap_or_else(|| {
                format!(
                    "{} · {}",
                    corpus_name.as_deref().unwrap_or("코퍼스 미지정"),
                    model.as_deref().unwrap_or("?")
                )
            });
            Ok(RunInfo {
                run_id: r.get(0)?,
                kind: r.get(1)?,
                model,
                params: r.get(3)?,
                n_items: r.get(4)?,
                created_at: r.get(5)?,
                corpus_id: r.get(6)?,
                corpus_name,
                name,
                analyzed: r.get(9)?,
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
    if let Some(reason) = db.gate().reason() {
        return Ok(Health {
            ok: false,
            reason: Some(reason),
            works: None,
            projection_runs: None,
        });
    }
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
