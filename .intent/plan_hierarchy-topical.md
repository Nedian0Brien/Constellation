---
title: 계층 트리를 지도 이웃 제약 아래 주제 거리로 세운다
slug: hierarchy-topical
stage: plan
status: accepted
intent: .intent/intent_hierarchy-topical.md
spec: .intent/spec_hierarchy-topical.md
date: 2026-09-19
---

# 계층 트리를 지도 이웃 제약 아래 주제 거리로 세운다 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `backend/constellation/analyze/hierarchy.py` | 고침. `_merges_2d`, `_merges_topical`, `_leaf_centroids`, `_cut_by_count`, `_cut_by_height`, `build(method, levels, dry_run)`, `evaluate_tree`, `compare` |
| `backend/constellation/cli.py` | 고침. `hierarchy`에 `--method`, `--levels` 해석, `--compare` |
| `backend/tests/test_hierarchy.py` | 새로 만듦. 제약 Ward·변 되살리기·문턱 절단·지표 계산 |
| `docs/HIERARCHY-COMPARISON.md` | 새로 만듦. 비교 표·이름 목록·스크린샷 |
| `docs/screenshots/hierarchy-2d.png`, `hierarchy-topical.png` | 새로 만듦 |
| `README.md` | 고침. 파이프라인 절에 `--method`, `--compare` 한 줄 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `hierarchy.py` 리팩터 — 병합·집계·절단을 나누고 `2d` 경로가 지금과 같은 트리를 내는지 확인: 리팩터 전후 `build(dry_run=True)` 결과(`Z`, 레벨 노드 집합)를 스크래치에서 비교해 같아야 한다.
2. `_merges_topical` + 문턱 절단 + `evaluate_tree` + `compare`. 확인: `hierarchy --compare`가 표를 찍고, topical 레벨 0이 프로토타입(16개 그룹, cost ≤ 0.15~0.16)과 같다.
3. `test_hierarchy.py`. 확인: unittest 통과.
4. 스크래치 A(2d, 이미 naming 완료된 현재 DB 사본)와 스크래치 B(topical → name). 확인: B의 레벨 수·응집 비율·이름 목록.
5. 스크린샷 — B의 DB로 API 서버를 띄워 지도 초기 화면과 한 단계 확대를 찍는다. A는 현재 실제 DB(이미 2d + naming) 화면. `docs/screenshots/`에 저장.
6. `docs/HIERARCHY-COMPARISON.md` 작성, README 한 줄. 커밋·푸시·PR(base: `feat/naming-cli`).

## 가장 위험한 단계

1번. `2d` 경로를 깨면 기존 트리 재현이 안 된다. 리팩터 전 `Z`와 레벨을 스크래치에 저장해 두고 비교한다. 되돌리기는 `git checkout -- hierarchy.py`.

5번은 8000 포트를 다른 세션의 서버가 쓰고 있다. 스크래치 B용 서버는 다른 포트(`cargo run -p constellation-serve -- --db … --port 8002`가 되는지 `--help`로 확인)로 띄우고 `CONSTELLATION_API`로 Vite 프록시를 돌린다.

## 검증

```
cd .worktree/hierarchy-topical
PYTHONPATH=$PWD/backend ../../.venv/bin/python -m unittest discover -s backend/tests
S=<scratch>/hier; cp ../../data/constellation.duckdb $S/B/constellation.duckdb
CONSTELLATION_DATA_DIR=$S/B PYTHONPATH=$PWD/backend ../../.venv/bin/python -m constellation.cli hierarchy --compare
CONSTELLATION_DATA_DIR=$S/B PYTHONPATH=$PWD/backend ../../.venv/bin/python -m constellation.cli hierarchy --method topical
CONSTELLATION_DATA_DIR=$S/B PYTHONPATH=$PWD/backend ../../.venv/bin/python -m constellation.cli name
```

UI 확인: 스크래치 B 서버로 지도 상위 분야(레벨 0) 라벨, 한 단계 확대(레벨 1), 계층 트리 뷰. 영역이 지도에서 한 덩어리인지 본다.
