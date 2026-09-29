---
title: 영역 이름을 Codex·Claude CLI로 짓고 Mixed 라벨을 없앤다
slug: naming-cli
stage: intent
status: accepted
author: minjaepark
date: 2026-09-19
---

# 영역 이름을 Codex·Claude CLI로 짓고 Mixed 라벨을 없앤다

## 문제

`constellation name`은 로컬 Qwen3-4B(transformers/torch)로 클러스터·계층 노드 이름을 짓는다. 모델을 내려받고 GPU에 올려야 하고, 4B급이라 `Named Entity Recognition` + `Text Summarization`처럼 포괄 이름이 가능한 노드도 `Mixed:`로 낸다.

현재 run(`project-scincl-20260826T084511Z`)의 `cluster_tree` 89개 중 15개가 `Mixed:`이고, 그중 4개가 지도의 상위·하위 분야 라벨로 보인다(`Mixed: Music Signal Processing and Cross-Lingual NLP` 등). 원인은 세 가지다.

1. 전파 — 부모 프롬프트에 자식 2개의 새 라벨만 넣는다. 자식 하나가 `Mixed:`면 부모도 `Mixed:`가 된다(81 → 82 → 86 → 88 루트까지). 잎 5–6개를 덮는 노드도 모델은 자식 문자열 2개만 보고 구성 전체를 못 본다.
2. 트리 — Ward 트리를 2D 지도 좌표로 세우므로 병합은 "지도에서 이웃"이지 "주제가 비슷함"이 아니다. 무관한 두 분야가 한 노드로 묶이면 정직한 이름이 없다.
3. 모델 — 4B급의 한계.

## 원하는 결과

- `constellation name`이 로컬 LLM 없이 기계의 `codex`(기본, 모델 `gpt-5.6-luna`) 또는 `claude`(`--backend claude`) CLI로 이름을 짓는다. 구독 로그인만 있으면 되고 API 키·GPU가 필요 없다. `--llm`으로 모델을 바꿀 수 있다.
- 잎 45개와 내부 노드 44개 모두 새로 짓는다. 내부 노드는 하위 잎 전부(이름·논문 수·키워드)를 보고 짓는다. 한 레벨의 형제는 한 호출로 받아 형제끼리 비슷한 이름을 피한다.
- 지도에 보이는 레벨(상위 분야·하위 분야)의 어떤 라벨에도 `Mixed:` 접두가 없다. 무관한 병합으로 판정된 노드는 그 레벨에서 자식 둘로 갈라 보여준다(`tree_levels` 조정). 계층 트리 뷰에만 나오는 중간 노드는 두 주제를 ` · `로 이은 복합 이름을 갖는다.
- `naming_audit`에 프롬프트·출력·백엔드/모델이 남고, `cluster_tree.keywords`(c-TF-IDF 근거)는 유지된다.
- 형식 불량(비영어, 8단어 초과 등) 이름은 한 번 재요청하고, 그래도 불량이면 c-TF-IDF 라벨을 유지한다.

## 영향 범위

- `backend/constellation/analyze/naming.py`, `cli.py`의 `name` 명령, `hierarchy.py`의 레벨 절단 결과(`tree_levels`).
- DuckDB `cluster_tree.label`, `cluster_meta.label`, `tree_levels`, `naming_audit`.
- 프런트엔드·Rust 질의 계층은 `tree_levels`를 주는 대로 읽으므로 코드 변경 없음. 지도 라벨과 계층 트리 뷰의 이름이 바뀐다.
- 결정: minjaepark.

## 제약

- CLI 플래그는 `--help`로 확인한 것만 쓴다. 확인함: `codex exec -m … --ephemeral --skip-git-repo-check -s read-only --output-schema FILE -o FILE`, `claude -p --tools "" --model … --output-format json --json-schema … --no-session-persistence --setting-sources "" --strict-mcp-config --system-prompt …`. 둘 다 구조화 JSON 출력을 실제로 돌려 확인했다(`claude --bare`는 키체인을 읽지 않아 로그인 실패 → 쓰지 않는다).
- `sentence-transformers`(임베딩)는 남긴다. 이름 짓기 전용 의존(torch/transformers/bitsandbytes 경로, `--4bit`)만 제거한다.
- 이름은 영어. 이전 결정(한국어 오역 문제) 유지.
- 잎 c-TF-IDF 키워드는 지우지 않는다. 독자가 이름을 대조할 근거다.

## 범위 밖

- 트리를 임베딩 공간(umap10·원본)으로 다시 세우는 것. 지도와 트리의 정합이 깨질 수 있어 별도 실험으로 미룬다.
- 클러스터링·계층 절단 파라미터(`--levels 8,18`) 변경.
- 프런트엔드 라벨 배치·표시 로직 변경.
- 에이전트 채팅에서 이름 짓기를 호출하는 것.

## 열린 질문

- 없음. 백엔드 기본(codex, gpt-5.6-luna), 정책(A 입력 개편 + C 응집도 절단), 잎도 다시 짓기는 2026-09-19 대화에서 결정했다.
