---
title: 영역 이름을 Codex·Claude CLI로 짓고 Mixed 라벨을 없앤다
slug: naming-cli
stage: spec
status: accepted
intent: .intent/intent_naming-cli.md
date: 2026-09-19
---

# 영역 이름을 Codex·Claude CLI로 짓고 Mixed 라벨을 없앤다 — 명세

## 요구사항

- [ ] `constellation name --backend codex|claude [--llm MODEL]`. 기본 `codex` / `gpt-5.6-luna`, claude 기본 `opus`. torch·transformers를 import하지 않는다.
- [ ] 잎 45개는 한 호출, 내부 노드 44개는 한 호출로 짓는다(`--internal-only`면 잎 호출 생략). 호출은 구조화 JSON(`{"names":[{"id","name","coherent"}]}`)으로 받는다.
- [ ] 잎 프롬프트: c-TF-IDF 키워드 8개 + 피인용 상위 제목 6개 + 논문 수. 내부 프롬프트: 두 자식 그룹 각각의 하위 잎(새 이름·논문 수)과 그룹 논문 수, 전체 키워드.
- [ ] 이름 규칙: 영어, Title Case, 5단어 이하, 근거에 없는 개념 금지, `Mixed:` 접두 금지. 두 그룹이 한 분야로 묶이지 않으면 `coherent=false`와 `A · B` 복합 이름.
- [ ] 응집 판정은 엄격하다(사용자 지시 2026-09-19: "서로 다른 영역인데 억지로 합치는 경우가 없도록"). 두 그룹을 덮으려고 근거보다 넓은 우산 이름(`Applied AI`, `Computing Research`, `Data-Driven Methods` 같은)을 만들면 안 되고, 그런 이름이 필요하면 `coherent=false`다. 판단이 서지 않으면 `false`. 프롬프트에 이 규칙과 반례(`Music Signal Processing` + `Cross-Lingual NLP` → false)를 넣는다.
- [ ] 응답에 빠졌거나 `is_malformed`인 노드만 모아 한 번 재요청한다. 그래도 불량이면 `keywords[:3]`을 ` · `로 이은 c-TF-IDF 라벨과 `label_src='ctfidf'`를 쓴다. 나머지는 `label_src='llm'`.
- [ ] 잎 이름은 `cluster_meta.label`에도 반영한다.
- [ ] 잎이 아닌 레벨(`tree_levels`의 마지막 레벨 제외)에서 `coherent=false`인 노드는 자식 둘로 바꾼다. 자식도 불응집이면 재귀. `k`는 새 개수. 로그에 갈라진 노드와 새 k를 적는다.
- [ ] `naming_audit(run_id,node_id,prompt,output,model,created_at)`에 노드마다 그 노드가 들어간 호출의 프롬프트, 그 노드의 출력 JSON, `backend/model`을 남긴다.
- [ ] 순수 함수(프롬프트 조립, 응답 검증, 레벨 분할)에 `backend/tests/test_naming.py` 단위 테스트가 있고 CLI 없이 돈다.

## 설계

`backend/constellation/analyze/naming.py`를 다시 쓴다. 남기는 것: `SYSTEM`(문구 수정), `RULES`(Mixed 항목 교체), `_clean`, `is_malformed`, `run()`의 DB 읽기·쓰기 골격, `naming_audit` DDL. 버리는 것: `LocalNamer`, `SHOTS`(한 노드 예시 → 배치 예시로 교체), `_leaf_prompt`/`_node_prompt`(배치 버전으로 교체).

**백엔드** — `Namer` 프로토콜 `complete(prompt: str) -> dict`. 둘 다 `subprocess.run`으로 CLI를 띄우고 프롬프트는 stdin, 결과는 JSON. 작업 디렉터리는 임시 폴더(프로젝트 `AGENTS.md`/`CLAUDE.md`를 읽지 않게).
- `CodexNamer(model)`: `codex exec -m MODEL --ephemeral --skip-git-repo-check --ignore-user-config --ignore-rules -s read-only --color never --output-schema SCHEMA.json -o OUT.json -`. `OUT.json`을 파싱. `--ignore-user-config`는 사용자 config의 `notify` 훅·플러그인을 안 타기 위한 것이고 auth는 그대로 쓴다(`--help` 문구). 구현 첫 단계에서 실제로 돌려 확인한다.
- `ClaudeNamer(model)`: `claude -p --tools "" --model MODEL --output-format json --json-schema SCHEMA --no-session-persistence --setting-sources "" --strict-mcp-config --system-prompt SYSTEM`. stdout JSON의 `structured_output`. `is_error`면 `result`를 오류로 올린다.
- 타임아웃 600초. 비정상 종료면 stderr 꼬리를 붙여 `RuntimeError`.

**배치 프롬프트** — `leaf_batch_prompt(items)`, `node_batch_prompt(items)`. 항목마다 `[id N]` 머리와 근거. 출력 스키마는 `{"names":[{"id":int,"name":str,"coherent":bool}]}`(잎은 `coherent` 항상 true로 두라고 지시). 예시(SHOTS)는 배치 형식 하나로 줄인다.

**응답 검증** — `check_names(items, response) -> (ok: dict[id,(name,coherent)], bad: list[id])`. 빠진 id, `is_malformed`, `Mixed:` 접두는 bad. 재요청은 bad 항목만으로 같은 프롬프트 함수 + 재요청 안내 문장.

**레벨 분할** — `split_levels(levels: dict[int,list[int]], tree: dict[node,(left,right,is_leaf)], coherent: dict[node,bool]) -> dict[int,list[int]]`. 마지막 레벨(잎)은 그대로. 순수 함수라 테스트한다.

**저장** — `cluster_tree.label/label_src` UPDATE, `cluster_meta.label` UPDATE, `tree_levels` DELETE+INSERT(마지막 레벨 포함 전체를 다시 씀), `naming_audit` DELETE+INSERT. 하나의 커밋.

**CLI** — `cli.py name`: `--backend`(기본 codex), `--llm`(기본은 백엔드에 따라 None → 코드에서 결정), `--internal-only` 유지, `--4bit` 제거. 도움말 문구 갱신.

**문서** — README 파이프라인 절에 `constellation name` 한 줄(백엔드·로그인 요건).

## 버린 대안

- 노드마다 CLI 한 번씩(기존 방식): 89회 프로세스 기동에 코덱스는 호출당 수십 초. 배치 2회면 형제 일관성도 얻는다.
- 내부 노드를 깊이별 bottom-up으로 자식 이름을 넘기며 짓기: 호출이 10회 안팎으로 늘고, 하위 잎 전부를 주면 자식 이름 없이도 구성이 보인다.
- 응집도를 자식 중심 임베딩 코사인으로 판정: 문턱값 튜닝이 필요하고 임베딩 로딩이 든다. 이름을 짓는 모델이 같은 근거로 판정하는 편이 일관된다.
- Claude Agent SDK(Python)로 직접 호출: 새 의존이 들고, 이 저장소의 에이전트 서버는 Node다. CLI가 이미 로그인돼 있어 subprocess가 가장 얇다.
- 트리를 임베딩 공간으로 세우기: hierarchy.py 독스트링에 2D를 택한 근거(2D 퍼짐 0.37 vs 0.59)가 있다. 범위 밖.

## 함정

- `.venv`는 메인 체크아웃의 `backend`에 editable 설치돼 있다. 워크트리 코드를 돌리려면 `PYTHONPATH=backend`를 앞에 둔다. `ROOT`가 워크트리를 가리키므로 `CONSTELLATION_DATA_DIR`로 실제 데이터 폴더를 준다.
- `name`을 실제 DB에 돌리면 앱이 읽는 `data/constellation.duckdb`가 바뀐다. 먼저 스크래치 복사본에 돌려 결과를 보고, 그다음 실제 DB.
- `claude --bare`는 키체인을 안 읽어 로그인 실패. 쓰지 않는다.
- codex는 `-o` 파일에 마지막 메시지만 쓴다. stdout은 무시한다.
- `cluster_meta.label`은 이전 naming 실행으로 이미 LLM 이름일 수 있다. c-TF-IDF 폴백은 `label`이 아니라 `keywords[:3]`에서 만든다.
- 레벨 분할은 더하기만 한다. 재실행해도 합쳐지지 않으며, 원래 절단으로 돌리려면 `constellation hierarchy`를 다시 돌린다.
- TreeView의 절단선은 레벨 노드 부모 높이의 최솟값에 긋는다. 갈라진 자식의 부모는 낮으므로 선이 다른 레벨 노드 아래로 내려간다. 표시 흠이고 프런트는 범위 밖 — 보고에 적는다.
- 루트(88)가 불응집이면 레벨 0에 루트가 없어도 문제없다 — 레벨 0은 원래 루트를 포함하지 않는다(k=8).

## 완료 기준

```
PYTHONPATH=backend ../../.venv/bin/python -m unittest discover -s backend/tests -t backend   # 통과
CONSTELLATION_DATA_DIR=<스크래치 복사본> PYTHONPATH=backend ../../.venv/bin/python -m constellation.cli name
  → "완료 — 89개", 갈라진 노드 로그
duckdb: SELECT count(*) FROM cluster_tree WHERE label LIKE 'Mixed:%'  → 0
duckdb: SELECT level, count(*) FROM tree_levels ... JOIN cluster_tree ... WHERE label LIKE '% · %' AND level < 2  → 0
```
실제 DB에 돌린 뒤 `cargo run -p constellation-serve` + `npm run dev`로 지도 상위·하위 분야 라벨을 확인한다.
