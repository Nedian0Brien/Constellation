//! Python `backend/tests/{test_queries,test_api}.py`의 표본과 검사를 옮겼다.
//! 스키마는 파이프라인이 쓰는 `schema.sql` 그대로다.

use constellation_core::queries::{self, Order, PaperFilter, Sort};
use constellation_core::{Database, Error};
use duckdb::Connection;

const SCHEMA: &str = include_str!("../../../backend/constellation/db/schema.sql");

struct Fixture {
    _dir: tempfile::TempDir,
    db: Database,
}

fn populate() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.duckdb");
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(SCHEMA).unwrap();
    conn.execute_batch(
        "INSERT INTO runs (run_id,kind,model,created_at) VALUES \
           ('a','project','scincl',CURRENT_TIMESTAMP),('b','project','specter',CURRENT_TIMESTAMP);\
         INSERT INTO works (id,title,abstract,year,cited_by_count,has_abstract,source,collected_at) VALUES \
           ('1','Alpha retrieval','First abstract',2020,10,true,'test',CURRENT_TIMESTAMP),\
           ('2','Beta retrieval',NULL,NULL,10,false,'test',CURRENT_TIMESTAMP),\
           ('3','Gamma','RETRIEVAL evidence',2022,NULL,true,'test',CURRENT_TIMESTAMP),\
           ('4','Other run','retrieval',2020,100,true,'test',CURRENT_TIMESTAMP),\
           ('5','100% exact','literal query',2010,1,true,'test',CURRENT_TIMESTAMP);\
         INSERT INTO projections(run_id,work_id,x,y) VALUES \
           ('a','1',0,0),('a','2',1,1),('a','3',2,2),('b','4',0,0),('a','5',3,3);\
         INSERT INTO clusters(run_id,work_id,cluster_id) VALUES ('a','1',0),('a','2',0),('a','3',1);\
         INSERT INTO cluster_meta(run_id,cluster_id,label,keywords,size,year_median) VALUES \
           ('a',0,'retrieval','alpha, beta',2,2020),('a',1,'gamma',NULL,1,2022);\
         INSERT INTO citations(citing_id,cited_id) VALUES ('3','1'),('2','1'),('1','x-outside');\
         INSERT INTO citation_spc(run_id,cited_id,citing_id,log_spc,on_main) VALUES \
           ('a','1','2',2.0,true),('a','1','3',1.0,false);",
    )
    .unwrap();
    drop(conn);
    Fixture { _dir: dir, db: Database::new(path) }
}

fn filter(run: &str, q: &str, from: Option<i32>, to: Option<i32>) -> PaperFilter {
    PaperFilter { run: run.into(), q: q.into(), year_from: from, year_to: to }
}

fn ids(page: &queries::PaperPage) -> Vec<&str> {
    page.items.iter().map(|r| r.id.as_str()).collect()
}

#[test]
fn filter_matches_list_and_keeps_unknown_year() {
    let f = populate();
    let flt = filter("a", " RETRIEVAL ", Some(2020), Some(2020));
    assert_eq!(queries::matches(&f.db, flt.clone()).unwrap().ids, ["1", "2"]);
    let page = queries::works(&f.db, flt, Sort::Cited, Order::Desc, 1, 25).unwrap();
    assert_eq!(ids(&page), ["1", "2"]);
    assert_eq!(page.total, 2);
}

#[test]
fn stable_paging_nulls_last_and_run_isolation() {
    let f = populate();
    let order: Vec<String> = (1..5)
        .map(|p| {
            queries::works(&f.db, filter("a", "", None, None), Sort::Cited, Order::Desc, p, 1)
                .unwrap()
                .items[0]
                .id
                .clone()
        })
        .collect();
    assert_eq!(order, ["1", "2", "5", "3"]);
    let empty = queries::works(&f.db, filter("a", "", None, None), Sort::Cited, Order::Desc, 9, 25).unwrap();
    assert!(empty.items.is_empty());
    assert_eq!(queries::matches(&f.db, filter("b", "", None, None)).unwrap().ids, ["4"]);
}

#[test]
fn literal_search_and_empty_results() {
    let f = populate();
    assert_eq!(queries::matches(&f.db, filter("a", "0%", None, None)).unwrap().ids, ["5"]);
    assert_eq!(queries::matches(&f.db, filter("a", "zzzz", None, None)).unwrap().total, 0);
}

#[test]
fn invalid_filters_are_422_and_missing_run_is_404() {
    let f = populate();
    let status = |e: Error| e.status;
    assert_eq!(status(queries::matches(&f.db, filter("a", "x", None, None)).unwrap_err()), 422);
    assert_eq!(status(queries::matches(&f.db, filter("a", "", Some(2022), Some(2020))).unwrap_err()), 422);
    assert_eq!(status(queries::works(&f.db, filter("a", "", None, None), Sort::Cited, Order::Desc, 0, 25).unwrap_err()), 422);
    assert_eq!(status(queries::works(&f.db, filter("a", "", None, None), Sort::Cited, Order::Desc, 1, 101).unwrap_err()), 422);
    assert_eq!(Sort::parse("bad").unwrap_err().status, 422);
    assert_eq!(status(queries::works(&f.db, filter("missing", "", None, None), Sort::Cited, Order::Desc, 1, 25).unwrap_err()), 404);
}

#[test]
fn detail_is_scoped_to_run() {
    let f = populate();
    let err = queries::work(&f.db, "4", Some("a")).unwrap_err();
    assert_eq!(err.status, 404);
    assert_eq!(err.message, "현재 분석에 포함되지 않은 논문입니다.");
    let w = queries::work(&f.db, "1", Some("a")).unwrap();
    assert_eq!(w.title, "Alpha retrieval");
    // 코퍼스 안 인용만 센다: 1을 인용한 2·3은 안에, 1이 인용한 x-outside는 밖.
    assert_eq!((w.refs_in_corpus, w.cited_by_in_corpus), (0, 2));
    assert_eq!(queries::work(&f.db, "nope", None).unwrap_err().status, 404);
}

#[test]
fn map_prefers_default_model_and_is_columnar() {
    let f = populate();
    let m = queries::map(&f.db, None).unwrap();
    assert_eq!(m.run_id, "a");
    assert_eq!(m.n, 4);
    assert_eq!(m.id, ["1", "2", "3", "5"]);
    assert_eq!(m.cluster, [0, 0, 1, -1]);
    assert_eq!(m.cited, [10, 10, 0, 1]);
    assert_eq!(m.year[1], None);
    assert_eq!(queries::map(&f.db, Some("nope")).unwrap_err().status, 404);
}

#[test]
fn runs_health_clusters_and_detail() {
    let f = populate();
    let runs = queries::runs(&f.db).unwrap();
    assert_eq!(runs.iter().map(|r| r.run_id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
    let h = queries::health(&f.db).unwrap();
    assert_eq!((h.ok, h.works, h.projection_runs), (true, Some(5), Some(2)));
    let cs = queries::clusters(&f.db, "a").unwrap();
    assert_eq!(cs[0].keywords, ["alpha", "beta"]);
    assert!(cs[1].keywords.is_empty());
    let d = queries::cluster_detail(&f.db, "a", 0).unwrap();
    assert_eq!(d.top_works.iter().map(|w| w.id.as_str()).collect::<Vec<_>>(), ["1", "2"]);
    assert_eq!(d.by_year, [queries::YearCount { year: 2020, n: 1 }]);
    assert_eq!(queries::cluster_detail(&f.db, "a", 9).unwrap_err().status, 404);
    assert_eq!(queries::tree(&f.db, "a").unwrap_err().status, 404);
    assert_eq!(queries::flow(&f.db, "a").unwrap_err().status, 404);
}

#[test]
fn lineage_main_path_and_neighbourhood() {
    let f = populate();
    let l = queries::lineage(&f.db, "a", None, 2, 240).unwrap();
    // 연도 미상(2)은 0으로 쳐서 앞에 온다 — Python과 같다.
    assert_eq!(l.main_path, ["2", "1"]);
    assert_eq!(l.edges.len(), 1);
    let l = queries::lineage(&f.db, "a", Some("3"), 2, 240).unwrap();
    assert_eq!(l.edges.len(), 2);
    assert!(!l.edges[1].main);
    let mut node_ids: Vec<&str> = l.nodes.iter().map(|n| n.id.as_str()).collect();
    node_ids.sort();
    assert_eq!(node_ids, ["1", "2", "3"]);
    assert_eq!(queries::lineage(&f.db, "a", None, 9, 240).unwrap_err().status, 422);
    assert_eq!(queries::lineage(&f.db, "b", None, 2, 240).unwrap_err().status, 404);
}

#[test]
fn missing_database_is_503() {
    let db = Database::new("/nonexistent/constellation.duckdb");
    let err = queries::runs(&db).unwrap_err();
    assert_eq!(err.status, 503);
    assert!(!queries::health(&db).unwrap().ok);
}
