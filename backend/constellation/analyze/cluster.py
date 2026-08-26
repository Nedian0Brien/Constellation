"""HDBSCAN 클러스터링 + c-TF-IDF 라벨링.

**어느 공간에서 자를 것인가**를 실측으로 정했다 (scincl, 10,604편):

    공간      선택법  최소크기  클러스터  미분류%  2D응집도  인용배수
    pca50    eom      30        5      69%       -       2.4x
    2d       eom      30       53      26%    0.05       9.6x
    2d       eom      60        2       0%       -       1.1x   <- 붕괴
    2d       leaf     30       69      47%    0.04      25.1x
    umap10   eom      30       45      14%    0.09       9.2x   <- 채택

  pca50    50차원에서는 밀도 기반 클러스터링이 무너진다. 미분류 70%.
  2d/eom   min_cluster_size 30에서 60으로 가면 53개가 2개로 붕괴한다.
           EOM이 루트 덩어리를 골라버리는 것으로, 파라미터에 지나치게 취약하다.
  leaf     인용 일치도는 25배로 가장 높지만 미분류가 절반이다. 지도의 절반이
           회색이 되므로 "지도를 읽을 수 있다"는 목표와 충돌한다.
  umap10   클러스터링 전용 10차원 UMAP. 미분류가 14%로 가장 낮으면서 2D 응집도
           0.09로 지도에서도 뭉쳐 보인다. 라벨 품질도 가장 깨끗했다.

2D 응집도 = 클러스터 내 평균 반경 / 전체 반경. 낮을수록 지도에 라벨을 얹을 수 있다.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Callable

import numpy as np

from ..db import store
from .evaluate import load_matrix

Progress = Callable[[str], None]

# 학술 초록 어디에나 나와서 갈래를 구분하지 못하는 말들
BOILERPLATE = [
    "paper", "papers", "study", "studies", "approach", "approaches",
    "method", "methods", "propose", "proposed", "proposes", "present",
    "presented", "result", "results", "show", "shows", "shown",
    "experiment", "experiments", "experimental", "performance",
    "based", "using", "used", "use", "novel", "new", "state", "art",
    "task", "tasks", "model", "models", "data", "dataset", "datasets",
    "problem", "problems", "work", "works", "research", "provide",
    "demonstrate", "achieve", "achieves", "significantly", "improve",
    "improves", "improved", "effective", "efficient", "framework",
    "system", "systems", "algorithm", "algorithms", "technique",
    "techniques", "analysis", "evaluation", "evaluate", "compared",
]

_WORD = re.compile(r"[a-z][a-z0-9\-]{2,}")


def _fit_labels(
    texts: list[str], labels: np.ndarray, top_k: int = 8, log: Progress = print
) -> dict[int, list[str]]:
    """c-TF-IDF — 클러스터 하나를 문서 하나로 보고 특징 용어를 뽑는다.

    일반 TF-IDF를 논문마다 돌리면 개별 논문의 특이 용어가 뜬다. 클러스터를
    통째로 한 문서로 합치면 "이 덩어리를 다른 덩어리와 구별하는 말"이 뜬다.
    """
    from sklearn.feature_extraction.text import CountVectorizer

    ids = sorted(set(int(c) for c in labels) - {-1})
    if not ids:
        return {}

    docs = []
    for cid in ids:
        idx = np.where(labels == cid)[0]
        docs.append(" ".join(texts[i] for i in idx))

    # 문서 = 클러스터다. 클러스터가 3개뿐이면 비율로 준 max_df가 min_df보다
    # 작아져 벡터라이저가 터진다. 절대 개수로 주고 클러스터 수에 맞춘다.
    n_docs = len(docs)
    max_docs = max(1, int(n_docs * 0.7))     # 70% 넘는 덩어리에 나오면 구별력 없음
    min_docs = 1 if n_docs < 6 else 2
    vec = CountVectorizer(
        ngram_range=(1, 2),
        min_df=min_docs,
        max_df=max(max_docs, min_docs),
        stop_words="english",
        token_pattern=_WORD.pattern,
        max_features=60_000,
    )
    X = vec.fit_transform(docs).toarray().astype(np.float64)
    vocab = np.array(vec.get_feature_names_out())

    # 도메인 상투어 제거 — 단어 하나든 바이그램의 구성요소든
    bad = set(BOILERPLATE)
    keep = np.array([
        not all(tok in bad for tok in t.split()) for t in vocab
    ])
    X, vocab = X[:, keep], vocab[keep]

    # c-TF-IDF (BERTopic 방식): tf * log(1 + A / f)
    #   tf = 클러스터 내 상대 빈도, A = 클러스터당 평균 단어수, f = 전체 빈도
    tf = X / np.maximum(X.sum(axis=1, keepdims=True), 1)
    f = np.maximum(X.sum(axis=0), 1)
    A = X.sum() / len(ids)
    w = tf * np.log(1 + A / f)

    out: dict[int, list[str]] = {}
    for r, cid in enumerate(ids):
        order = np.argsort(-w[r])
        terms: list[str] = []
        for j in order:
            t = str(vocab[j])
            # 이미 뽑은 용어에 포함되는 말은 건너뛴다 ("dense" vs "dense retrieval")
            if any(t in s or s in t for s in terms):
                continue
            terms.append(t)
            if len(terms) >= top_k:
                break
        out[cid] = terms
    return out


def cluster(
    model_key: str,
    *,
    run_id: str | None = None,
    space: str = "umap10",
    min_cluster_size: int = 30,
    min_samples: int | None = None,
    selection: str = "eom",
    log: Progress = print,
) -> dict:
    from sklearn.cluster import HDBSCAN

    conn = store.connect()
    try:
        if not run_id:
            row = conn.execute(
                "SELECT run_id FROM runs WHERE kind='project' AND model=? "
                "ORDER BY created_at DESC LIMIT 1", (model_key,)
            ).fetchone()
            if not row:
                raise RuntimeError("%s 의 투영 결과가 없다. project 를 먼저 돌려라." % model_key)
            run_id = row[0]

        rows = conn.execute(
            "SELECT p.work_id, p.x, p.y, w.title, w.abstract, w.year, "
            "       coalesce(w.cited_by_count, 0) "
            "FROM projections p JOIN works w ON w.id = p.work_id "
            "WHERE p.run_id = ? ORDER BY p.work_id", (run_id,)
        ).fetchall()
        work_ids = [r[0] for r in rows]
        XY = np.array([[r[1], r[2]] for r in rows], dtype=float)
        texts = [((r[3] or "") + " " + (r[4] or "")) for r in rows]
        years = [r[5] for r in rows]
        cited = [r[6] for r in rows]

        if space == "2d":
            V = XY
        elif space in ("pca", "umap10"):
            from sklearn.decomposition import PCA
            ids2, vecs = load_matrix(model_key)
            order = {w: i for i, w in enumerate(ids2)}
            V = PCA(n_components=50, random_state=42).fit_transform(
                vecs[[order[w] for w in work_ids]])
            if space == "umap10":
                import umap
                log("클러스터링용 UMAP 10차원 학습...")
                V = umap.UMAP(n_components=10, n_neighbors=15, min_dist=0.0,
                              metric="cosine", random_state=42).fit_transform(V)
        else:
            raise ValueError("space 는 '2d' | 'umap10' | 'pca'")

        log("run %s · 공간 %s · %s편" % (run_id, space, format(len(work_ids), ",")))
        log("HDBSCAN (min_cluster_size=%d, selection=%s)..."
            % (min_cluster_size, selection))
        hdb = HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            cluster_selection_method=selection,
            metric="euclidean",
            copy=True,
        )
        labels = hdb.fit_predict(V)
        probs = getattr(hdb, "probabilities_", np.ones(len(labels)))

        uniq = sorted(set(int(c) for c in labels) - {-1})
        n_noise = int((labels == -1).sum())
        log("클러스터 %d개 · 미분류 %s편 (%.0f%%)"
            % (len(uniq), format(n_noise, ","), n_noise / len(labels) * 100))
        if not uniq:
            raise RuntimeError("클러스터가 하나도 안 나왔다. min_cluster_size 를 낮춰라.")

        log("c-TF-IDF 라벨 추출...")
        terms = _fit_labels(texts, labels, log=log)

        # ── 저장 ──
        conn.execute("DELETE FROM clusters WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM cluster_meta WHERE run_id = ?", (run_id,))
        store.bulk_insert(
            conn, "clusters", ["run_id", "work_id", "cluster_id", "probability"],
            [(run_id, w, int(labels[i]), float(probs[i]))
             for i, w in enumerate(work_ids)],
        )

        meta = []
        for cid in uniq:
            idx = np.where(labels == cid)[0]
            ks = terms.get(cid, [])
            ys = [years[i] for i in idx if years[i]]
            best = max(idx, key=lambda i: cited[i])
            meta.append((
                run_id, cid,
                " · ".join(ks[:3]) if ks else "cluster %d" % cid,
                ", ".join(ks),
                len(idx),
                float(XY[idx, 0].mean()), float(XY[idx, 1].mean()),
                int(np.median(ys)) if ys else None,
                work_ids[best],
            ))
        store.bulk_insert(
            conn, "cluster_meta",
            ["run_id", "cluster_id", "label", "keywords", "size", "x", "y",
             "year_median", "top_work_id"],
            meta,
        )
        conn.execute(
            "INSERT OR REPLACE INTO runs "
            "(run_id, kind, model, params_json, n_items, created_at) VALUES (?,?,?,?,?,?)",
            (run_id + "|cluster", "cluster", model_key,
             json.dumps({"space": space, "min_cluster_size": min_cluster_size,
                         "selection": selection,
                         "min_samples": min_samples, "n_clusters": len(uniq),
                         "noise": n_noise}),
             len(work_ids), datetime.now(timezone.utc).replace(tzinfo=None)),
        )
        conn.commit()

        log("")
        for _, cid, label, _, size, *_rest in sorted(meta, key=lambda m: -m[4])[:12]:
            log("  %3d  %5s편  %s" % (cid, format(size, ","), label))
        if len(meta) > 12:
            log("  ... 외 %d개" % (len(meta) - 12))

        return {"run_id": run_id, "n_clusters": len(uniq), "noise": n_noise}
    finally:
        conn.close()


def evaluate_clusters(run_id: str, log: Progress = print) -> dict:
    """클러스터가 실제 인용 구조와 맞는지.

    같은 클러스터에 있는 두 논문이 서로 인용할 확률이, 아무 두 논문이
    인용할 확률보다 얼마나 높은가. 공간 선택(2d vs pca)을 비교할 때 쓴다.
    """
    conn = store.connect(read_only=True)
    try:
        rows = conn.execute(
            "SELECT work_id, cluster_id FROM clusters WHERE run_id = ?", (run_id,)
        ).fetchall()
        cl = {w: c for w, c in rows if c != -1}
        edges = conn.execute(
            "SELECT c.citing_id, c.cited_id FROM citations c "
            "JOIN works a ON a.id = c.citing_id JOIN works b ON b.id = c.cited_id"
        ).fetchall()
    finally:
        conn.close()

    inside = sum(1 for a, b in edges if cl.get(a) is not None and cl.get(a) == cl.get(b))
    both = sum(1 for a, b in edges if a in cl and b in cl)
    if not both:
        return {"same_cluster_rate": 0.0, "baseline": 0.0, "lift": 0.0}

    sizes: dict[int, int] = {}
    for c in cl.values():
        sizes[c] = sizes.get(c, 0) + 1
    n = sum(sizes.values())
    baseline = sum((s / n) ** 2 for s in sizes.values())   # 무작위 두 편이 같은 클러스터일 확률
    rate = inside / both
    return {
        "edges_both_clustered": both,
        "same_cluster_rate": rate,
        "baseline": baseline,
        "lift": rate / baseline if baseline else 0.0,
        "n_clusters": len(sizes),
    }
