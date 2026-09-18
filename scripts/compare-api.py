#!/usr/bin/env python3
"""Python(FastAPI) 서버와 Rust(constellation-serve) 서버의 응답을 대조한다.

사용: python3 scripts/compare-api.py [--py http://127.0.0.1:8001] [--rs http://127.0.0.1:8000]

엔드포인트마다 대표 인자로 두 서버를 부르고 JSON을 비교한다. 부동소수는 1e-9까지
같으면 같은 것으로 본다. lineage.nodes처럼 순서가 정의되지 않은 목록은 id로 정렬해
비교한다. 차이가 있으면 첫 경로를 출력하고 종료 코드 1로 끝난다.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.error
import urllib.parse
import urllib.request

UNORDERED = {("lineage", "nodes")}


def get(base: str, path: str, params: dict | None = None):
    url = base + path
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def diff(a, b, path="", key=None):
    if isinstance(a, dict) and isinstance(b, dict):
        if set(a) != set(b):
            return f"{path}: keys {sorted(set(a) ^ set(b))}"
        for k in a:
            d = diff(a[k], b[k], f"{path}.{k}", (key, k) if key is None else (key[0], k))
            if d:
                return d
        return None
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return f"{path}: length {len(a)} != {len(b)}"
        if key in UNORDERED:
            a = sorted(a, key=lambda x: x["id"])
            b = sorted(b, key=lambda x: x["id"])
        for i, (x, y) in enumerate(zip(a, b)):
            d = diff(x, y, f"{path}[{i}]", key)
            if d:
                return d
        return None
    if isinstance(a, float) or isinstance(b, float):
        if a is None or b is None:
            return None if a is b else f"{path}: {a!r} != {b!r}"
        if not math.isclose(float(a), float(b), rel_tol=0, abs_tol=1e-9):
            return f"{path}: {a!r} != {b!r}"
        return None
    if a != b:
        return f"{path}: {a!r} != {b!r}"
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--py", default="http://127.0.0.1:8001")
    ap.add_argument("--rs", default="http://127.0.0.1:8000")
    args = ap.parse_args()

    _, runs = get(args.py, "/api/runs")
    run = runs[0]["run_id"]
    _, clusters = get(args.py, "/api/clusters", {"run": run})
    cluster = clusters[0]["cluster_id"]
    _, flow = get(args.py, "/api/flow", {"run": run})
    fw, fc = flow["clusters"][0]["window"], flow["clusters"][0]["id"]
    _, lineage = get(args.py, "/api/lineage", {"run": run})
    seed = lineage["main_path"][len(lineage["main_path"]) // 2]
    _, page = get(args.py, "/api/works", {"run": run, "page": 3})
    work_id = page["items"][0]["id"]
    other = next((r["run_id"] for r in runs if r["run_id"] != run), run)

    cases = [
        ("runs", "/api/runs", None),
        ("map", "/api/map", None),
        ("map", "/api/map", {"run": run}),
        ("map", "/api/map", {"run": "nope"}),
        ("clusters", "/api/clusters", {"run": run}),
        ("clusters", "/api/clusters", {"run": other}),
        ("tree", "/api/tree", {"run": run}),
        ("tree", "/api/tree", {"run": other}),
        ("flow", "/api/flow", {"run": run}),
        ("flow_papers", "/api/flow/papers", {"run": run, "window": fw, "cluster": fc}),
        ("flow_papers", "/api/flow/papers", {"run": run, "window": fw, "cluster": fc, "limit": 3}),
        ("lineage", "/api/lineage", {"run": run}),
        ("lineage", "/api/lineage", {"run": run, "seed": seed, "depth": 2}),
        ("lineage", "/api/lineage", {"run": run, "seed": seed, "depth": 4, "limit": 100}),
        ("cluster_detail", f"/api/clusters/{cluster}", {"run": run}),
        ("cluster_detail", "/api/clusters/999", {"run": run}),
        ("works", "/api/works", {"run": run}),
        ("works", "/api/works", {"run": run, "q": "retrieval", "sort": "title", "order": "asc", "page": 2}),
        ("works", "/api/works", {"run": run, "year_from": 2015, "year_to": 2018, "sort": "year", "page_size": 100}),
        ("works", "/api/works", {"run": run, "q": "x"}),
        ("works", "/api/works", {"run": run, "year_from": 2020, "year_to": 2010}),
        ("works", "/api/works", {"run": run, "sort": "bad"}),
        ("works", "/api/works", {"run": run, "page": 0}),
        ("works", "/api/works", {"run": "missing"}),
        ("matches", "/api/matches", {"run": run, "q": "retrieval"}),
        ("matches", "/api/matches", {"run": run, "year_from": 2024}),
        ("matches", "/api/matches", {"run": run, "q": "zzzz-no-paper"}),
        ("work", f"/api/works/{work_id}", {"run": run}),
        ("work", f"/api/works/{work_id}", None),
        ("work", f"/api/works/{work_id}", {"run": other}),
        ("work", "/api/works/missing", {"run": run}),
        ("health", "/api/health", None),
    ]
    failures = 0
    for name, path, params in cases:
        ps, pj = get(args.py, path, params)
        rs, rj = get(args.rs, path, params)
        label = f"{name} {path} {params or ''}"
        if ps != rs:
            print(f"✗ {label}: status {ps} != {rs}")
            failures += 1
            continue
        # FastAPI가 프레임워크 차원에서 내던 422(pydantic detail 목록)는 상태만 맞추고
        # 문구는 Rust 쪽의 사람이 읽는 한 줄을 쓴다. 제품 문구(404·503·직접 검증한 422)는 같아야 한다.
        if ps >= 400 and isinstance(pj.get("detail"), list) and isinstance(rj.get("detail"), str):
            print(f"✓ {label} ({ps}, 프레임워크 검증 문구 → '{rj['detail']}')")
            continue
        d = diff(pj, rj, "", (name,))
        if d:
            print(f"✗ {label}: {d}")
            failures += 1
        else:
            size = len(json.dumps(pj))
            print(f"✓ {label} ({ps}, {size} bytes)")
    print(f"\n{len(cases) - failures}/{len(cases)} 일치")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
