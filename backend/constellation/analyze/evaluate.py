"""임베딩 품질 평가 — 인용 이웃 일치도.

M1의 열린 질문은 "어느 모델인가"다. 눈으로 지도를 보고 고르면 근거가 약하다.
다행히 우리에겐 정답지가 있다: 코퍼스 내부 인용 엣지 62,703개.

좋은 논문 임베딩이라면 **인용으로 연결된 두 논문이 임베딩 공간에서도
가까워야 한다.** 그래서 각 논문의 k-최근접 이웃을 구하고, 그 안에 실제
인용 상대가 몇 개나 들어오는지 센다.

주의 — SciNCL과 SPECTER2는 인용 신호로 학습된 모델이라 이 지표에 구조적으로
유리하다. 그건 편향이지만, 우리 용도(지적 계보를 반영하는 지도)에서는 바로
그 성질을 원하는 것이다. bge-m3는 인용을 안 본 대조군으로 둔다.
"""
from __future__ import annotations

from typing import Callable

import numpy as np

from ..db import store

Progress = Callable[[str], None]


def load_matrix(model_key: str) -> tuple[list[str], np.ndarray]:
    """works.parquet 순서대로 (work_ids, 정규화된 벡터 행렬)."""
    import pyarrow.parquet as pq

    from ..embed.cache import EmbeddingStore

    st = EmbeddingStore(model_key)
    tbl = pq.read_table(st.dir / "works.parquet")
    work_ids = tbl.column("work_id").to_pylist()
    hashes = tbl.column("text_hash").to_pylist()
    return work_ids, st.matrix_for(hashes)


def internal_edges(work_ids: list[str]) -> dict[int, set[int]]:
    """양 끝이 코퍼스 안에 있는 인용을 무방향 인접 리스트로."""
    idx = {w: i for i, w in enumerate(work_ids)}
    conn = store.connect(read_only=True)
    try:
        rows = conn.execute(
            "SELECT c.citing_id, c.cited_id FROM citations c "
            "JOIN works a ON a.id = c.citing_id "
            "JOIN works b ON b.id = c.cited_id"
        ).fetchall()
    finally:
        conn.close()

    adj: dict[int, set[int]] = {}
    for a, b in rows:
        ia, ib = idx.get(a), idx.get(b)
        if ia is None or ib is None or ia == ib:
            continue
        adj.setdefault(ia, set()).add(ib)
        adj.setdefault(ib, set()).add(ia)
    return adj


def citation_neighbor_score(
    vectors: np.ndarray,
    adj: dict[int, set[int]],
    ks: tuple[int, ...] = (10, 25),
    chunk: int = 1024,
    log: Progress = print,
) -> dict:
    """k-최근접 이웃 안에 실제 인용 상대가 얼마나 들어오는지.

    벡터는 L2 정규화되어 있으므로 내적이 곧 코사인 유사도다.
    """
    n = vectors.shape[0]
    kmax = max(ks)
    targets = sorted(i for i, s in adj.items() if s)
    if not targets:
        raise RuntimeError("내부 인용 엣지가 없다")

    hits = {k: 0 for k in ks}
    denom = {k: 0 for k in ks}
    linked_sims: list[float] = []

    for start in range(0, len(targets), chunk):
        block = targets[start:start + chunk]
        sims = vectors[block] @ vectors.T           # (b, n)
        for r, i in enumerate(block):
            sims[r, i] = -np.inf                    # 자기 자신 제외
        top = np.argpartition(-sims, kmax, axis=1)[:, :kmax]
        # argpartition은 순서를 보장하지 않는다. 상위 k를 정확히 자르려면 정렬한다.
        for r, i in enumerate(block):
            cand = top[r]
            order = cand[np.argsort(-sims[r, cand])]
            linked = adj[i]
            for k in ks:
                inter = len(linked.intersection(order[:k].tolist()))
                hits[k] += inter
                denom[k] += min(k, len(linked))
            linked_sims.extend(float(sims[r, j]) for j in linked)
        if start and start % (chunk * 4) == 0:
            log("    %s/%s" % (format(start, ","), format(len(targets), ",")))

    # 무작위 기준선 — 이웃을 아무렇게나 골랐을 때의 기대 재현율
    rng = np.random.default_rng(0)
    pairs = rng.integers(0, n, size=(200_000, 2))
    pairs = pairs[pairs[:, 0] != pairs[:, 1]]
    rand_sims = np.einsum("ij,ij->i", vectors[pairs[:, 0]], vectors[pairs[:, 1]])

    out: dict = {"n_targets": len(targets), "n_works": n}
    for k in ks:
        recall = hits[k] / denom[k] if denom[k] else 0.0
        base = k / (n - 1)
        out["recall@%d" % k] = recall
        out["baseline@%d" % k] = base
        out["lift@%d" % k] = recall / base if base else 0.0
    out["sim_linked_median"] = float(np.median(linked_sims))
    out["sim_random_median"] = float(np.median(rand_sims))
    out["sim_gap"] = out["sim_linked_median"] - out["sim_random_median"]
    return out


def evaluate(model_key: str, log: Progress = print) -> dict:
    log("모델 %s 평가" % model_key)
    work_ids, vecs = load_matrix(model_key)
    log("  벡터 %s × %d" % (format(vecs.shape[0], ","), vecs.shape[1]))
    adj = internal_edges(work_ids)
    log("  인용 연결이 있는 논문 %s편" % format(len(adj), ","))
    res = citation_neighbor_score(vecs, adj, log=log)
    res["model"] = model_key
    res["dim"] = int(vecs.shape[1])
    return res
