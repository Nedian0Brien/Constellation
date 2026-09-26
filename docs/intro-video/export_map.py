"""소개 영상의 지도 데이터를 DB에서 뽑아 장면 파일의 MAP 블록에 넣는다.

    .venv/bin/python docs/intro-video/export_map.py data/constellation.duckdb docs/intro-video/video.scene.js [...]

장면 파일 안의 `// BEGIN MAP DATA` … `// END MAP DATA` 사이를 바꾼다.
좌표는 앱 지도(deck.gl OrthographicView, y 아래로 +)와 같은 방향이다.
"""

import json
import re
import sys

import duckdb

RUN = "project-scincl-20260826T084511Z"
FOCUS = "openalex:W3015883388"  # Dense Passage Retrieval for Open-Domain Question Answering (2020)
Q = 1000  # 좌표 양자화 단계
NEIGHBORS = 12


def main(db_path: str, targets: list[str]) -> None:
    c = duckdb.connect(db_path, read_only=True)

    rows = c.execute(
        """
        select p.work_id, p.x, p.y, coalesce(cl.cluster_id, -1), coalesce(w.year, 0), coalesce(w.cited_by_count, 0)
        from projections p
        join works w on w.id = p.work_id
        left join clusters cl on cl.run_id = p.run_id and cl.work_id = p.work_id
        where p.run_id = ?
        order by p.work_id
        """,
        [RUN],
    ).fetchall()

    xs = [r[1] for r in rows]
    ys = [r[2] for r in rows]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    span = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    def qx(x: float) -> int:  # 지도 중심 0, 긴 변이 -Q/2..Q/2
        return round((x - cx) / span * Q)

    def qy(y: float) -> int:
        return round((y - cy) / span * Q)

    # 계층: 잎 클러스터 → 레벨 0(상위 분야 20개) 조상
    tree = {
        r[0]: (r[1], r[2], r[3], r[4], r[5], r[6])
        for r in c.execute(
            "select node_id, parent_id, cluster_id, label, size, x, y from cluster_tree where run_id like ?",
            [RUN + "%"],
        ).fetchall()
    }
    levels = {}
    for level, node in c.execute(
        "select level, node_id from tree_levels where run_id like ? order by level", [RUN + "%"]
    ).fetchall():
        levels.setdefault(level, []).append(node)

    def by_size(nodes):
        return sorted(nodes, key=lambda n: -tree[n][3])

    top = by_size(levels[0])
    leaves = by_size(levels[2])
    top_index = {n: i for i, n in enumerate(top)}

    def ancestor(node: int, allowed: dict) -> int:
        while node is not None and node not in allowed:
            node = tree[node][0]
        return -1 if node is None else allowed[node]

    leaf_node_of_cluster = {v[1]: k for k, v in tree.items() if v[1] is not None and v[1] >= 0}
    region_of_cluster = {cid: ancestor(n, top_index) for cid, n in leaf_node_of_cluster.items()}
    leaf_index = {n: i for i, n in enumerate(leaves)}
    field_of_cluster = {cid: leaf_index.get(n, -1) for cid, n in leaf_node_of_cluster.items()}

    ids = [r[0] for r in rows]
    index = {w: i for i, w in enumerate(ids)}
    pts = []
    for r in rows:
        pts += [qx(r[1]), qy(r[2]), region_of_cluster.get(r[3], -1), field_of_cluster.get(r[3], -1), r[4]]

    def node_entry(n):
        parent, cid, label, size, x, y = tree[n]
        return {"label": label, "cluster": cid, "size": size, "x": qx(x), "y": qy(y), "region": ancestor(n, top_index)}

    refs = [
        index[r[0]]
        for r in c.execute("select cited_id from citations where citing_id = ?", [FOCUS]).fetchall()
        if r[0] in index
    ]
    cited_by = [
        index[r[0]]
        for r in c.execute("select citing_id from citations where cited_id = ?", [FOCUS]).fetchall()
        if r[0] in index
    ]
    focus_title, focus_year = c.execute("select title, year from works where id = ?", [FOCUS]).fetchone()

    # 확대 장면에 쓰는 DPR 주변 논문: 투영 거리 순, 제목이 있고 60자 이하인 것
    fx, fy = next((r[1], r[2]) for r in rows if r[0] == FOCUS)
    near = sorted(rows, key=lambda r: (r[1] - fx) ** 2 + (r[2] - fy) ** 2)
    titles = dict(c.execute("select id, title from works").fetchall())
    neighbors = []
    for r in near:
        title = titles.get(r[0]) or ""
        if r[0] == FOCUS or not title or len(title) > 60 or title.startswith("("):
            continue
        neighbors.append({"index": index[r[0]], "title": title, "year": r[4]})
        if len(neighbors) == NEIGHBORS:
            break

    stats = {
        "papers": len(ids),
        "yearMin": c.execute("select min(year) from works").fetchone()[0],
        "yearMax": c.execute("select max(year) from works").fetchone()[0],
        "citations": c.execute(
            "select count(*) from citations ci join works a on a.id = ci.citing_id join works b on b.id = ci.cited_id"
        ).fetchone()[0],
        "levels": [len(levels[k]) for k in sorted(levels)],
    }

    data = {
        "source": f"{db_path} · run {RUN}",
        "stats": stats,
        "points": pts,  # [x, y, region, field, year] × n
        "regions": [node_entry(n) for n in top],
        "fields": [node_entry(n) for n in leaves],
        "focus": {"index": index[FOCUS], "title": focus_title, "year": focus_year, "refs": refs, "citedBy": cited_by, "neighbors": neighbors},
    }
    block = "// BEGIN MAP DATA\n// 생성: docs/intro-video/export_map.py — 손으로 고치지 않는다\nconst MAP = " + json.dumps(
        data, ensure_ascii=False, separators=(",", ":")
    ) + ";\n// END MAP DATA"

    for path in targets:
        src = open(path, encoding="utf-8").read()
        pat = re.compile(r"// BEGIN MAP DATA.*?// END MAP DATA", re.S)
        if not pat.search(src):
            raise SystemExit(f"{path}: MAP DATA 블록이 없다")
        open(path, "w", encoding="utf-8").write(pat.sub(lambda _: block, src))
        print(f"{path}: points={len(ids)} regions={len(top)} fields={len(leaves)} refs={len(refs)} citedBy={len(cited_by)}")
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
