"""클러스터 계층 트리.

HDBSCAN이 만든 45개 덩어리 위에 트리를 세운다. 두 가지에 쓴다.

  1. 지도 라벨의 줌 계층 — 멀리서는 상위 노드, 당기면 잎까지
  2. 독립적인 시각화 — 덴드로그램 자체가 "이 분야가 어디서 갈라지는가"다

**bottom-up(ward)을 쓴다.** top-down(bisecting k-means)과 품질은 사실상
같았지만(최대그룹 16% vs 19%, 2D퍼짐 0.37 vs 0.38, 인용배수 5.1x vs 4.8x)
시드 간 일치도가 ARI 0.60±0.25로 무너졌다. 세 번 돌리면 지도가 세 가지
다른 방식으로 갈린다는 뜻이라, 사용자가 머릿속 지도를 만들 수 없다.
ward는 무작위 초기화가 없어 구조적으로 결정적이다.

**2D 좌표 위에 세운다.** 임베딩 공간에서 세우면 "의미적으로는 형제인데
지도에서는 반대편"인 그룹이 생겨 라벨을 놓을 자리가 없다 — 임베딩 기반
계층의 2D 퍼짐이 0.59~0.61인 반면 2D 기반은 0.37이었다. 계층의 용도가
지도 내비게이션이므로 지도의 기하를 따르는 것이 맞다.

(기획서 §4-B는 HDBSCAN의 condensed tree를 그대로 쓸 수 있다고 적었지만
 sklearn 내장 HDBSCAN은 labels_/probabilities_만 노출한다. 그 전제는 틀렸다.)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable

import numpy as np

from ..db import store

Progress = Callable[[str], None]

DEFAULT_LEVELS = (8, 18)


def _aggregate_keywords(
    kw_by_leaf: dict[int, list[str]], members: list[int], sizes: dict[int, int],
    top_k: int = 8,
) -> list[str]:
    """내부 노드의 임시 키워드 — 자식들의 키워드를 편수로 가중해 모은다.

    합친 덩어리에 c-TF-IDF를 다시 돌리면 죽이 된다. 공통 어휘가 이미
    max_df에서 걸러지기 때문이다. 자식 키워드를 가중 집계하는 편이 낫고,
    어차피 LLM이 이름을 붙이기 전까지의 자리표시자다.
    """
    score: dict[str, float] = {}
    for cid in members:
        ks = kw_by_leaf.get(cid, [])
        w = sizes.get(cid, 1)
        for rank, k in enumerate(ks):
            score[k] = score.get(k, 0.0) + w / (rank + 1)
    out: list[str] = []
    for k, _ in sorted(score.items(), key=lambda kv: -kv[1]):
        if any(k in s or s in k for s in out):
            continue
        out.append(k)
        if len(out) >= top_k:
            break
    return out


def build(
    model_key: str = "scincl",
    *,
    run_id: str | None = None,
    levels: tuple[int, ...] = DEFAULT_LEVELS,
    log: Progress = print,
) -> dict:
    from scipy.cluster.hierarchy import dendrogram, fcluster, linkage
    from scipy.spatial.distance import pdist

    conn = store.connect()
    try:
        if not run_id:
            row = conn.execute(
                "SELECT run_id FROM runs WHERE kind='project' AND model=? "
                "ORDER BY created_at DESC LIMIT 1", (model_key,)
            ).fetchone()
            if not row:
                raise RuntimeError("%s 의 투영 결과가 없다." % model_key)
            run_id = row[0]

        meta = conn.execute(
            "SELECT cluster_id, label, keywords, size, x, y "
            "FROM cluster_meta WHERE run_id = ? ORDER BY cluster_id", (run_id,)
        ).fetchall()
        if len(meta) < 3:
            raise RuntimeError("클러스터가 %d개뿐이라 트리를 세울 수 없다." % len(meta))

        cl_ids = [m[0] for m in meta]
        labels = {m[0]: m[1] for m in meta}
        kw_by_leaf = {m[0]: (m[2] or "").split(", ") if m[2] else [] for m in meta}
        sizes = {m[0]: m[3] for m in meta}
        cen = np.array([[m[4], m[5]] for m in meta], dtype=float)
        n = len(cl_ids)

        log("클러스터 %d개 위에 ward 트리를 세운다 (2D 좌표)" % n)
        Z = linkage(pdist(cen), method="ward")
        order = dendrogram(Z, no_plot=True)["leaves"]      # 세로 배치 순서
        leaf_order = {leaf: i for i, leaf in enumerate(order)}

        # ── 노드별 집계 ──
        total = 2 * n - 1
        members: list[list[int]] = [[] for _ in range(total)]
        node_size = np.zeros(total)
        node_xy = np.zeros((total, 2))
        parent: list[int | None] = [None] * total
        left: list[int | None] = [None] * total
        right: list[int | None] = [None] * total
        height = np.zeros(total)

        for i in range(n):
            members[i] = [cl_ids[i]]
            node_size[i] = sizes[cl_ids[i]]
            node_xy[i] = cen[i]

        for i in range(n - 1):
            a, b, h, _ = Z[i]
            a, b, node = int(a), int(b), n + i
            left[node], right[node] = a, b
            parent[a] = parent[b] = node
            height[node] = float(h)
            members[node] = members[a] + members[b]
            node_size[node] = node_size[a] + node_size[b]
            # 편수 가중 중심 — 큰 자식 쪽으로 라벨이 붙는다
            node_xy[node] = (node_xy[a] * node_size[a] + node_xy[b] * node_size[b]) \
                / max(node_size[node], 1)

        # ── 레벨별 절단 ──
        # 하나의 트리를 여러 높이에서 자르므로 레벨 간 포함 관계가 보장된다.
        level_nodes: dict[int, list[int]] = {}
        for lv, k in enumerate(levels):
            k = min(k, n)
            flat = fcluster(Z, k, criterion="maxclust")
            picked: list[int] = []
            for g in sorted(set(flat)):
                idx = [i for i in range(n) if flat[i] == g]
                # 그 그룹을 정확히 덮는 가장 낮은 노드를 찾는다
                node = idx[0]
                while parent[node] is not None and \
                        set(members[parent[node]]) <= {cl_ids[i] for i in idx}:
                    node = parent[node]
                picked.append(node)
            level_nodes[lv] = picked
            log("  레벨 %d — %d개 노드 (요청 k=%d)" % (lv, len(picked), k))

        # 잎 레벨은 항상 마지막
        level_nodes[len(levels)] = list(range(n))
        log("  레벨 %d — %d개 잎" % (len(levels), n))

        # ── 저장 ──
        conn.execute("DELETE FROM cluster_tree WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM tree_levels WHERE run_id = ?", (run_id,))

        rows = []
        for node in range(total):
            is_leaf = node < n
            cid = cl_ids[node] if is_leaf else None
            kws = (kw_by_leaf[cid] if is_leaf
                   else _aggregate_keywords(kw_by_leaf, members[node], sizes))
            lab = (labels[cid] if is_leaf
                   else " · ".join(kws[:3]) or "노드 %d" % node)
            rows.append((
                run_id, node, parent[node], left[node], right[node],
                float(height[node]), int(node_size[node]), len(members[node]),
                cid, float(node_xy[node][0]), float(node_xy[node][1]),
                leaf_order.get(node) if is_leaf else None,
                lab, "ctfidf", ", ".join(kws),
            ))
        store.bulk_insert(
            conn, "cluster_tree",
            ["run_id", "node_id", "parent_id", "left_id", "right_id", "height",
             "size", "n_leaves", "cluster_id", "x", "y", "leaf_order",
             "label", "label_src", "keywords"],
            rows,
        )
        store.bulk_insert(
            conn, "tree_levels", ["run_id", "level", "k", "node_id"],
            [(run_id, lv, len(ns), nd) for lv, ns in level_nodes.items() for nd in ns],
        )
        conn.execute(
            "INSERT OR REPLACE INTO runs "
            "(run_id, kind, model, params_json, n_items, created_at) VALUES (?,?,?,?,?,?)",
            (run_id + "|tree", "tree", model_key,
             json.dumps({"method": "ward", "space": "2d", "levels": list(levels),
                         "n_leaves": n}),
             total, datetime.now(timezone.utc).replace(tzinfo=None)),
        )
        conn.commit()

        log("")
        for nd in sorted(level_nodes[0], key=lambda d: -node_size[d]):
            log("  %5s편  하위 %2d개  %s"
                % (format(int(node_size[nd]), ","), len(members[nd]),
                   rows[nd][12]))
        return {"run_id": run_id, "n_nodes": total, "n_leaves": n,
                "levels": {lv: len(ns) for lv, ns in level_nodes.items()}}
    finally:
        conn.close()
