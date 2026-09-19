---
title: 계층 트리를 지도 이웃 제약 아래 주제 거리로 세운다
slug: hierarchy-topical
stage: spec
status: accepted
intent: .intent/intent_hierarchy-topical.md
date: 2026-09-19
---

# 계층 트리를 지도 이웃 제약 아래 주제 거리로 세운다 — 명세

## 요구사항

- [ ] `constellation hierarchy --method 2d|topical`. `2d`는 지금 동작 그대로(`--levels 8,18` 개수 절단). 기본값은 비교 뒤 정하며 이 PR에서는 `2d`.
- [ ] `topical`: 잎(클러스터)마다 SciNCL 벡터 평균을 단위 벡터로 만든 중심. 병합은 2D 중심의 Delaunay 이웃끼리만. 병합 비용은 잎 수를 무게로 한 Ward(`n_a n_b/(n_a+n_b)·‖c_a−c_b‖²`, 잎 하나 = 무게 1). 결정적(동률은 낮은 id 우선).
- [ ] Delaunay 변 중 길이가 중앙값의 2배를 넘는 것은 뺀다. 그래프가 끊기면 뺀 변을 짧은 순으로 되살려 잇는다.
- [ ] `topical`의 레벨은 비용 문턱으로 자른다. `--levels 0.16,0.11`(내림차순 = 레벨 0, 1). 노드의 높이는 자기 비용과 자식 높이의 최댓값(단조). 레벨 L의 노드 = 높이 ≤ t_L 이면서 부모 높이 > t_L 인 노드. 잎 레벨은 마지막.
- [ ] `cluster_tree.height`에 단조 높이를 저장한다. `runs`의 `|tree` 행 `params_json`에 `method`, `levels`(k 또는 문턱), `edges_kept`를 적는다.
- [ ] `constellation hierarchy --compare`: 두 방식을 같은 run에서 메모리에 세우고 DB에 쓰지 않는다. 레벨 0·1마다 그룹 수, 최대 그룹 비율, 2D 퍼짐, 주제 응집, 인용 배수를 표로 찍고, 레벨 0 그룹마다 잎 라벨 목록을 찍는다. `topical`의 병합 비용 순서도 찍는다(문턱을 고르는 근거).
  - 2D 퍼짐 = 그룹 소속 논문의 그룹 중심까지 RMS 거리 ÷ 전체 지도 RMS 반지름. 잎 수 가중 평균(M2·hierarchy 독스트링과 같은 정의).
  - 주제 응집 = 그룹 안 잎 중심끼리 코사인 유사도 평균. 잎이 하나인 그룹은 1. 잎 수 가중 평균.
  - 인용 배수 = 같은 그룹 안에서 인용할 확률 ÷ 무작위 두 편이 같은 그룹일 확률(`evaluate_clusters`와 같은 식, 그룹 단위).
- [ ] `docs/HIERARCHY-COMPARISON.md`: 위 표, 두 방식에 `name`(codex)을 돌린 결과(레벨 0·1 응집 판정 비율, 갈라진 뒤 레벨 수, 레벨 0 이름 목록), 지도 스크린샷 전/후.
- [ ] 단위 테스트: 제약 Ward(작은 손 예제에서 이웃이 아닌 쌍은 안 합쳐진다), 변 되살리기, 문턱 절단, 2D 퍼짐·응집 계산.

## 설계

`hierarchy.py`를 세 부분으로 나눈다.

1. **병합 순서** — `_merges_2d(cen) -> Z`(지금의 `linkage(pdist, "ward")`)와 `_merges_topical(C, xy) -> (Z, edges_kept)`. `Z`는 scipy 형식 `(n-1, 4)`: 자식 a, b, 높이, 잎 수. topical은 자체 구현(잎 45개, O(n³)이어도 즉시). 각 단계에서 인접한 쌍 중 비용이 가장 작은 쌍을 합치고, 새 노드의 중심은 무게 가중 평균, 이웃은 두 자식 이웃의 합집합.
2. **노드 집계** — 지금 코드(`members`, `node_size`, `node_xy`, `parent/left/right`)를 `Z`에서 그대로 만든다. 잎 순서(`leaf_order`)는 scipy `dendrogram`에 계속 맡긴다(비단조 높이도 받는다). 높이는 `2d`면 Z 그대로, `topical`이면 단조화.
3. **절단** — `_cut_by_count(Z, ks)`(지금의 fcluster 경로)와 `_cut_by_height(height, parent, thresholds)`.

`build(model_key, method, levels, log, dry_run=False)`가 이 셋을 잇고, `dry_run`이면 저장 대신 트리(dict)를 돌려준다. `compare(model_key, log)`가 `build(..., dry_run=True)`를 두 번 부르고 `evaluate_tree(tree, level)`로 표를 만든다.

임베딩 중심은 `evaluate.load_matrix(model_key)`로 `vectors.npy`를 읽고 `clusters` 테이블로 잎별 평균을 낸다(`cluster.py`가 umap10을 만들 때와 같은 벡터). 잎 하나가 10,604×768 행렬에서 한 번 평균이라 수 초.

`cli.py hierarchy`: `--method`, `--levels`(문자열, 방식에 따라 정수 또는 실수로 해석), `--compare`. `compare`면 표만 찍고 끝.

## 버린 대안

- 논문 수 가중 Ward: 프로토타입에서 작은 클러스터끼리 먼 거리(d=0.144)에서도 먼저 합쳐져 "잡동사니" 그룹이 생겼다(Sustainable Agriculture + HCI + Information Literacy). 잎 수 무게(=기존 2D 방식과 같은 척도)가 낫다.
- 중심 코사인 거리로 절단: 큰 그룹의 평균 중심은 전체 평균으로 수렴해 큰 그룹끼리의 거리가 작게 나온다(40잎 그룹 병합에서 d=0.034). Ward 비용은 단조에 가깝고 이 문제가 없다.
- sklearn `AgglomerativeClustering(connectivity=…)`: 잎 무게를 못 준다(지금은 무게 1이라 가능하지만 자체 구현이 20줄이고 병합 순서·이웃 갱신을 통제할 수 있다).
- 이웃을 영역 원 겹침으로: 원이 안 겹치는 외딴 클러스터가 생겨 그래프가 끊긴다. Delaunay + 긴 변 제거가 연결과 인접을 함께 준다.

## 함정

- `.venv`에 numpy·scipy가 없었다(`[embed]` 미설치). `uv pip install numpy scipy`로 넣었다. hierarchy는 sklearn·umap이 필요 없다.
- 병합 비용이 제약 때문에 비단조일 수 있다(프로토타입에서 83이 82보다 낮음). 절단·저장은 단조화한 높이를 쓴다.
- Ward 비용의 척도는 임베딩 모델에 달렸다. 기본 문턱 0.16/0.11은 SciNCL run의 비용 순서(0.03…0.64, 16개/22개 그룹)에서 골랐다. 코드에 근거를 적고 `--compare`가 순서를 찍는다.
- `tree_levels`의 `k`는 레벨의 노드 수. 문턱 절단이어도 개수를 넣는다(프런트·Rust가 읽는 형식 유지).
- naming은 이미 `tree_levels`를 다시 쓴다. topical 트리에 `name`을 돌리면 응집 판정으로 또 갈릴 수 있다 — 그게 비교 지표다.
- 실제 DB는 이 PR에서 바꾸지 않는다. 비교 실행은 스크래치 사본.

## 완료 기준

```
PYTHONPATH=$PWD/backend ../../.venv/bin/python -m unittest discover -s backend/tests        # 통과
CONSTELLATION_DATA_DIR=<스크래치> … constellation.cli hierarchy --compare                    # 표 출력
CONSTELLATION_DATA_DIR=<스크래치A> … hierarchy --method topical && … name                  # 레벨 수·응집 비율
CONSTELLATION_DATA_DIR=<스크래치B> … hierarchy --method 2d && … name                       # 비교 대상(이미 있음)
docs/HIERARCHY-COMPARISON.md 에 표·이름 목록·스크린샷
```
