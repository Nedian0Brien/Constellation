"""시간 슬라이스 흐름 — 이 프로젝트의 핵심.

"연구가 어디서 갈라져 나왔는가"에 답한다. 절차:

  1. 코퍼스를 시간 창으로 자른다 (겹치지 않게)
  2. 각 창에서 **독립적으로** 클러스터링한다
  3. 인접 창의 클러스터 쌍을 세 신호로 잇는다

**창을 겹치지 않게 자르는 이유.** 3년 폭 1년 간격으로 슬라이딩하면 인접
창이 논문의 2/3를 공유한다. 그러면 "흐름"이 지식 전파가 아니라 같은 논문이
양쪽에 있다는 사실을 재는 꼴이 된다. 겹치지 않아야 인용 신호가 의미를 갖는다.

**세 신호.**

  인용 흐름   뒤 창의 클러스터 B의 논문들이 앞 창의 클러스터 A를 인용한 비율.
              가장 인과적이다 — 실제로 지식이 건너간 경로다.
  의미 유사도  두 클러스터 중심 임베딩의 코사인. 인용이 없는 신생 주제도 잇는다.
  저자 연속성  B의 저자 중 A에도 있었던 사람의 비율. 사람이 옮겨간 경로.

셋을 가중 결합하되 **성분을 각각 저장한다.** UI에서 신호별로 켜고 끌 수
있어야 하고, 흐름이 이상할 때 어느 신호 탓인지 짚을 수 있어야 한다.

**클러스터링 공간.** 전역 PCA50 → UMAP10을 한 번 만들고, 그 안에서 창별
부분집합을 HDBSCAN으로 나눈다. 공간은 공유하되 클러스터링은 창마다
독립이므로 주제가 생기고 갈라지고 사라지는 것이 그대로 잡힌다. 창마다
UMAP을 새로 학습하면 창끼리 좌표계가 달라져 의미 유사도를 비교할 수 없다.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable

import numpy as np

from ..db import store
from .cluster import _fit_labels
from .evaluate import load_matrix

Progress = Callable[[str], None]

# 결합 가중치. 인용을 가장 무겁게 둔다.
W_CITE, W_SEM, W_AUTH = 0.5, 0.3, 0.2

# to_cluster 기준 유입량의 이 비율 미만인 흐름은 버린다. 안 그러면 털뭉치가 된다.
MIN_WEIGHT = 0.08


def _windows(years: list[int], width: int, year_min: int) -> list[tuple[int, int]]:
    lo = max(min(years), year_min)
    hi = max(years)
    out = []
    y = lo
    while y <= hi:
        out.append((y, min(y + width - 1, hi)))
        y += width
    # 마지막 창이 너무 얇으면 앞 창에 붙인다
    if len(out) >= 2 and (out[-1][1] - out[-1][0] + 1) <= width // 2:
        out[-2] = (out[-2][0], out[-1][1])
        out.pop()
    return out


def build(
    model_key: str = "scincl",
    *,
    run_id: str | None = None,
    width: int = 3,
    year_min: int = 2014,
    min_cluster_frac: float = 0.012,
    log: Progress = print,
) -> dict:
    import umap
    from sklearn.cluster import HDBSCAN
    from sklearn.decomposition import PCA

    conn = store.connect()
    try:
        if not run_id:
            row = conn.execute(
                "SELECT run_id FROM runs WHERE kind='project' AND model=? "
                "ORDER BY created_at DESC LIMIT 1", (model_key,)).fetchone()
            if not row:
                raise RuntimeError("투영 결과가 없다.")
            run_id = row[0]

        rows = conn.execute(
            "SELECT w.id, w.year, w.title, w.abstract "
            "FROM projections p JOIN works w ON w.id = p.work_id "
            "WHERE p.run_id = ? AND w.year IS NOT NULL ORDER BY w.id", (run_id,)
        ).fetchall()
        wid = [r[0] for r in rows]
        year = {r[0]: r[1] for r in rows}
        text = {r[0]: (r[2] or "") + " " + (r[3] or "") for r in rows}

        # 저자·인용은 신호 계산에 쓴다
        authors: dict[str, set[str]] = {}
        for w, a in conn.execute(
            "SELECT wa.work_id, wa.author_id FROM work_authors wa "
            "JOIN projections p ON p.work_id = wa.work_id AND p.run_id = ?", (run_id,)
        ).fetchall():
            authors.setdefault(w, set()).add(a)
        refs: dict[str, list[str]] = {}
        for a, b in conn.execute(
            "SELECT c.citing_id, c.cited_id FROM citations c "
            "JOIN works x ON x.id = c.citing_id JOIN works y ON y.id = c.cited_id"
        ).fetchall():
            refs.setdefault(a, []).append(b)

        wins = _windows([year[w] for w in wid], width, year_min)
        log("창 %d개 (폭 %d년, %d년부터): %s"
            % (len(wins), width, year_min,
               ", ".join("%d–%d" % w for w in wins)))

        # ── 공유 공간 ──
        ids2, V = load_matrix(model_key)
        order = {w: i for i, w in enumerate(ids2)}
        Vm = V[[order[w] for w in wid]]
        log("전역 PCA50 → UMAP10 학습...")
        P = PCA(n_components=50, random_state=42).fit_transform(Vm)
        U = umap.UMAP(n_components=10, n_neighbors=15, min_dist=0.0,
                      metric="cosine", random_state=42).fit_transform(P)
        row_of = {w: i for i, w in enumerate(wid)}

        # ── 창별 독립 클러스터링 ──
        members: list[dict[int, list[str]]] = []     # window -> cluster -> [work_id]
        centro: list[dict[int, np.ndarray]] = []     # window -> cluster -> 임베딩 중심
        labels_by_win: list[dict[int, list[str]]] = []
        conn.execute("DELETE FROM flow_windows  WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM flow_clusters WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM flow_members  WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM flows         WHERE run_id = ?", (run_id,))

        for wi, (y0, y1) in enumerate(wins):
            sub = [w for w in wid if y0 <= year[w] <= y1]
            idx = [row_of[w] for w in sub]
            # 0.02면 2017-19 창에 34%짜리 허브가 생겨 다음 창 11개 중 5개의
            # 최상위 출처로 잡힌다. 실제 구조가 아니라 덩어리가 큰 탓이다.
            # 0.015 이하에서 최대 덩어리가 15~18%로 고르게 잡힌다.
            mcs = max(15, int(len(sub) * min_cluster_frac))
            lab = HDBSCAN(min_cluster_size=mcs, cluster_selection_method="eom",
                          metric="euclidean", copy=True).fit_predict(U[idx])
            mem: dict[int, list[str]] = {}
            for w, c in zip(sub, lab):
                if c >= 0:
                    mem.setdefault(int(c), []).append(w)
            members.append(mem)
            centro.append({c: Vm[[row_of[w] for w in ws]].mean(0) for c, ws in mem.items()})
            kws = _fit_labels([text[w] for w in sub], lab, log=lambda *a: None)
            labels_by_win.append(kws)
            noise = int((lab == -1).sum())
            log("  %d–%d  %s편 · 클러스터 %d개 · 미분류 %d (%.0f%%)"
                % (y0, y1, format(len(sub), ","), len(mem), noise,
                   noise / max(len(sub), 1) * 100))

            store.bulk_insert(
                conn, "flow_clusters",
                ["run_id", "window_idx", "cluster_id", "label", "label_src",
                 "keywords", "size"],
                [(run_id, wi, c, " · ".join(kws.get(c, [])[:3]) or "cluster %d" % c,
                  "ctfidf", ", ".join(kws.get(c, [])), len(ws))
                 for c, ws in mem.items()])
            store.bulk_insert(
                conn, "flow_members", ["run_id", "window_idx", "cluster_id", "work_id"],
                [(run_id, wi, c, w) for c, ws in mem.items() for w in ws])
        store.bulk_insert(
            conn, "flow_windows",
            ["run_id", "window_idx", "year_from", "year_to", "n_works", "n_clusters"],
            [(run_id, i, y0, y1,
              sum(len(v) for v in members[i].values()), len(members[i]))
             for i, (y0, y1) in enumerate(wins)])

        # ── 인접 창 잇기 ──
        log("")
        flows = []
        for t in range(len(wins) - 1):
            A, B = members[t], members[t + 1]
            if not A or not B:
                continue
            of_a = {w: c for c, ws in A.items() for w in ws}
            auth_a = {c: set().union(*[authors.get(w, set()) for w in ws]) if ws else set()
                      for c, ws in A.items()}

            for cb, wsb in B.items():
                # 1) 인용 흐름 — B의 참고문헌 중 앞 창에 떨어진 것의 분포
                hits: dict[int, int] = {}
                total = 0
                for w in wsb:
                    for r in refs.get(w, ()):
                        ca = of_a.get(r)
                        if ca is not None:
                            hits[ca] = hits.get(ca, 0) + 1
                            total += 1
                cite = {c: n / total for c, n in hits.items()} if total else {}

                # 2) 의미 유사도 — 중심 코사인을 A들에 걸쳐 정규화
                vb = centro[t + 1][cb]
                vb = vb / (np.linalg.norm(vb) + 1e-9)
                sims = {}
                for ca, va in centro[t].items():
                    va = va / (np.linalg.norm(va) + 1e-9)
                    sims[ca] = max(0.0, float(va @ vb))
                ssum = sum(sims.values()) or 1.0
                sem = {c: v / ssum for c, v in sims.items()}

                # 3) 저자 연속성 — B의 저자 중 A에도 있던 비율
                ab = set().union(*[authors.get(w, set()) for w in wsb]) if wsb else set()
                auth = ({c: len(ab & aa) / len(ab) for c, aa in auth_a.items()}
                        if ab else {})

                comb = {}
                for ca in A:
                    v = (W_CITE * cite.get(ca, 0.0)
                         + W_SEM * sem.get(ca, 0.0)
                         + W_AUTH * auth.get(ca, 0.0))
                    if v > 0:
                        comb[ca] = v
                if not comb:
                    continue
                tot = sum(comb.values())
                ranked = sorted(comb.items(), key=lambda kv: -kv[1])
                for rank, (ca, v) in enumerate(ranked):
                    wgt = v / tot
                    # 최상위 하나는 임계값을 밑돌아도 남긴다 — 안 그러면
                    # 어디에서도 오지 않은 것처럼 보이는 클러스터가 생긴다.
                    if wgt < MIN_WEIGHT and rank > 0:
                        continue
                    flows.append((run_id, t, ca, t + 1, cb, wgt,
                                  cite.get(ca, 0.0), sem.get(ca, 0.0),
                                  auth.get(ca, 0.0), hits.get(ca, 0)))

        store.bulk_insert(
            conn, "flows",
            ["run_id", "from_window", "from_cluster", "to_window", "to_cluster",
             "weight", "w_citation", "w_semantic", "w_author", "n_papers"],
            flows)
        conn.execute(
            "INSERT OR REPLACE INTO runs "
            "(run_id, kind, model, params_json, n_items, created_at) VALUES (?,?,?,?,?,?)",
            (run_id + "|flow", "flow", model_key,
             json.dumps({"width": width, "year_min": year_min,
                         "weights": [W_CITE, W_SEM, W_AUTH],
                         "min_weight": MIN_WEIGHT,
                         "windows": [list(w) for w in wins]}),
             len(flows), datetime.now(timezone.utc).replace(tzinfo=None)))
        conn.commit()

        n_cite = sum(1 for f in flows if f[6] > 0)
        log("흐름 %d개 (그중 인용 근거가 있는 것 %d개, %.0f%%)"
            % (len(flows), n_cite, n_cite / max(len(flows), 1) * 100))
        return {"run_id": run_id, "windows": len(wins), "flows": len(flows),
                "clusters": sum(len(m) for m in members)}
    finally:
        conn.close()
