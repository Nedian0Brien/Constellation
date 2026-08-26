"""차원 축소 — PCA(50) → UMAP(2D, 3D).

좌표 안정성이 이 모듈의 존재 이유다. 논문을 추가할 때마다 UMAP을 새로
학습하면 지도가 통째로 회전·반전되어 사용자가 방향 감각을 잃는다.
학습한 모델을 저장해두고 신규 논문은 transform()으로만 얹으며, 전체
재학습은 --refit 플래그로만 한다.
"""
from __future__ import annotations

import json
import pickle
from datetime import datetime, timezone
from typing import Callable

import numpy as np

from ..config import DATA
from ..db import store
from .evaluate import load_matrix

Progress = Callable[[str], None]

MODEL_DIR = DATA / "models"
PCA_DIM = 50


def _paths(model_key: str) -> dict[str, "object"]:
    d = MODEL_DIR / model_key
    return {
        "dir": d,
        "pca": d / "pca.pkl",
        "umap2": d / "umap2.pkl",
        "umap3": d / "umap3.pkl",
    }


def project(
    model_key: str,
    *,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    refit: bool = False,
    seed: int = 42,
    log: Progress = print,
) -> dict:
    from sklearn.decomposition import PCA
    import umap

    p = _paths(model_key)
    work_ids, vecs = load_matrix(model_key)
    log("벡터 %s × %d" % (format(vecs.shape[0], ","), vecs.shape[1]))

    # ── PCA ──
    if p["pca"].exists() and not refit:
        with open(p["pca"], "rb") as f:
            pca = pickle.load(f)
        reduced = pca.transform(vecs)
        log("PCA %d차원 (저장된 모델 재사용)" % reduced.shape[1])
    else:
        dim = min(PCA_DIM, vecs.shape[1], vecs.shape[0])
        pca = PCA(n_components=dim, random_state=seed)
        reduced = pca.fit_transform(vecs)
        log("PCA %d차원 학습 — 설명 분산 %.1f%%"
            % (dim, pca.explained_variance_ratio_.sum() * 100))

    # ── UMAP ──
    out: dict[str, np.ndarray] = {}
    for dims, key in ((2, "umap2"), (3, "umap3")):
        if p[key].exists() and not refit:
            with open(p[key], "rb") as f:
                red = pickle.load(f)
            out[key] = red.transform(reduced)
            log("UMAP %dD (저장된 모델로 transform)" % dims)
        else:
            log("UMAP %dD 학습 중 (n_neighbors=%d, min_dist=%.2f)..."
                % (dims, n_neighbors, min_dist))
            red = umap.UMAP(
                n_components=dims,
                n_neighbors=n_neighbors,
                min_dist=min_dist,
                metric="cosine",
                random_state=seed,
            )
            out[key] = red.fit_transform(reduced)
            p["dir"].mkdir(parents=True, exist_ok=True)
            with open(p[key], "wb") as f:
                pickle.dump(red, f)

    if refit or not p["pca"].exists():
        p["dir"].mkdir(parents=True, exist_ok=True)
        with open(p["pca"], "wb") as f:
            pickle.dump(pca, f)

    xy, xyz = out["umap2"], out["umap3"]
    run_id = "project-%s-%s" % (
        model_key, datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))

    conn = store.connect()
    try:
        store.bulk_insert(
            conn, "projections", ["run_id", "work_id", "x", "y", "z"],
            [(run_id, w, float(xy[i, 0]), float(xy[i, 1]), float(xyz[i, 2]))
             for i, w in enumerate(work_ids)],
        )
        conn.execute(
            "INSERT OR REPLACE INTO runs "
            "(run_id, kind, model, params_json, n_items, created_at) VALUES (?,?,?,?,?,?)",
            (run_id, "project", model_key,
             json.dumps({"n_neighbors": n_neighbors, "min_dist": min_dist,
                         "pca_dim": int(reduced.shape[1]), "seed": seed,
                         "refit": refit}),
             len(work_ids), datetime.now(timezone.utc).replace(tzinfo=None)),
        )
        conn.commit()
    finally:
        conn.close()

    log("투영 완료 — run %s" % run_id)
    log("  2D 범위  x [%.1f, %.1f]  y [%.1f, %.1f]"
        % (xy[:, 0].min(), xy[:, 0].max(), xy[:, 1].min(), xy[:, 1].max()))
    return {"run_id": run_id, "n": len(work_ids)}
