-- Constellation 스키마 (DuckDB)
-- 분석 산출물(projections/clusters/flows)은 M1 이후에 추가한다.

CREATE TABLE IF NOT EXISTS works (
    id              TEXT PRIMARY KEY,   -- "openalex:W2741809807"
    doi             TEXT,
    title           TEXT NOT NULL,
    abstract        TEXT,               -- NULL = 초록 없음
    has_abstract    BOOLEAN NOT NULL,
    year            INTEGER,
    venue           TEXT,
    cited_by_count  INTEGER,
    type            TEXT,
    source          TEXT NOT NULL,
    raw_ref         TEXT,               -- data/raw/ 내 원본 페이지 파일명
    collected_at    TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS authors (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    orcid  TEXT
);

CREATE TABLE IF NOT EXISTS work_authors (
    work_id    TEXT NOT NULL,
    author_id  TEXT NOT NULL,
    position   INTEGER NOT NULL,
    PRIMARY KEY (work_id, author_id)
);

-- 인용. cited_id는 코퍼스 밖을 가리킬 수 있다.
-- 양 끝이 모두 works에 있는 엣지만 Flow/Lineage에 쓸 수 있다.
CREATE TABLE IF NOT EXISTS citations (
    citing_id  TEXT NOT NULL,
    cited_id   TEXT NOT NULL,
    PRIMARY KEY (citing_id, cited_id)
);

CREATE TABLE IF NOT EXISTS work_topics (
    work_id  TEXT NOT NULL,
    topic    TEXT NOT NULL,
    score    DOUBLE,
    kind     TEXT NOT NULL,   -- topic | keyword | concept | subject_area
    PRIMARY KEY (work_id, topic, kind)
);

-- 수집 이력. 어떤 쿼리로 무엇이 들어왔는지 추적한다.
CREATE TABLE IF NOT EXISTS collections (
    run_id        TEXT NOT NULL,
    query_set     TEXT NOT NULL,
    query_name    TEXT NOT NULL,
    filter_expr   TEXT NOT NULL,
    source        TEXT NOT NULL,
    n_returned    INTEGER NOT NULL,
    n_new         INTEGER NOT NULL,
    total_matched INTEGER,
    collected_at  TIMESTAMP NOT NULL,
    PRIMARY KEY (run_id, query_name)
);

CREATE INDEX IF NOT EXISTS idx_works_year     ON works (year);
CREATE INDEX IF NOT EXISTS idx_cit_cited      ON citations (cited_id);
CREATE INDEX IF NOT EXISTS idx_topics_topic   ON work_topics (topic);

-- ── M1: 임베딩·투영 산출물 ──────────────────────────────────
-- 파라미터를 바꿔가며 비교해야 하므로 run_id로 버전을 나눈다.

CREATE TABLE IF NOT EXISTS runs (
    run_id      TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,        -- 'embed' | 'project'
    model       TEXT,
    params_json TEXT,
    n_items     INTEGER,
    created_at  TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS projections (
    run_id   TEXT NOT NULL,
    work_id  TEXT NOT NULL,
    x        DOUBLE,
    y        DOUBLE,
    z        DOUBLE,
    PRIMARY KEY (run_id, work_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_run ON projections (run_id);

-- ── M2: 클러스터와 라벨 ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS clusters (
    run_id      TEXT NOT NULL,
    work_id     TEXT NOT NULL,
    cluster_id  INTEGER NOT NULL,   -- -1 = noise
    probability DOUBLE,
    PRIMARY KEY (run_id, work_id)
);

CREATE TABLE IF NOT EXISTS cluster_meta (
    run_id      TEXT NOT NULL,
    cluster_id  INTEGER NOT NULL,
    label       TEXT,               -- 상위 용어 2~3개를 이어붙인 것
    keywords    TEXT,               -- 쉼표 구분 상위 용어
    size        INTEGER NOT NULL,
    x           DOUBLE,             -- 라벨을 얹을 중심 좌표
    y           DOUBLE,
    year_median INTEGER,
    top_work_id TEXT,               -- 대표 논문 (피인용 최다)
    PRIMARY KEY (run_id, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_clusters_run ON clusters (run_id);

-- ── M2+: 클러스터 계층 트리 ─────────────────────────────────
-- scipy linkage 관례를 따른다. 잎이 n개면 노드 0..n-1이 잎,
-- n..2n-2가 내부 노드이고 루트는 2n-2다.

CREATE TABLE IF NOT EXISTS cluster_tree (
    run_id     TEXT NOT NULL,
    node_id    INTEGER NOT NULL,
    parent_id  INTEGER,            -- 루트는 NULL
    left_id    INTEGER,            -- 잎은 NULL
    right_id   INTEGER,
    height     DOUBLE NOT NULL,    -- 병합 거리. 클수록 늦게(멀리서) 합쳐졌다
    size       INTEGER NOT NULL,   -- 논문 편수
    n_leaves   INTEGER NOT NULL,   -- 하위 클러스터 개수
    cluster_id INTEGER,            -- 잎일 때만
    x          DOUBLE,             -- 편수 가중 중심 (지도 라벨 위치)
    y          DOUBLE,
    leaf_order INTEGER,            -- 덴드로그램 세로 순서 (잎만)
    label      TEXT,               -- 이름. LLM이 채우기 전엔 키워드 조합
    label_src  TEXT,               -- 'ctfidf' | 'llm' | 'manual'
    keywords   TEXT,
    PRIMARY KEY (run_id, node_id)
);

-- 덴드로그램을 몇 개 높이에서 자를지. 줌 레벨에 대응한다.
CREATE TABLE IF NOT EXISTS tree_levels (
    run_id  TEXT NOT NULL,
    level   INTEGER NOT NULL,
    k       INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    PRIMARY KEY (run_id, level, node_id)
);

CREATE INDEX IF NOT EXISTS idx_tree_run   ON cluster_tree (run_id);
CREATE INDEX IF NOT EXISTS idx_levels_run ON tree_levels (run_id, level);
