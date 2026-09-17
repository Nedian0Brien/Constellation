use std::collections::{HashMap, HashSet};

use duckdb::{params, params_from_iter, types::Value};
use serde::Serialize;

use crate::{Database, Error, Result};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LineageNode {
    pub id: String,
    pub title: String,
    pub year: Option<i32>,
    pub cited: i32,
    pub venue: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LineageEdge {
    pub from: String,
    pub to: String,
    pub spc: f64,
    pub main: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LineageData {
    pub run_id: String,
    pub seed: Option<String>,
    pub nodes: Vec<LineageNode>,
    pub edges: Vec<LineageEdge>,
    pub main_path: Vec<String>,
}

/// 인용 계보. seed가 없으면 메인패스만, 있으면 그 논문 주변 depth홉을 함께 준다.
///
/// Python 버전의 BFS를 그대로 옮겼다. 순서(엣지·노드)가 같아야 화면이 같다.
pub fn lineage(
    db: &Database,
    run: &str,
    seed: Option<&str>,
    depth: u32,
    limit: u32,
) -> Result<LineageData> {
    if !(1..=4).contains(&depth) {
        return Err(Error::invalid("depth는 1 이상 4 이하여야 합니다."));
    }
    if limit > 600 {
        return Err(Error::invalid("limit은 600 이하여야 합니다."));
    }
    let seed = seed.filter(|s| !s.is_empty());
    let conn = db.connect()?;

    let main: Vec<(String, String, f64)> = conn
        .prepare(
            "SELECT cited_id, citing_id, log_spc FROM citation_spc \
             WHERE run_id = ? AND on_main ORDER BY log_spc DESC",
        )?
        .query_map(params![run], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    if main.is_empty() {
        return Err(Error::not_found("이 분석에는 인용 계보 결과가 없습니다."));
    }

    // keep은 순서가 필요 없다(노드 조회용). 엣지 순서는 Vec이 지킨다.
    let mut keep: HashSet<String> = HashSet::new();
    for (a, b, _) in &main {
        keep.insert(a.clone());
        keep.insert(b.clone());
    }
    let mut edges: Vec<LineageEdge> = main
        .iter()
        .map(|(a, b, c)| LineageEdge {
            from: a.clone(),
            to: b.clone(),
            spc: *c,
            main: true,
        })
        .collect();

    if let Some(seed) = seed {
        let mut frontier: Vec<String> = vec![seed.to_string()];
        keep.insert(seed.to_string());
        let mut seen_edge: HashSet<(String, String)> = edges
            .iter()
            .map(|e| (e.from.clone(), e.to.clone()))
            .collect();
        for _ in 0..depth {
            if frontier.is_empty() || keep.len() > limit as usize {
                break;
            }
            let marks = vec!["?"; frontier.len()].join(",");
            let sql = format!(
                "SELECT cited_id, citing_id, log_spc FROM citation_spc \
                 WHERE run_id = ? AND (cited_id IN ({marks}) OR citing_id IN ({marks})) \
                 ORDER BY log_spc DESC LIMIT ?"
            );
            let mut values: Vec<Value> = Vec::with_capacity(frontier.len() * 2 + 2);
            values.push(Value::Text(run.to_string()));
            values.extend(frontier.iter().map(|f| Value::Text(f.clone())));
            values.extend(frontier.iter().map(|f| Value::Text(f.clone())));
            values.push(Value::Int(limit as i32));
            let rows: Vec<(String, String, f64)> = conn
                .prepare(&sql)?
                .query_map(params_from_iter(values), |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            // Python은 set을 썼지만 다음 프론티어의 순서는 IN 절 안에서만 쓰여
            // 결과에 영향이 없다. 여기서는 발견 순서를 유지한다.
            let mut next: Vec<String> = Vec::new();
            for (a, b, c) in rows {
                if keep.len() > limit as usize {
                    break;
                }
                if seen_edge.insert((a.clone(), b.clone())) {
                    edges.push(LineageEdge {
                        from: a.clone(),
                        to: b.clone(),
                        spc: c,
                        main: false,
                    });
                }
                for x in [a, b] {
                    if keep.insert(x.clone()) {
                        next.push(x);
                    }
                }
            }
            frontier = next;
        }
    }

    let ids: Vec<String> = keep.iter().cloned().collect();
    let marks = vec!["?"; ids.len()].join(",");
    let sql = format!(
        "SELECT id, title, year, coalesce(cited_by_count,0), venue FROM works WHERE id IN ({marks})"
    );
    let rows: Vec<LineageNode> = conn
        .prepare(&sql)?
        .query_map(
            params_from_iter(ids.iter().map(|i| Value::Text(i.clone()))),
            |r| {
                Ok(LineageNode {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    year: r.get(2)?,
                    cited: r.get(3)?,
                    venue: r.get(4)?,
                })
            },
        )?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    // 메인패스 노드: 엣지 순서대로 처음 본 순서, 그 뒤 연도로 안정 정렬 (Python과 같다).
    let mut main_ids: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for (a, b, _) in &main {
        for x in [a, b] {
            if seen.insert(x.clone()) {
                main_ids.push(x.clone());
            }
        }
    }
    let by_id: HashMap<&str, &LineageNode> = rows.iter().map(|n| (n.id.as_str(), n)).collect();
    main_ids.sort_by_key(|i| by_id.get(i.as_str()).and_then(|n| n.year).unwrap_or(0));

    Ok(LineageData {
        run_id: run.to_string(),
        seed: seed.map(str::to_string),
        nodes: rows,
        edges,
        main_path: main_ids,
    })
}
