---
title: 계층 트리를 지도 이웃 제약 아래 주제 거리로 세운다
slug: hierarchy-topical
stage: intent
status: accepted
author: minjaepark
date: 2026-09-19
---

# 계층 트리를 지도 이웃 제약 아래 주제 거리로 세운다

## 문제

`constellation hierarchy`는 클러스터 45개의 2D 지도 좌표 중심으로 Ward 트리를 세운다. 병합 기준이 지도 거리라 "지도에서 옆에 있는 것"끼리 합쳐지고, 주제가 다른 두 분야가 한 상위 노드가 된다(`Music IR` + `Multilingual NLP`, `PIR` + `Software Engineering`). `feat/naming-cli`(PR #13)가 이런 노드를 응집 판정으로 갈라 보이게 했더니 상위 분야 8개 중 6–7개가 갈라져 레벨 0이 20–27개가 됐다. 상위·하위 단계의 차이가 사라졌고, 36편짜리 잎이 상위 분야 자리에 놓인다.

2D를 택한 이유는 hierarchy.py 독스트링에 있다 — 임베딩 공간 트리는 "의미로는 형제인데 지도에서는 반대편"인 그룹을 만들어 라벨 놓을 자리가 없다(2D 퍼짐 0.59 vs 0.37). 그 제약은 그대로 지켜야 한다.

## 원하는 결과

- `constellation hierarchy --method topical`이 새 트리를 세운다. 병합 비용은 클러스터의 임베딩 중심(SciNCL 벡터 평균, 논문 수 가중 Ward)이고, 병합은 2D에서 이웃인 클러스터끼리만 허용한다. 결과 영역은 항상 지도에서 한 덩어리다. 결정적이다.
- 레벨을 고정 개수(k=8, 18)가 아니라 병합 거리 문턱으로 자른다. 문턱은 실측한 병합 거리 분포를 보고 정하고 기본값과 근거를 코드에 적는다. `--levels`로 바꿀 수 있다.
- 기존 `--method 2d`는 그대로 남는다. 기본값은 비교를 본 뒤 정한다.
- `constellation hierarchy --compare`가 두 방식을 같은 run에서 세워 표로 비교한다: 레벨별 그룹 수, 최대 그룹 비율, 2D 퍼짐(M2와 같은 정의), 주제 응집(그룹 안 잎 중심의 평균 코사인), 인용 배수. 레벨 0의 그룹 구성(잎 이름 목록)도 함께 찍는다.
- `docs/HIERARCHY-COMPARISON.md`에 그 표와, 두 방식에 `constellation name`을 돌린 결과(응집 판정 비율, 갈라진 뒤 레벨 수, 레벨 0 이름 목록), 지도 스크린샷 전/후를 남긴다.
- 사용자가 문서를 보고 채택하면 기본값을 바꾸고 실제 DB에 적용한다. 그 전까지 실제 DB는 바꾸지 않는다.

## 영향 범위

- `backend/constellation/analyze/hierarchy.py`, `cli.py`의 `hierarchy`. 새 문서 하나.
- DuckDB `cluster_tree`, `tree_levels`(스키마 변경 없음. `runs.params_json`에 method·문턱 기록).
- 프런트엔드·Rust는 변경 없음 — `tree.levels`와 `height`를 주는 대로 읽는다.
- 결정: minjaepark.

## 제약

- 임베딩은 `data/embeddings/scincl/vectors.npy`에 있고 umap10 좌표는 저장하지 않으므로 중심은 원본 임베딩으로 잰다. UMAP을 다시 돌리지 않는다.
- 이웃 그래프는 연결돼 있어야 트리가 하나로 닫힌다. 끊기면 가장 짧은 끊긴 변부터 되살린다.
- 비교와 naming 실행은 스크래치 DB 사본에서 한다.
- naming의 응집 판정은 비결정적이다. 문서에는 실행 횟수와 편차를 적는다.

## 범위 밖

- 앱에서 두 트리를 전환해 보는 기능(사용자 결정: 문서 + 스크린샷으로 본다).
- HDBSCAN 응축 트리, 주제로 묶고 지도에서 조각내는 방식.
- 클러스터링(잎) 변경, UMAP 재학습.
- 계층 트리 뷰의 절단선 표시.

## 열린 질문

- 없음. 방식(1 인접 제약 Ward + 2 거리 절단)과 비교 형태(문서 + 스크린샷)는 2026-09-19 대화에서 결정했다.
