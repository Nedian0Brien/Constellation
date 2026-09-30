---
title: 분석 DB 하나에 코퍼스와 지도를 여러 개 둔다
slug: corpus-model
stage: intent
status: accepted
author: minjaepark
date: 2026-09-30
---

# 분석 DB 하나에 코퍼스와 지도를 여러 개 둔다

연구 도구 기획(`docs/RESEARCH-TOOL-PLAN.md`, PR #23) 로드맵의 1단계다.

## 문제

- DB 파일 하나가 코퍼스 하나다. RAG/IR 지도(`data/constellation.duckdb`)와 피지컬 AI 지도(`data/physical-ai/constellation.duckdb`)를 오가려면 "데이터베이스 열기"로 파일을 바꿔야 한다. 코퍼스를 새로 만들 때도 `CONSTELLATION_DATA_DIR`로 폴더를 따로 둬야 한다(README:110-131). 각 단계가 DB 전체의 `works`를 읽기 때문이다(`embed/run.py:26-28`).
- 투영 모델(PCA·UMAP pkl)을 임베딩 모델 단위(`data/models/<model>/`)로 저장한다(`analyze/project.py:27-34`). 코퍼스 둘을 한 DB에 넣으면 한 코퍼스로 학습한 모델이 다른 코퍼스를 변환한다.
- 파이프라인 단계가 "해당 모델의 최신 project run"을 암묵적으로 고른다(`cluster.py:133-140` 외 4곳). 지도가 여러 개면 어느 지도에 작업하는지가 실행 순서에 따라 달라진다.
- 헤더 선택기는 같은 코퍼스 안의 임베딩 모델 전환이다(`AppShell.tsx:233-254`). 지도를 고르는 곳이 없다.

다음 단계인 "새 지도 만들기"는 앱이 파이프라인을 실행해 같은 DB에 새 코퍼스와 지도를 더하는 기능이다. 이 구조가 먼저 있어야 한다.

## 원하는 결과

- 분석 DB 하나에 코퍼스를 여러 개 둔다.
  - `corpora`: id, 이름, 수집 정의(JSON), 생성일
  - `corpus_works`: 코퍼스와 논문의 소속 관계
- 논문·저자·인용 원천 데이터는 코퍼스끼리 공유한다. 같은 논문이 두 코퍼스에 들어가도 `works`에는 한 행만 있고, 임베딩 캐시도 한 번만 계산한다.
- 지도는 코퍼스 하나와 임베딩 모델 하나로 만든 project run이다. `runs`에 코퍼스 id와 지도 이름을 더한다. cluster·tree·flow·lineage 산출물은 지금처럼 run_id에 딸린다.
- 파이프라인 명령이 대상을 명시적으로 받는다.
  - `collect`, `backfill`, `enrich`는 `--corpus`로 받는다. 수집·backfill로 들어온 논문은 그 코퍼스 소속으로 기록한다.
  - `project`는 `--corpus`로 받아 그 코퍼스의 논문만 투영한다.
  - 하류 단계(cluster, hierarchy, name, flow, lineage)는 `--map`으로 받는다.
  - 대상을 생략하면 코퍼스가 하나일 때만 그것을 쓰고, 여러 개면 목록을 보여 주고 종료한다.
- 투영 모델 파일을 지도 단위로 저장한다(`data/models/<코퍼스>/<모델>/`).
- 기존 피지컬 AI DB를 기본 DB로 옮기는 명령을 만든다. 옮길 것은 논문, 인용, 분석 산출물, 임베딩 캐시, 투영 모델이다. 기존 run_id와 좌표, 클러스터, 이름은 다시 계산하지 않고 그대로 옮긴다. 옮긴 뒤 두 지도가 지금과 같은 모습으로 보여야 한다.
- 앱 헤더의 선택기가 지도 선택기가 된다. 항목은 "코퍼스 이름 · 모델 · 논문 수"로 보여 준다. 브라우저 모드(`constellation-serve`)도 같은 목록을 쓴다.

## 영향 범위

- `backend/constellation/`
  - `db/schema.sql`, `db/store.py`: 스키마와 기존 DB 이전
  - `ingest/collect.py`, `ingest/queries.py`, `cli.py`
  - `embed/`: 캐시는 그대로, 행렬 로딩만 코퍼스 필터
  - `analyze/project.py`, `cluster.py`, `hierarchy.py`, `naming.py`, `flow.py`, `lineage.py`: 대상 run 명시
- `crates/constellation-core/src/queries/runs.rs`, `src-tauri`, `crates/constellation-serve`: 지도 목록에 코퍼스 정보
- `frontend/src/components/AppShell.tsx`, `app/navigation.ts`: 헤더 선택기
- `README.md`: 코퍼스 추가 절차
- 데이터: `data/constellation.duckdb`, `data/embeddings/`, `data/models/`. 이전 전에 백업한다.
- 결정: minjaepark

## 제약

- 기존 두 지도의 좌표, 클러스터, 영역 이름을 바꾸지 않는다. 이름 짓기는 비결정적이라 다시 돌리면 다른 이름이 나온다.
- 이전 명령은 여러 번 실행해도 결과가 같아야 한다. 원본 DB는 읽기만 한다.
- 워크트리에는 `data/`가 없으므로 개발과 검증은 `CONSTELLATION_DATA_DIR`로 복사본을 가리켜 한다. 실제 `data/`는 사용자 확인 뒤 한 번 옮긴다.
- 앱 쪽 DB 연결은 읽기 전용 그대로 둔다. 쓰기 경로는 다음 단계(새 지도 만들기)에서 다룬다.

## 범위 밖

- 앱에서 새 지도를 만드는 화면과 작업 실행기(2단계)
- 논문 직접 추가와 증분 배치(3단계)
- 사이드바 개편, 사용자 저장소(4단계)
- 계층 트리 topical 방식(#15, 보류)

## 열린 질문

없음. 2026-09-30 사용자 결정:
- 분석 산출물이 없는 지도도 지도 선택기에 전부 보인다.
- 기존 코퍼스 이름은 `RAG/IR`, `Physical AI`다. 수집 세트 id(`rag-ir`, `physical-ai`)는 수집 정의에 남긴다.
