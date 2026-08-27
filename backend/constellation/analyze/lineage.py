"""인용 계보 — SPC 메인패스.

기획서 §4-C. Map과 Flow는 의미 공간이 만든 그림이고, 이건 **실제 인용
관계만으로** 그린다. 그래서 두 그림이 어긋나면 어느 쪽이 착시인지 물을 수
있다 — UMAP의 클러스터 간 거리를 신뢰할 수 없다고 적어둔 것에 대한 대조군이다.

**SPC (Search Path Count).** 각 인용 엣지가 "지식의 흐름"에서 얼마나
길목인지를 잰다. 가상의 출발점(아무것도 인용하지 않는 논문들)에서
가상의 도착점(아무에게도 인용되지 않는 논문들)까지 가는 모든 경로 중
그 엣지를 지나는 것의 수다.

    SPC(u→v) = (출발점에서 u까지 오는 경로 수) × (v에서 도착점까지 가는 경로 수)

경로 수는 노드가 1만 개면 천문학적으로 커진다. float64로 담으면 inf가
되므로 **로그 공간에서 logaddexp로 누적**한다. 비교만 하면 되니 로그로
충분하다.

**DAG 보장.** 인용 그래프에는 같은 해 논문끼리의 상호 인용 같은 순환이
있을 수 있다. `year(cited) < year(citing)` 인 엣지만 남겨 시간 방향으로
강제한다. 같은 해 인용은 방향을 정할 근거가 없어 버린다.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable

import numpy as np

from ..db import store

Progress = Callable[[str], None]
NEG_INF = -1e30


def build(
    *,
    run_id: str | None = None,
    model_key: str = "scincl",
    log: Progress = print,
) -> dict:
    conn = store.connect()
    try:
        if not run_id:
            row = conn.execute(
                "SELECT run_id FROM runs WHERE kind='project' AND model=? "
                "ORDER BY created_at DESC LIMIT 1", (model_key,)).fetchone()
            if not row:
                raise RuntimeError("투영 결과가 없다.")
            run_id = row[0]

        works = conn.execute(
            "SELECT w.id, w.year FROM projections p JOIN works w ON w.id = p.work_id "
            "WHERE p.run_id = ? AND w.year IS NOT NULL", (run_id,)).fetchall()
        year = {w: y for w, y in works}
        idx = {w: i for i, w in enumerate(year)}
        ids = list(year)
        n = len(ids)

        raw = conn.execute(
            "SELECT c.citing_id, c.cited_id FROM citations c "
            "JOIN works a ON a.id = c.citing_id JOIN works b ON b.id = c.cited_id"
        ).fetchall()

        # 시간 방향으로만. 같은 해 인용은 방향 근거가 없어 버린다.
        edges: list[tuple[int, int]] = []
        same_year = 0
        for citing, cited in raw:
            if citing not in idx or cited not in idx:
                continue
            if year[cited] < year[citing]:
                edges.append((idx[cited], idx[citing]))   # 앞 → 뒤
            elif year[cited] == year[citing]:
                same_year += 1
        edges = list(set(edges))
        log("노드 %s개 · 엣지 %s개 (같은 해 인용 %s개는 제외)"
            % (format(n, ","), format(len(edges), ","), format(same_year, ",")))
        if not edges:
            raise RuntimeError("시간 방향 인용 엣지가 없다.")

        succ: list[list[int]] = [[] for _ in range(n)]
        pred: list[list[int]] = [[] for _ in range(n)]
        for u, v in edges:
            succ[u].append(v)
            pred[v].append(u)

        # 연도 순 = 위상 순. 같은 해끼리는 엣지가 없으므로 안전하다.
        order = sorted(range(n), key=lambda i: year[ids[i]])

        # 앞에서 오는 경로 수 (로그)
        log_in = np.full(n, NEG_INF)
        for i in order:
            if not pred[i]:
                log_in[i] = 0.0            # 경로 1개 = log 0
            else:
                acc = NEG_INF
                for p in pred[i]:
                    acc = np.logaddexp(acc, log_in[p])
                log_in[i] = acc

        # 뒤로 가는 경로 수 (로그)
        log_out = np.full(n, NEG_INF)
        for i in reversed(order):
            if not succ[i]:
                log_out[i] = 0.0
            else:
                acc = NEG_INF
                for s in succ[i]:
                    acc = np.logaddexp(acc, log_out[s])
                log_out[i] = acc

        spc = {(u, v): log_in[u] + log_out[v] for u, v in edges}
        log("SPC 계산 완료 — 최대 log %.1f, 최소 log %.1f"
            % (max(spc.values()), min(spc.values())))

        # ── 메인패스: 최대 엣지에서 앞뒤로 탐욕 확장 ──
        best = max(spc, key=spc.get)
        path = [best[0], best[1]]
        cur = best[0]
        while pred[cur]:
            p = max(pred[cur], key=lambda x: spc[(x, cur)])
            path.insert(0, p)
            cur = p
        cur = best[1]
        while succ[cur]:
            s = max(succ[cur], key=lambda x: spc[(cur, x)])
            path.append(s)
            cur = s
        main = {(path[i], path[i + 1]) for i in range(len(path) - 1)}

        conn.execute("DELETE FROM citation_spc WHERE run_id = ?", (run_id,))
        store.bulk_insert(
            conn, "citation_spc",
            ["run_id", "cited_id", "citing_id", "log_spc", "on_main"],
            [(run_id, ids[u], ids[v], float(spc[(u, v)]), (u, v) in main)
             for u, v in edges])
        conn.execute(
            "INSERT OR REPLACE INTO runs "
            "(run_id, kind, model, params_json, n_items, created_at) VALUES (?,?,?,?,?,?)",
            (run_id + "|lineage", "lineage", model_key,
             json.dumps({"nodes": n, "edges": len(edges),
                         "same_year_dropped": same_year,
                         "main_path_len": len(path)}),
             len(edges), datetime.now(timezone.utc).replace(tzinfo=None)))
        conn.commit()

        titles = {w: t for w, t in conn.execute(
            "SELECT id, title FROM works WHERE id IN (%s)"
            % ",".join("'%s'" % ids[i].replace("'", "") for i in path)).fetchall()}
        log("")
        log("메인패스 %d편:" % len(path))
        for i in path:
            log("  %d  %s" % (year[ids[i]], (titles.get(ids[i]) or ids[i])[:78]))

        return {"run_id": run_id, "nodes": n, "edges": len(edges),
                "main_path": [ids[i] for i in path]}
    finally:
        conn.close()
