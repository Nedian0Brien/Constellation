---
title: 영역 이름을 Codex·Claude CLI로 짓고 Mixed 라벨을 없앤다
slug: naming-cli
stage: plan
status: accepted
intent: .intent/intent_naming-cli.md
spec: .intent/spec_naming-cli.md
date: 2026-09-19
---

# 영역 이름을 Codex·Claude CLI로 짓고 Mixed 라벨을 없앤다 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `backend/constellation/analyze/naming.py` | 고침. `LocalNamer`·단건 프롬프트 제거. `CodexNamer`/`ClaudeNamer`, 배치 프롬프트, `check_names`, `split_levels`, `run()` 재작성 |
| `backend/constellation/cli.py` | 고침. `name`에 `--backend`, `--llm` 기본 None, `--4bit` 제거 |
| `backend/tests/test_naming.py` | 새로 만듦. 프롬프트·검증·레벨 분할 단위 테스트(가짜 Namer) |
| `README.md` | 고침. 파이프라인 절에 `constellation name` 요건 한 줄 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `naming.py` 재작성 — 백엔드 두 클래스, 배치 프롬프트, 스키마 상수, `check_names`, `split_levels`, `run()`. 확인: `PYTHONPATH=backend python -c "import constellation.analyze.naming"`이 torch 없이 import된다.
2. `test_naming.py` — `is_malformed`, `check_names`(누락·Mixed·비영어), `split_levels`(재귀 분할, 잎 레벨 불변), 가짜 Namer로 `run()`의 저장 경로까지 한 번(fixtures로 작은 DB를 만들어 cluster_tree 5노드·tree_levels 2레벨). 확인: unittest 통과.
3. `cli.py` — 옵션 교체. 확인: `--help`에 `--backend`가 보이고 `--4bit`가 없다.
4. 스크래치에 DB 복사 → `name` 실행(codex, gpt-5.6-luna). 확인: 완료 로그, `Mixed:` 0건, 갈라진 노드 목록, 레벨별 이름을 눈으로 검토. 어색한 이름이 있으면 프롬프트를 고쳐 다시 돌린다(스크래치이므로 반복 가능).
5. `--backend claude`로 스크래치에 한 번 더 돌려 두 백엔드가 같은 코드 경로로 끝나는지 확인.
6. 실제 `data/constellation.duckdb`에 codex로 실행. 앱을 띄워 지도 레벨 0·1 라벨과 트리 뷰를 확인.
7. README 갱신. 커밋·푸시·PR.

## 가장 위험한 단계

6번. 실제 DB의 라벨과 `tree_levels`를 바꾼다. 되돌리기: 4번 전에 떠 둔 복사본을 다시 놓거나, `constellation hierarchy`를 다시 돌려 절단·c-TF-IDF 라벨로 복원한 뒤 `name`을 다시 돌린다. 앱이 열어 둔 DuckDB가 있으면 쓰기가 잠기므로 앱과 `constellation-serve`를 끄고 돌린다.

CLI가 형식을 어기거나(JSON 파싱 실패) 시간이 초과되면 4번에서 드러난다. 그 경우 프롬프트나 플래그를 고치고, `naming_audit`에 남는 프롬프트로 원인을 본다.

## 검증

```
cd .worktree/naming-cli
PYTHONPATH=backend ../../.venv/bin/python -m unittest discover -s backend/tests -t backend
cp ../../data/constellation.duckdb /private/tmp/…/scratchpad/naming/constellation.duckdb
CONSTELLATION_DATA_DIR=/private/tmp/…/scratchpad/naming PYTHONPATH=backend ../../.venv/bin/python -m constellation.cli name
CONSTELLATION_DATA_DIR=/private/tmp/…/scratchpad/naming PYTHONPATH=backend ../../.venv/bin/python -m constellation.cli name --backend claude
../../.venv/bin/python -c "duckdb 조회: Mixed 0건, 레벨별 라벨, tree_levels k"
CONSTELLATION_DATA_DIR=../../data PYTHONPATH=backend ../../.venv/bin/python -m constellation.cli name
cargo run -p constellation-serve -- --db ../../data/constellation.duckdb  +  npm --prefix frontend run dev
```

UI 확인: 지도 초기 화면(상위 분야 8+α개 라벨), 한 단계 확대(하위 분야), 계층 트리 뷰의 노드 이름. `Mixed:`가 없고 갈라진 영역이 각자 이름으로 보인다.
