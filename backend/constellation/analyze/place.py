"""이미 만든 지도에 논문을 더하고 빼기. 기존 논문의 좌표·클러스터·이름은 건드리지 않는다.

좌표 — 지도를 만들 때 저장한 PCA → UMAP 2D·3D 모델로 `transform`한다.
클러스터 — 클러스터링 모델(UMAP 10차원, HDBSCAN)은 저장돼 있지 않다
(`analyze/cluster.py`). 임베딩 공간에서 가장 가까운 지도 안 논문 k편의 클러스터
다수결로 배정한다. 이웃 절반 넘게 미분류면 미분류로 둔다.

쓰기는 한 트랜잭션이다. 앞 단계(수집·임베딩)에서 실패하면 지도와 코퍼스 소속에는
아무것도 남지 않는다.
"""
from __future__ import annotations

import pickle
from collections import Counter
from typing import Any, Callable

import numpy as np

from ..db import store
from .evaluate import load_matrix
from .project import _paths

Progress = Callable[[str], None]
K = 15
MANUAL = "manual"


def map_info(conn, run_id: str) -> dict[str, Any]:
    """지도의 코퍼스·모델. 투영 모델 파일이 없으면 배치할 수 없다."""
    row = conn.execute(
        "SELECT corpus_id, model FROM runs WHERE run_id = ? AND kind = 'project'",
        (run_id,)).fetchone()
    if not row:
        raise ValueError("없는 지도: %s" % run_id)
    corpus, model = row
    if not corpus:
        raise ValueError("코퍼스가 정해지지 않은 지도에는 논문을 추가할 수 없다: %s" % run_id)
    p = _paths(corpus, model)
    missing = [k for k in ("pca", "umap2", "umap3") if not p[k].exists()]
    if missing:
        raise ValueError("투영 모델 파일이 없다(%s): %s"
                         % (", ".join(missing), p["dir"]))
    return {"corpus": corpus, "model": model, "paths": p}


def assign(sims: np.ndarray, labels: np.ndarray, k: int = K) -> tuple[int, float, float]:
    """이웃 유사도와 이웃 클러스터로 (클러스터, 같은 클러스터 이웃 비율, 최근접 유사도)."""
    k = min(k, len(sims))
    top = np.argpartition(-sims, k - 1)[:k]
    top = top[np.argsort(-sims[top])]
    near = labels[top]
    if (near == -1).sum() * 2 > k:
        return -1, float((near == -1).sum() / k), float(sims[top[0]])
    count: Counter[int] = Counter()
    weight: dict[int, float] = {}
    for i, c in zip(top, near):
        if c == -1:
            continue
        count[int(c)] += 1
        weight[int(c)] = weight.get(int(c), 0.0) + float(sims[i])
    best = max(count, key=lambda c: (count[c], weight[c]))
    return best, count[best] / k, float(sims[top[0]])


def _recount(conn, run_id: str) -> None:
    conn.execute(
        "UPDATE cluster_meta SET size = (SELECT count(*) FROM clusters c "
        "WHERE c.run_id = cluster_meta.run_id AND c.cluster_id = cluster_meta.cluster_id) "
        "WHERE run_id = ?", (run_id,))


def place(run_id: str, work_ids: list[str], *, k: int = K,
          log: Progress = print) -> list[dict[str, Any]]:
    """논문들을 지도에 배치한다. 이미 지도에 있는 논문은 호출한 쪽이 걸러 낸다."""
    conn = store.connect(read_only=True)
    try:
        info = map_info(conn, run_id)
        old = conn.execute(
            "SELECT p.work_id, coalesce(c.cluster_id, -1) FROM projections p "
            "LEFT JOIN clusters c ON c.run_id = p.run_id AND c.work_id = p.work_id "
            "WHERE p.run_id = ? ORDER BY p.work_id", (run_id,)).fetchall()
        labels = dict(conn.execute(
            "SELECT cluster_id, label FROM cluster_meta WHERE run_id = ?", (run_id,)).fetchall())
        titles = dict(conn.execute(
            "SELECT id, title FROM works WHERE list_contains(?, id)", (work_ids,)).fetchall())
        has_abstract = dict(conn.execute(
            "SELECT id, has_abstract FROM works WHERE list_contains(?, id)",
            (work_ids,)).fetchall())
    finally:
        conn.close()
    already = {w for w, _ in old} & set(work_ids)
    if already:
        raise ValueError("이미 지도에 있는 논문: %s" % ", ".join(sorted(already)))

    old_ids = [w for w, _ in old]
    old_label = dict(old)
    ids_old, v_old = load_matrix(info["model"], old_ids)
    lab_old = np.array([old_label[w] for w in ids_old])
    ids_new, v_new = load_matrix(info["model"], work_ids)

    p = info["paths"]
    with open(p["pca"], "rb") as f:
        pca = pickle.load(f)
    reduced = pca.transform(v_new)
    with open(p["umap2"], "rb") as f:
        xy = pickle.load(f).transform(reduced)
    with open(p["umap3"], "rb") as f:
        xyz = pickle.load(f).transform(reduced)
    log("좌표 변환 %d편 (저장된 PCA·UMAP)" % len(ids_new))

    sims = v_new @ v_old.T
    out = []
    for i, w in enumerate(ids_new):
        c, prob, near = assign(sims[i], lab_old, k)
        out.append({"id": w, "title": titles.get(w), "cluster": c,
                    "label": labels.get(c) if c != -1 else None,
                    "probability": prob, "similarity": near,
                    "title_only": not has_abstract.get(w, False),
                    "x": float(xy[i, 0]), "y": float(xy[i, 1]), "z": float(xyz[i, 2])})
        log("  %s → %s (이웃 %.0f%%, 최근접 유사도 %.2f)"
            % ((titles.get(w) or w)[:60], labels.get(c, "미분류"), prob * 100, near))

    conn = store.connect()
    try:
        conn.begin()
        store.add_members(conn, info["corpus"], ids_new, MANUAL)
        store.bulk_insert(conn, "projections", ["run_id", "work_id", "x", "y", "z"],
                          [(run_id, r["id"], r["x"], r["y"], r["z"]) for r in out])
        store.bulk_insert(conn, "clusters", ["run_id", "work_id", "cluster_id", "probability"],
                          [(run_id, r["id"], r["cluster"], r["probability"]) for r in out])
        _recount(conn, run_id)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()
    return out


def added_ratio(run_id: str) -> tuple[int, int]:
    """(추가한 논문 수, 수집으로 들어온 논문 수). 재계산을 권할지 정한다."""
    conn = store.connect(read_only=True)
    try:
        return conn.execute(
            "SELECT count(*) FILTER (WHERE m.via = ?), count(*) FILTER (WHERE m.via <> ?) "
            "FROM projections p JOIN runs r ON r.run_id = p.run_id "
            "JOIN corpus_works m ON m.corpus_id = r.corpus_id AND m.work_id = p.work_id "
            "WHERE p.run_id = ?", (MANUAL, MANUAL, run_id)).fetchone()
    finally:
        conn.close()


def remove(run_id: str, work_ids: list[str], *, log: Progress = print) -> list[str]:
    """추가한 논문을 지도에서 뺀다. 수집으로 들어온 논문이 섞이면 거부한다."""
    conn = store.connect()
    try:
        info = conn.execute("SELECT corpus_id FROM runs WHERE run_id = ? AND kind = 'project'",
                            (run_id,)).fetchone()
        if not info:
            raise ValueError("없는 지도: %s" % run_id)
        corpus = info[0]
        via = dict(conn.execute(
            "SELECT work_id, via FROM corpus_works WHERE corpus_id = ? AND list_contains(?, work_id)",
            (corpus, work_ids)).fetchall())
        in_map = {r[0] for r in conn.execute(
            "SELECT work_id FROM projections WHERE run_id = ? AND list_contains(?, work_id)",
            (run_id, work_ids)).fetchall()}
        collected = sorted(w for w in work_ids if w in in_map and via.get(w) != MANUAL)
        if collected:
            raise ValueError("수집으로 들어온 논문은 뺄 수 없다: %s" % ", ".join(collected))
        ids = sorted(w for w in work_ids if w in in_map)
        if not ids:
            return []
        # 같은 코퍼스의 다른 지도에도 있으면 코퍼스 소속은 남긴다.
        elsewhere = {r[0] for r in conn.execute(
            "SELECT DISTINCT p.work_id FROM projections p JOIN runs r ON r.run_id = p.run_id "
            "WHERE r.corpus_id = ? AND r.kind = 'project' AND p.run_id <> ? "
            "AND list_contains(?, p.work_id)", (corpus, run_id, ids)).fetchall()}
        drop = [w for w in ids if w not in elsewhere]
        conn.begin()
        try:
            conn.execute("DELETE FROM projections WHERE run_id = ? AND list_contains(?, work_id)",
                         (run_id, ids))
            conn.execute("DELETE FROM clusters WHERE run_id = ? AND list_contains(?, work_id)",
                         (run_id, ids))
            if drop:
                conn.execute("DELETE FROM corpus_works WHERE corpus_id = ? AND via = ? "
                             "AND list_contains(?, work_id)", (corpus, MANUAL, drop))
            _recount(conn, run_id)
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        log("지도에서 %d편을 뺐다" % len(ids))
        return ids
    finally:
        conn.close()
