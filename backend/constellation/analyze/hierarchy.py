"""클러스터 계층 트리.

HDBSCAN이 만든 45개 덩어리 위에 트리를 세운다. 두 가지에 쓴다.

  1. 지도 라벨의 줌 계층 — 멀리서는 상위 노드, 당기면 잎까지
  2. 독립적인 시각화 — 덴드로그램 자체가 "이 분야가 어디서 갈라지는가"다

**bottom-up(ward)을 쓴다.** top-down(bisecting k-means)과 품질은 사실상
같았지만(최대그룹 16% vs 19%, 2D퍼짐 0.37 vs 0.38, 인용배수 5.1x vs 4.8x)
시드 간 일치도가 ARI 0.60±0.25로 무너졌다. 세 번 돌리면 지도가 세 가지
다른 방식으로 갈린다는 뜻이라, 사용자가 머릿속 지도를 만들 수 없다.
ward는 무작위 초기화가 없어 구조적으로 결정적이다.

두 방식이 있다.

**2d** — 클러스터의 2D 지도 좌표 중심으로 세운다. 임베딩 공간에서 세우면
"의미적으로는 형제인데 지도에서는 반대편"인 그룹이 생겨 라벨을 놓을 자리가
없다 — 임베딩 기반 계층의 2D 퍼짐이 0.59~0.61인 반면 2D 기반은 0.37이었다.
대신 병합이 "지도에서 이웃"이지 "주제가 비슷함"이 아니라, 무관한 두 분야가
한 상위 노드가 된다(Music IR + Multilingual NLP). naming의 응집 판정이
그런 노드를 가르면 상위 분야 8개 중 6~7개가 갈라진다.

**topical** — 병합 비용은 임베딩 중심(SciNCL 벡터 평균)의 Ward 거리로 재고,
병합은 2D에서 이웃(중심의 Delaunay 변)인 클러스터끼리만 허용한다. 지리학의
공간 제약 군집과 같은 발상이다. 영역은 항상 지도에서 한 덩어리라 라벨 자리가
있고, 합쳐지는 것은 주제가 가까운 것이다. 레벨은 개수가 아니라 병합 비용
문턱으로 자른다 — "합칠 만한 것만 합친 상태"가 레벨이 된다.

(기획서 §4-B는 HDBSCAN의 condensed tree를 그대로 쓸 수 있다고 적었지만
 sklearn 내장 HDBSCAN은 labels_/probabilities_만 노출한다. 그 전제는 틀렸다.)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable

import numpy as np

from ..db import store

Progress = Callable[[str], None]

DEFAULT_LEVELS = (8, 18)
# topical의 병합 비용 문턱(레벨 0, 1). SciNCL run의 비용 순서(0.03 … 0.64)에서
# 골랐다: 0.16이면 16개 그룹, 0.10이면 27개 그룹. 척도는 임베딩 모델에 달렸으니
# 다른 모델이면 `hierarchy --compare`가 찍는 비용 순서를 보고 다시 정한다.
DEFAULT_TOPICAL_LEVELS = (0.16, 0.10)
# Delaunay 변 중 이 배수 × 중앙값보다 긴 변은 뺀다 — 볼록 껍질을 가로지르는
# 긴 변이 지도 반대편을 이웃으로 만드는 것을 막는다.
EDGE_PRUNE_RATIO = 2.0


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


# ── 병합 순서 ──────────────────────────────────────────────────────
# 둘 다 scipy linkage 형식 Z(n-1 × 4: 자식 a, 자식 b, 높이, 잎 수)를 돌려준다.
# 새 노드 id는 병합 순서대로 n, n+1, …

def _merges_2d(cen: np.ndarray) -> np.ndarray:
    from scipy.cluster.hierarchy import linkage
    from scipy.spatial.distance import pdist
    return linkage(pdist(cen), method="ward")


def delaunay_edges(xy: np.ndarray, prune_ratio: float = EDGE_PRUNE_RATIO) -> set[tuple[int, int]]:
    """2D 이웃 그래프. Delaunay 변에서 긴 변을 빼되 그래프는 연결로 유지한다.

    긴 변(중앙값 × prune_ratio 초과)을 뺀 뒤 끊겼으면 뺀 변을 짧은 순으로
    되살린다. 점이 3개 미만이거나 한 직선 위면 완전 그래프.
    """
    n = len(xy)
    if n < 3:
        return {(a, b) for a in range(n) for b in range(a + 1, n)}
    from scipy.spatial import Delaunay, QhullError
    try:
        tri = Delaunay(xy)
    except QhullError:
        return {(a, b) for a in range(n) for b in range(a + 1, n)}
    edges: set[tuple[int, int]] = set()
    for s in tri.simplices:
        for i in range(3):
            for j in range(i + 1, 3):
                a, b = int(s[i]), int(s[j])
                edges.add((min(a, b), max(a, b)))
    length = {e: float(np.hypot(*(xy[e[0]] - xy[e[1]]))) for e in edges}
    cut = prune_ratio * float(np.median(list(length.values())))
    keep = {e for e in edges if length[e] <= cut}
    for e in sorted((e for e in edges if e not in keep), key=lambda e: (length[e], e)):
        if _connected(n, keep):
            break
        keep.add(e)
    return keep


def _connected(n: int, edges: set[tuple[int, int]]) -> bool:
    adj: dict[int, set[int]] = {i: set() for i in range(n)}
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    seen = {0}
    stack = [0]
    while stack:
        u = stack.pop()
        for v in adj[u]:
            if v not in seen:
                seen.add(v)
                stack.append(v)
    return len(seen) == n


def constrained_ward(
    X: np.ndarray, edges: set[tuple[int, int]],
) -> np.ndarray:
    """이웃끼리만 합치는 Ward. 잎 하나의 무게는 1(2d 방식의 scipy linkage와 같은 척도).

    논문 수를 무게로 주면 작은 클러스터끼리는 멀어도 싸게 합쳐져 잡동사니
    그룹이 생겼다(프로토타입: Sustainable Agriculture + HCI + Information
    Literacy, d=0.144). 잎 수 무게가 낫다.

    단계마다 인접한 쌍 중 비용 n_a n_b/(n_a+n_b)·‖c_a−c_b‖² 이 가장 작은 쌍을
    합친다. 동률은 (a, b)가 작은 쪽. 새 노드의 중심은 무게 가중 평균, 이웃은
    두 자식 이웃의 합집합. 제약 때문에 비용이 비단조일 수 있다 — 절단·저장은
    단조화한 높이를 쓴다(`monotone_heights`).
    """
    n = len(X)
    if n == 1:
        return np.zeros((0, 4))
    if not _connected(n, edges):
        raise ValueError("이웃 그래프가 끊겨 있어 트리를 하나로 닫을 수 없다.")
    cen: dict[int, np.ndarray] = {i: X[i].astype(float) for i in range(n)}
    w: dict[int, float] = {i: 1.0 for i in range(n)}
    adj: dict[int, set[int]] = {i: set() for i in range(n)}
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    Z = np.zeros((n - 1, 4))
    for step in range(n - 1):
        best: tuple[float, int, int] | None = None
        for a in sorted(adj):
            for b in sorted(adj[a]):
                if b <= a:
                    continue
                d = cen[a] - cen[b]
                cost = w[a] * w[b] / (w[a] + w[b]) * float(d @ d)
                if best is None or cost < best[0]:
                    best = (cost, a, b)
        assert best is not None
        cost, a, b = best
        node = n + step
        cen[node] = (cen[a] * w[a] + cen[b] * w[b]) / (w[a] + w[b])
        w[node] = w[a] + w[b]
        adj[node] = (adj.pop(a) | adj.pop(b)) - {a, b}
        for o in adj[node]:
            adj[o] -= {a, b}
            adj[o].add(node)
        del cen[a], cen[b], w[a], w[b]
        Z[step] = (a, b, cost, w[node])
    return Z


def _merges_topical(
    C: np.ndarray, xy: np.ndarray,
) -> tuple[np.ndarray, int]:
    edges = delaunay_edges(xy)
    return constrained_ward(C, edges), len(edges)


# ── 집계와 절단 ─────────────────────────────────────────────────────

def monotone_heights(Z: np.ndarray) -> np.ndarray:
    """노드별 높이(잎 0). 내부 노드는 자기 비용과 자식 높이의 최댓값."""
    n = len(Z) + 1
    h = np.zeros(2 * n - 1)
    for i, (a, b, cost, _) in enumerate(Z):
        h[n + i] = max(float(cost), h[int(a)], h[int(b)])
    return h


def cut_by_height(
    height: np.ndarray, parent: list[int | None], thresholds: tuple[float, ...],
) -> dict[int, list[int]]:
    """문턱마다 높이 ≤ t 이면서 부모 높이 > t 인 노드(루트 포함)."""
    out: dict[int, list[int]] = {}
    for lv, t in enumerate(thresholds):
        out[lv] = [i for i in range(len(height))
                   if height[i] <= t and (parent[i] is None or height[parent[i]] > t)]
    return out


def cut_by_count(
    Z: np.ndarray, parent: list[int | None], members: list[list[int]],
    ks: tuple[int, ...],
) -> dict[int, list[int]]:
    """k개로 자른다(scipy fcluster). 그룹을 정확히 덮는 가장 낮은 노드를 고른다."""
    from scipy.cluster.hierarchy import fcluster
    n = len(Z) + 1
    out: dict[int, list[int]] = {}
    for lv, k in enumerate(ks):
        k = min(k, n)
        flat = fcluster(Z, k, criterion="maxclust")
        picked: list[int] = []
        for g in sorted(set(flat)):
            idx = [i for i in range(n) if flat[i] == g]
            want = {members[i][0] for i in idx}
            node = idx[0]
            while parent[node] is not None and set(members[parent[node]]) <= want:
                node = parent[node]
            picked.append(node)
        out[lv] = picked
    return out


def _leaf_centroids(
    conn, run_id: str, model_key: str, cl_ids: list[int],
) -> np.ndarray:
    """잎마다 소속 논문의 임베딩 평균을 단위 벡터로. umap10 좌표는 저장하지
    않으므로 원본 벡터(`vectors.npy`)로 잰다."""
    from .evaluate import load_matrix
    ids, vecs = load_matrix(model_key)
    pos = {w: i for i, w in enumerate(ids)}
    rows = conn.execute(
        "SELECT work_id, cluster_id FROM clusters WHERE run_id = ? AND cluster_id >= 0",
        (run_id,)).fetchall()
    by: dict[int, list[int]] = {}
    for w, c in rows:
        if w in pos:
            by.setdefault(c, []).append(pos[w])
    C = np.zeros((len(cl_ids), vecs.shape[1]))
    for r, cid in enumerate(cl_ids):
        idx = by.get(cid)
        if not idx:
            raise RuntimeError("클러스터 %d 의 임베딩이 없다." % cid)
        C[r] = vecs[idx].mean(axis=0)
    return C / np.maximum(np.linalg.norm(C, axis=1, keepdims=True), 1e-12)


def build(
    model_key: str = "scincl",
    *,
    run_id: str | None = None,
    method: str = "2d",
    levels: tuple[float, ...] | None = None,
    dry_run: bool = False,
    log: Progress = print,
) -> dict:
    """트리를 세워 저장한다. `dry_run`이면 저장하지 않고 트리를 돌려준다."""
    from scipy.cluster.hierarchy import dendrogram

    if method not in ("2d", "topical"):
        raise ValueError("method 는 '2d' | 'topical'")
    if levels is None:
        levels = DEFAULT_LEVELS if method == "2d" else DEFAULT_TOPICAL_LEVELS
    # 프런트는 잎 위에 딱 두 레벨(상위·하위 분야)을 가정한다(MapView, regionLabels).
    if len(levels) != 2:
        raise ValueError("levels 는 값 두 개여야 한다(상위·하위 분야): %r" % (levels,))

    conn = store.connect(read_only=dry_run)
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

        params: dict[str, Any] = {"method": method, "levels": list(levels), "n_leaves": n}
        if method == "2d":
            log("클러스터 %d개 위에 ward 트리를 세운다 (2D 좌표)" % n)
            Z = _merges_2d(cen)
            params["space"] = "2d"
        else:
            log("클러스터 %d개 위에 이웃 제약 ward 트리를 세운다 (임베딩 중심 · 2D 이웃)" % n)
            C = _leaf_centroids(conn, run_id, model_key, cl_ids)
            Z, n_edges = _merges_topical(C, cen)
            params["space"] = "embedding"
            params["edges_kept"] = n_edges
            log("  이웃 변 %d개" % n_edges)
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

        for i in range(n):
            members[i] = [cl_ids[i]]
            node_size[i] = sizes[cl_ids[i]]
            node_xy[i] = cen[i]

        for i in range(n - 1):
            a, b, _, _ = Z[i]
            a, b, node = int(a), int(b), n + i
            left[node], right[node] = a, b
            parent[a] = parent[b] = node
            members[node] = members[a] + members[b]
            node_size[node] = node_size[a] + node_size[b]
            # 편수 가중 중심 — 큰 자식 쪽으로 라벨이 붙는다
            node_xy[node] = (node_xy[a] * node_size[a] + node_xy[b] * node_size[b]) \
                / max(node_size[node], 1)
        heights = np.concatenate([np.zeros(n), Z[:, 2]]) if method == "2d" \
            else monotone_heights(Z)

        # ── 레벨별 절단 ──
        # 하나의 트리를 여러 높이에서 자르므로 레벨 간 포함 관계가 보장된다.
        if method == "2d":
            level_nodes = cut_by_count(Z, parent, members, tuple(int(k) for k in levels))
            for lv, ns in level_nodes.items():
                log("  레벨 %d — %d개 노드 (요청 k=%d)" % (lv, len(ns), int(levels[lv])))
        else:
            level_nodes = cut_by_height(heights, parent, tuple(levels))
            for lv, ns in level_nodes.items():
                log("  레벨 %d — %d개 노드 (비용 ≤ %.3f)" % (lv, len(ns), levels[lv]))
        level_nodes[len(levels)] = list(range(n))
        log("  레벨 %d — %d개 잎" % (len(levels), n))

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
                float(heights[node]), int(node_size[node]), len(members[node]),
                cid, float(node_xy[node][0]), float(node_xy[node][1]),
                leaf_order.get(node) if is_leaf else None,
                lab, "ctfidf", ", ".join(kws),
            ))
        tree = {"run_id": run_id, "method": method, "params": params, "Z": Z,
                "rows": rows, "members": members, "node_size": node_size,
                "node_xy": node_xy, "heights": heights, "parent": parent,
                "levels": level_nodes, "cl_ids": cl_ids, "labels": labels,
                "n_nodes": total, "n_leaves": n}
        if dry_run:
            return tree

        # ── 저장 ──
        conn.execute("DELETE FROM cluster_tree WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM tree_levels WHERE run_id = ?", (run_id,))
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
            (run_id + "|tree", "tree", model_key, json.dumps(params),
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


# ── 비교 ────────────────────────────────────────────────────────────

def group_metrics(
    groups: list[list[int]],
    leaf_size: dict[int, int],
    paper_xy: dict[int, np.ndarray] | None,
    leaf_C: dict[int, np.ndarray] | None,
    cites: list[tuple[int, int]] | None,
) -> dict[str, float]:
    """한 절단(그룹 = 잎 id 목록)의 지표.

    max_share  가장 큰 그룹의 논문 비율
    spread     그룹 소속 논문의 그룹 중심까지 RMS 거리 ÷ 전체 RMS 반지름. 잎 수 가중 평균
    cohesion   그룹 안 잎 중심끼리 코사인 유사도 평균(잎 하나면 1). 잎 수 가중 평균
    lift       같은 그룹 안에서 인용할 확률 ÷ 무작위 두 편이 같은 그룹일 확률
    """
    total = sum(leaf_size.values())
    out: dict[str, float] = {
        "groups": len(groups),
        "max_share": max(sum(leaf_size[c] for c in g) for g in groups) / max(total, 1),
    }
    if paper_xy is not None:
        allp = np.concatenate([paper_xy[c] for c in leaf_size])
        R = float(np.sqrt(((allp - allp.mean(axis=0)) ** 2).sum(axis=1).mean()))
        num = den = 0.0
        for g in groups:
            P = np.concatenate([paper_xy[c] for c in g])
            r = float(np.sqrt(((P - P.mean(axis=0)) ** 2).sum(axis=1).mean()))
            num += r / max(R, 1e-12) * len(g)
            den += len(g)
        out["spread"] = num / max(den, 1)
    if leaf_C is not None:
        num = den = 0.0
        for g in groups:
            if len(g) == 1:
                s = 1.0
            else:
                M = np.array([leaf_C[c] for c in g])
                S = M @ M.T
                s = float((S.sum() - np.trace(S)) / (len(g) * (len(g) - 1)))
            num += s * len(g)
            den += len(g)
        out["cohesion"] = num / max(den, 1)
    if cites is not None:
        gid = {c: k for k, g in enumerate(groups) for c in g}
        both = [(a, b) for a, b in cites if a in gid and b in gid]
        inside = sum(1 for a, b in both if gid[a] == gid[b])
        gsize = [sum(leaf_size[c] for c in g) for g in groups]
        base = sum((s / total) ** 2 for s in gsize)
        rate = inside / len(both) if both else 0.0
        out["lift"] = rate / base if base else 0.0
    return out


def compare(
    model_key: str = "scincl",
    *,
    run_id: str | None = None,
    log: Progress = print,
) -> dict[str, Any]:
    """2d와 topical을 같은 run에서 세워 레벨별 지표를 비교한다. DB에 쓰지 않는다.

    2d는 기본 k(8, 18)와 topical이 낸 개수에 맞춘 k로 두 번 잘라 같은 개수에서
    비교한다 — 응집·퍼짐은 그룹이 많을수록 좋아지므로 개수를 맞추지 않으면
    "그룹이 많으면 조밀하다"만 확인하게 된다.
    """
    t2 = build(model_key, run_id=run_id, method="2d", dry_run=True, log=log)
    tt = build(model_key, run_id=run_id, method="topical", dry_run=True, log=log)
    run_id = tt["run_id"]
    matched = tuple(len(tt["levels"][lv]) for lv in (0, 1))
    t2m = build(model_key, run_id=run_id, method="2d", levels=matched, dry_run=True,
                log=lambda s: None)

    conn = store.connect(read_only=True)
    try:
        cl_ids = tt["cl_ids"]
        leaf_size = {c: int(tt["node_size"][i]) for i, c in enumerate(cl_ids)}
        rows = conn.execute(
            "SELECT c.cluster_id, p.x, p.y FROM clusters c JOIN projections p "
            "ON p.run_id = c.run_id AND p.work_id = c.work_id "
            "WHERE c.run_id = ? AND c.cluster_id >= 0", (run_id,)).fetchall()
        pxy: dict[int, list[list[float]]] = {}
        for c, x, y in rows:
            if x is not None and y is not None:
                pxy.setdefault(c, []).append([x, y])
        paper_xy = {c: np.array(v) for c, v in pxy.items()}
        C = _leaf_centroids(conn, run_id, model_key, cl_ids)
        leaf_C = {c: C[i] for i, c in enumerate(cl_ids)}
        cl = dict(conn.execute(
            "SELECT work_id, cluster_id FROM clusters WHERE run_id = ? AND cluster_id >= 0",
            (run_id,)).fetchall())
        cites = [(cl[a], cl[b]) for a, b in conn.execute(
            "SELECT citing_id, cited_id FROM citations").fetchall()
            if a in cl and b in cl]
    finally:
        conn.close()

    def groups_of(tree: dict, lv: int) -> list[list[int]]:
        return [tree["members"][nd] for nd in tree["levels"][lv]]

    table: list[dict[str, Any]] = []
    for name, tree in (("2d k=8,18", t2), ("2d k=%d,%d" % matched, t2m),
                       ("topical", tt)):
        for lv in (0, 1):
            m = group_metrics(groups_of(tree, lv), leaf_size, paper_xy, leaf_C, cites)
            table.append({"method": name, "level": lv, **m})

    log("")
    log("%-14s %5s %6s %8s %7s %8s %6s" % ("방식", "레벨", "그룹", "최대비율", "2D퍼짐", "주제응집", "인용배수"))
    for r in table:
        log("%-14s %5d %6d %7.0f%% %7.2f %8.3f %5.1fx"
            % (r["method"], r["level"], r["groups"], r["max_share"] * 100,
               r["spread"], r["cohesion"], r["lift"]))

    log("")
    log("topical 병합 비용 순서(단조화 전) — 문턱을 고르는 근거:")
    Z = tt["Z"]
    n = tt["n_leaves"]
    log("  " + " ".join("%.3f" % c for c in Z[:, 2]))
    for t in (0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.25):
        k = sum(1 for i in range(2 * n - 1)
                if tt["heights"][i] <= t
                and (tt["parent"][i] is None or tt["heights"][tt["parent"][i]] > t))
        log("  비용 ≤ %.2f → %d개 그룹" % (t, k))

    for name, tree in (("2d k=8,18", t2), ("topical", tt)):
        log("")
        log("%s 레벨 0 구성:" % name)
        for nd in sorted(tree["levels"][0], key=lambda d: -tree["node_size"][d]):
            log("  %5s편  %s" % (
                format(int(tree["node_size"][nd]), ","),
                ", ".join(tree["labels"][c] for c in
                          sorted(tree["members"][nd], key=lambda c: -leaf_size[c]))))
    return {"run_id": run_id, "table": table, "matched": matched}
