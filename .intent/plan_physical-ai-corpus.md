---
title: 피지컬 AI 코퍼스 구축
slug: physical-ai-corpus
stage: plan
status: accepted
intent: .intent/intent_physical-ai-corpus.md
spec: .intent/spec_physical-ai-corpus.md
date: 2026-09-24
---

# 피지컬 AI 코퍼스 구축 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `backend/constellation/queries.py` | `PHYSICAL_AI` 수집어·`per_year`·facets 수정, `PHYSICAL_AI_DRIVING` 추가·등록 |
| `backend/constellation/devices.py` | 새 파일. `pick_device(torch)` |
| `backend/constellation/embed/encoder.py` | 장치 선택을 `pick_device`로 |
| ~~`backend/constellation/analyze/naming.py`~~ | (취소) PR #13(naming-cli)이 로컬 LLM을 codex·claude CLI로 바꿔 장치 분기가 필요 없어졌다. main 병합 때 main 쪽을 택했다(2026-09-24) |
| `backend/tests/test_devices.py` | 새 파일. 가짜 torch로 세 분기 |
| `backend/tests/test_queries.py` | 새 파일. 두 세트의 필터 문자열·target |
| ~~`pyproject.toml`~~ | (취소) `accelerate`는 로컬 LLM 이름 짓기에만 필요했다 |
| `docs/PHYSICAL-AI-RESULTS.md` | 새 파일. 수집·분석 결과 |
| `README.md` | "수집과 분석"에 별도 코퍼스 만드는 법 |

데이터(`data/physical-ai/`)는 git 밖이다.

## 작업 순서

1. **코드.** 세트 정의, `devices.py`, 두 호출부, 테스트를 고친다.
   - 확인: `PYTHONPATH=$PWD/backend ../../.venv/bin/python -m unittest discover -s backend/tests -v` 통과
   - 확인: `constellation sets`에 두 세트가 보인다
   - 단독 커밋
2. **의존성.** `uv pip install --python ../../.venv/bin/python sentence-transformers umap-learn hdbscan scikit-learn accelerate`
   - 확인: `import torch; torch.backends.mps.is_available()`가 True
   - 확인: main 쪽 editable 설치 경로(`__editable__…pth`가 `…/Constellation/backend`)가 그대로다
3. **수집.** `collect --set physical-ai` → `collect --set physical-ai-driving` → `stats` → `backfill --max 1500` → `enrich` → `stats`
   - 확인: 세트별·연도별 `collections` 행이 13개씩 있다
   - 확인: `stats` 출력을 결과 문서용으로 남긴다
4. **분석.** `embed --model scincl --batch 128` → `project` → `cluster` → `hierarchy` → `name` → `flow` → `lineage`. 단계마다 걸린 시간을 잰다.
   - 확인: `runs` 행, `cluster_tree.label_src='llm'`
5. **앱 확인.** `constellation-serve --db …/data/physical-ai/constellation.duckdb --port 8003`와 워크트리 프런트엔드(`CONSTELLATION_API=http://127.0.0.1:8003`)를 띄운다.
   - 확인: 지도, 상위 분야 이름, 인용선 스크린샷
6. **대표 논문 19편 확인과 결과 문서, README.**
   - 확인: 기존 `data/` 파일의 수정 시각이 기준값(`scratchpad/baseline-mtimes.txt`)과 같다
   - 커밋, 푸시, PR

## 가장 위험한 단계

- **3단계(수집).** `CONSTELLATION_DATA_DIR`를 빠뜨리면 기존 DB에 피지컬 AI 논문이 섞인다. 그래서 명령마다 절대 경로를 앞에 붙이고, 첫 명령 전에 `python -c 'from constellation.config import DB_PATH; print(DB_PATH)'`로 경로를 확인한다.
  - 되돌리기: 기존 DB에는 `data/constellation.duckdb.bak-20260919` 백업이 있다. 새 폴더는 통째로 지우면 된다.
- **4단계(`name`).** MPS에서 연산 미지원이나 메모리 부족이 날 수 있다. `PYTORCH_ENABLE_MPS_FALLBACK=1`로 다시 시도한다. 그래도 안 되면 CPU로 돌리고 걸린 시간을 적는다.

## 검증

```
PYTHONPATH=$PWD/backend ../../.venv/bin/python -m unittest discover -s backend/tests -v
CONSTELLATION_DATA_DIR=/Users/minjaepark/code/Constellation/data/physical-ai PYTHONPATH=$PWD/backend ../../.venv/bin/python -m constellation.cli stats
../../target/debug/constellation-serve --db /Users/minjaepark/code/Constellation/data/physical-ai/constellation.duckdb --port 8003
stat -f "%Sm %N" ../../data/constellation.duckdb ../../data/embeddings/* ../../data/models/*
```

화면 확인: 워크트리 프런트엔드를 8003 API에 붙여 지도를 연다. 전체 → 상위 분야 → 논문 제목 순으로 확대하고, 점 위에 0.5초 머물러 인용선을 본다.
