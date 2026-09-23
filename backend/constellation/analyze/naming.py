"""Codex·Claude CLI로 클러스터·계층 노드에 이름을 붙인다.

c-TF-IDF는 통계적으로 두드러진 어절을 나열할 뿐이라, 잎에서는 그런대로
읽히지만(`dense · passage · bert`) 내부 노드에서는 무너진다. 자식들의
키워드를 합쳐봐야 `energy · pir · bug` 같은 조합이 나온다 — 셋이 한
갈래인 이유를 설명하지 못한다.

모델에는 잎의 근거(키워드·대표 논문 제목)와 내부 노드의 구성(두 자식
그룹의 하위 잎 전부)을 주고 짧은 이름만 받는다. 로컬 LLM(Qwen3-4B)은
버렸다 — GPU가 필요했고, 포괄 이름이 가능한 노드도 `Mixed:`로 냈다.
기계에 로그인된 `codex`/`claude` CLI를 서브프로세스로 부른다. API 키가
필요 없고, 구조화 JSON 출력을 둘 다 지원한다.

지키는 것 네 가지:

  1. c-TF-IDF 키워드를 지우지 않는다. LLM 이름은 독자가 검증할 수 없으므로
     근거가 옆에 남아 있어야 한다. label_src 컬럼으로 출처를 구분한다.
  2. 입력과 출력을 저장한다. 어떤 근거로 그 이름이 나왔는지 나중에 물을 수
     있어야 한다.
  3. 서로 다른 영역을 억지로 합치지 않는다. 트리는 2D 지도 좌표 위의 Ward라
     병합이 "지도에서 이웃"이지 "주제가 비슷함"이 아니다. 무관한 두 그룹을
     덮는 우산 이름은 거짓말이다. 모델이 `coherent=false`로 판정한 노드는
     `A · B` 복합 이름을 갖고, 지도에 보이는 레벨에서는 자식 둘로 갈라
     보여준다(`tree_levels` 조정).
  4. 한 단계의 노드를 한 호출로 짓는다. 형제가 서로 비슷한 이름을 피할 수
     있고, 부모가 자식 라벨 문자열만 보고 짓던 전파(자식이 Mixed면 부모도
     Mixed)가 사라진다.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from typing import Any, Callable, Protocol

from ..db import store

Progress = Callable[[str], None]

DEFAULT_BACKEND = "codex"
# 모델 slug는 ~/.codex/models_cache.json 과 `claude --help`(별칭)에서 확인했다.
# codex 기본은 gpt-6-luna(2026-09-24 사용자 지시, models_cache.json에 있음).
DEFAULT_MODELS = {"codex": "gpt-6-luna", "claude": "opus"}
CLI_TIMEOUT = 600

# 영어로 뽑는다.
#
# 처음에는 한국어로 시켰다가 도메인 용어의 한국어 대응을 모른다는 것이
# 드러났다 — dense retrieval을 "신문 검색", music information retrieval을
# "음성 정보 검색"으로 냈다. 이 분야의 명칭은 원래 영어가 표준이고(Dense
# Retrieval, Learning to Rank) 모델의 영어가 훨씬 안정적이다.

SYSTEM = (
    "You are a librarian who names regions on a map of scholarly literature. "
    "You name clusters of research papers using only the evidence given. "
    "You never introduce concepts that are absent from the evidence, and you "
    "never force unrelated areas under one name."
)

RULES = """Rules:
- Answer in English. Each name is at most 5 words. Shorter is better.
- Write it like the name of a research area, not a sentence or a description.
- Use Title Case. Keep established acronyms as-is (RAG, IR, LLM, PIR, NER, OCR).
- Do not introduce any concept that is absent from the evidence
  (characteristic terms, paper titles, sub-cluster names).
- Never use a "Mixed:" prefix.
- Names must be distinct from each other. A parent cluster and the clusters
  nested inside it must not share a name: the parent's name is broader, the
  nested one's says what its own sub-clusters share. If two clusters would get
  the same name, that name is too broad for at least one of them.
- A name that merely restates the topic the whole map was collected for
  fits every cluster and is not allowed.
- coherent=true means every sub-cluster listed belongs to ONE established
  research field or subfield, and the name is that field's standard name
  (Text Mining, Knowledge Representation, Multilingual NLP, Software
  Engineering ...). The field may be broader than each sub-cluster; that is
  what a parent is for. Pick the most specific field that still contains
  every sub-cluster, never one that would fit the whole map.
- coherent=false means the sub-clusters belong to different fields, so that
  only a vacuous umbrella ("Applied AI", "Computing Research", "Data-Driven
  Methods", "Emerging Technologies") or an "A and B" phrase could cover them.
  Then write the name as the two areas joined by " · " (each side at most
  5 words). A coherent=true name never joins two areas with "and", "&" or "/".
- Return JSON only: {"names": [{"id": <int>, "name": <string>, "coherent": <bool>}, ...]}
  with exactly one entry per id given."""

# 규칙을 말로만 주면 모델은 지키지 않는다. 형식은 예시로 가르치는 편이
# 확실하다. 이 코퍼스 밖의 예시를 쓴다. 마지막 예시는 이 코퍼스에서 실제로
# 억지 병합이 났던 짝이다.
SHOTS = """Example input
[id 3] 2,100 papers. Terms: federated, client, aggregation, privacy, decentralized
[id 7] Group A (800 papers): Protein Structure Prediction (800). Group B (760 papers): Photovoltaic Efficiency (760).
[id 9] Group A (410 papers): Topic Modeling (410). Group B (380 papers): Text Classification (300), Sentiment Analysis (80).
[id 12] Group A (341 papers): Music Signal Processing (341). Group B (354 papers): Cross-Lingual NLP (200), Arabic Text Processing (154).
[id 14] Group A (177 papers): Semantic Web (177). Group B (147 papers): Knowledge Graph Embeddings (98), Entity Linking (49).

Example output
{"names": [
  {"id": 3, "name": "Federated Learning", "coherent": true},
  {"id": 7, "name": "Protein Structure Prediction · Photovoltaics", "coherent": false},
  {"id": 9, "name": "Text Mining", "coherent": true},
  {"id": 12, "name": "Music Signal Processing · Cross-Lingual NLP", "coherent": false},
  {"id": 14, "name": "Knowledge Representation", "coherent": true}
]}
"""

RETRY_NOTE = (
    "\n\n(The previous answer for these ids was missing, not in the required "
    "form, or identical to another cluster's name. Answer in English only, "
    "Title Case, at most 5 words per name, one entry per id, JSON only. "
    "Names already taken by other clusters, do not reuse: %s)"
)

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "names": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "name": {"type": "string"},
                    "coherent": {"type": "boolean"},
                },
                "required": ["id", "name", "coherent"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["names"],
    "additionalProperties": False,
}


# ── 프롬프트 ────────────────────────────────────────────────────────

def leaf_batch_prompt(items: list[dict[str, Any]]) -> str:
    """잎 클러스터 묶음. 항목: id, size, keywords, titles."""
    lines = []
    for it in items:
        t = "; ".join(x[:110] for x in it.get("titles", [])[:6])
        lines.append(
            "[id %d] %s papers. Terms (frequency-weighted): %s. "
            "Most-cited titles: %s"
            % (it["id"], format(it["size"], ","),
               ", ".join(it.get("keywords", [])[:8]), t or "(none)"))
    return "\n\n".join([
        RULES, SHOTS,
        "Now name the clusters below. Each is a single topical cluster found "
        "by density clustering; it cannot be split. If a cluster clearly "
        "holds two unrelated areas, set coherent=false and use the \" · \" form.\n\n"
        + "\n".join(lines),
    ])


def _group(g: dict[str, Any]) -> str:
    leaves = ", ".join("%s (%s)" % (n, format(s, ",")) for n, s in g["leaves"])
    ref = " = id %d" % g["node"] if g.get("node") is not None else ""
    return "Group %s (%s papers%s): %s" % (g["tag"], format(g["size"], ","), ref, leaves)


def corpus_line(phrases: list[str]) -> str:
    if not phrases:
        return ""
    return ("The whole map was collected by searching for: %s. Names that just "
            "restate this (or a synonym of it) are not allowed.\n\n"
            % ", ".join(phrases[:12]))


def corpus_phrases(filters: list[str]) -> list[str]:
    """수집 쿼리(OpenAlex filter)의 따옴표 구절. 지도 전체의 주제라 이름으로 못 쓴다."""
    out: list[str] = []
    for f in filters:
        for ph in re.findall(r'"([^"]+)"', f or ""):
            if ph.lower() not in {o.lower() for o in out}:
                out.append(ph)
    return out


def node_batch_prompt(items: list[dict[str, Any]], phrases: list[str] = ()) -> str:
    """내부 노드 묶음. 항목: id, size, keywords, parent,
    groups=[{tag,size,node(내부면 id),leaves:[(name,size)]}×2]."""
    lines = []
    for it in items:
        parent = " Nested inside id %d." % it["parent"] if it.get("parent") is not None else ""
        lines.append(
            "[id %d] %s papers.%s %s. Terms overall: %s"
            % (it["id"], format(it["size"], ","), parent,
               " ".join(_group(g) for g in it["groups"]),
               ", ".join(it.get("keywords", [])[:8])))
    return "\n\n".join([
        RULES, SHOTS,
        corpus_line(list(phrases)) +
        "Now name the parent clusters below. Each merges two groups of "
        "sub-clusters (names and paper counts given; a group that is itself a "
        "parent cluster in this list is marked with its id). Decide first "
        "whether one established field contains every sub-cluster of both "
        "groups; only then name it. The name must cover every sub-cluster "
        "listed, not just the largest, and must differ from the names of the "
        "clusters it is nested inside and of those nested inside it.\n\n"
        + "\n".join(lines),
    ])


# ── 출력 검증 ────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    """모델이 덧붙이는 군더더기를 떼어낸다."""
    t = text.strip().split("\n")[0].strip()
    t = re.sub(r'^["\'“‘`]+|["\'”’`]+$', "", t).strip()
    t = re.sub(r"^(Name|Label|Answer|이름|라벨|답)\s*[:：]\s*", "", t, flags=re.I).strip()
    t = t.rstrip(".。").strip()
    return t[:120]


# 영어 이름을 기대하므로 한글·한자·가나가 섞이면 실패로 본다.
_NON_LATIN = re.compile(r"[぀-ヿ㐀-鿿가-힯]")


def is_malformed(name: str, coherent: bool = True) -> str | None:
    """쓸 수 없는 출력이면 이유를, 멀쩡하면 None을 돌려준다.

    유창하지만 틀린 이름은 이걸로 못 잡는다 — 그래서 c-TF-IDF 키워드를
    라벨 옆에 남겨 독자가 대조할 수 있게 한다. 불응집 이름은 ` · ` 양쪽을
    따로 잰다.
    """
    if not name or len(name) < 2:
        return "빈 출력"
    if _NON_LATIN.search(name):
        return "영어가 아님"
    if not re.search(r"[A-Za-z]", name):
        return "알파벳이 없음"
    if re.match(r"^\s*mixed\s*:", name, flags=re.I):
        return "Mixed 접두"
    parts = [p.strip() for p in name.split("·")] if not coherent else [name]
    if any(not p for p in parts):
        return "빈 쪽"
    if any(len(p.split()) > 8 for p in parts):
        return "너무 김"
    if name.count(":") > 1:
        return "구분자 중복"
    return None


def check_names(
    ids: list[int], response: dict[str, Any], taken: dict[int, str] | None = None,
) -> tuple[dict[int, tuple[str, bool]], list[int]]:
    """응답에서 쓸 수 있는 이름을 고른다. (ok: id → (name, coherent), bad: 재요청할 id).

    같은 이름이 둘 이상에 붙으면(`taken`의 다른 노드 이름 포함) 처음 것만 남기고
    나머지는 bad — 겹치는 이름은 적어도 한쪽에는 너무 넓은 이름이다.
    """
    ok: dict[int, tuple[str, bool]] = {}
    want = set(ids)
    used = {v.lower() for k, v in (taken or {}).items() if k not in want}
    for e in response.get("names", []) or []:
        try:
            i = int(e.get("id"))
        except (TypeError, ValueError, AttributeError):
            continue
        if i not in want or i in ok:
            continue
        coherent = bool(e.get("coherent", True))
        name = _clean(str(e.get("name", "")))
        if is_malformed(name, coherent) or name.lower() in used:
            continue
        used.add(name.lower())
        ok[i] = (name, coherent)
    return ok, [i for i in ids if i not in ok]


# ── 레벨 분할 ────────────────────────────────────────────────────────

def split_levels(
    levels: dict[int, list[int]],
    children: dict[int, tuple[int | None, int | None]],
    coherent: dict[int, bool],
) -> dict[int, list[int]]:
    """불응집 노드를 자식 둘로 바꾼다. 마지막 레벨(잎)은 그대로.

    한 노드가 여러 레벨에 들어 있을 수 있다(k=8 절단의 노드를 k=18이 더 쪼개지
    않았을 때). 레벨마다 같은 규칙을 적용해야 포함 관계(상위 레벨이 하위 레벨보다
    거칠다)가 유지된다. 잎은 항상 응집으로 본다.
    """
    def expand(node: int) -> list[int]:
        l, r = children.get(node, (None, None))
        if l is None or r is None or coherent.get(node, True):
            return [node]
        return expand(l) + expand(r)

    last = max(levels) if levels else -1
    out: dict[int, list[int]] = {}
    for lv, nodes in levels.items():
        if lv == last:
            out[lv] = list(nodes)
            continue
        seen: list[int] = []
        for n in nodes:
            for m in expand(n):
                if m not in seen:
                    seen.append(m)
        out[lv] = seen
    return out


# ── 백엔드 ──────────────────────────────────────────────────────────

class Namer(Protocol):
    label: str

    def complete(self, prompt: str) -> dict[str, Any]: ...


def _run(cmd: list[str], prompt: str, cwd: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "NO_COLOR": "1"}
    try:
        p = subprocess.run(
            cmd, input=prompt, capture_output=True, text=True, cwd=cwd,
            env=env, timeout=CLI_TIMEOUT,
        )
    except FileNotFoundError:
        raise RuntimeError("%s 를 찾을 수 없다. 설치와 로그인이 필요하다." % cmd[0])
    except subprocess.TimeoutExpired:
        raise RuntimeError("%s 가 %d초 안에 끝나지 않았다." % (cmd[0], CLI_TIMEOUT))
    if p.returncode != 0:
        raise RuntimeError("%s 종료 코드 %d:\n%s"
                           % (cmd[0], p.returncode, p.stderr.strip()[-2000:]))
    return p


class CodexNamer:
    """`codex exec`. 플래그는 `codex exec --help`(0.155)로 확인했다.

    --ephemeral            세션 파일을 남기지 않는다
    --skip-git-repo-check  임시 폴더에서 돈다
    --ignore-user-config   사용자 config의 notify 훅·플러그인·기본 모델을 안 탄다. auth는 그대로
    --ignore-rules         execpolicy 규칙 파일 무시
    -s read-only           도구가 있어도 쓰기 금지
    --output-schema        마지막 메시지를 JSON Schema로 강제
    -o FILE                마지막 메시지만 파일로. stdout에는 진행 로그가 섞인다
    프롬프트 `-`           stdin
    codex에는 system prompt 옵션이 없어 SYSTEM을 프롬프트 머리에 넣는다.
    """

    def __init__(self, model: str) -> None:
        self.model = model
        self.label = "codex/%s" % model

    def complete(self, prompt: str) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="constellation-name-") as d:
            schema = os.path.join(d, "schema.json")
            out = os.path.join(d, "out.json")
            with open(schema, "w", encoding="utf-8") as f:
                json.dump(SCHEMA, f)
            cmd = ["codex", "exec", "-m", self.model, "--ephemeral",
                   "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
                   "-s", "read-only", "--color", "never",
                   "--output-schema", schema, "-o", out, "-"]
            p = _run(cmd, SYSTEM + "\n\n" + prompt, d)
            if not os.path.exists(out):
                raise RuntimeError("codex가 결과 파일을 쓰지 않았다:\n%s"
                                   % p.stderr.strip()[-2000:])
            with open(out, encoding="utf-8") as f:
                text = f.read()
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise RuntimeError("codex 출력이 JSON이 아니다 (%s): %r" % (e, text[:300]))


class ClaudeNamer:
    """`claude -p`. 플래그는 `claude --help`(2.1.274)로 확인했다.

    --tools ""              내장 도구 전부 끔
    --output-format json    결과 봉투 하나. structured_output 에 스키마 결과
    --json-schema           구조화 출력 강제
    --no-session-persistence, --setting-sources "", --strict-mcp-config
                            세션·설정·MCP를 읽지 않는다. `--bare`는 키체인도 안 읽어
                            로그인이 풀리므로 쓰지 않는다
    """

    def __init__(self, model: str) -> None:
        self.model = model
        self.label = "claude/%s" % model

    def complete(self, prompt: str) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="constellation-name-") as d:
            cmd = ["claude", "-p", "--tools", "", "--model", self.model,
                   "--output-format", "json", "--json-schema", json.dumps(SCHEMA),
                   "--no-session-persistence", "--setting-sources", "",
                   "--strict-mcp-config", "--system-prompt", SYSTEM]
            p = _run(cmd, prompt, d)
        try:
            env = json.loads(p.stdout)
        except json.JSONDecodeError as e:
            raise RuntimeError("claude 출력이 JSON이 아니다 (%s): %r" % (e, p.stdout[:300]))
        if env.get("is_error"):
            raise RuntimeError("claude 오류: %s" % env.get("result"))
        so = env.get("structured_output")
        if isinstance(so, dict):
            return so
        try:
            return json.loads(env.get("result") or "")
        except json.JSONDecodeError:
            raise RuntimeError("claude가 구조화 출력을 주지 않았다: %r"
                               % str(env.get("result"))[:300])


def make_namer(backend: str, model: str | None) -> Namer:
    backend = backend.lower()
    if backend not in DEFAULT_MODELS:
        raise ValueError("backend는 codex 또는 claude여야 한다: %r" % backend)
    if shutil.which(backend) is None:
        raise RuntimeError("%s CLI가 PATH에 없다." % backend)
    m = model or DEFAULT_MODELS[backend]
    return CodexNamer(m) if backend == "codex" else ClaudeNamer(m)


# ── 실행 ────────────────────────────────────────────────────────────

def name_batch(
    namer: Namer,
    ids: list[int],
    build: Callable[[list[int]], str],
    log: Progress,
    taken: dict[int, str] | None = None,
) -> tuple[dict[int, tuple[str, bool]], dict[int, str]]:
    """한 묶음을 짓고, 빠지거나 불량이거나 이름이 겹치는 것만 한 번 더 묻는다.

    `taken`은 다른 묶음에서 이미 정해진 이름(내부 노드를 지을 때의 잎 이름).
    돌려주는 것: (id → (name, coherent), id → 그 id가 들어간 프롬프트).
    """
    taken = dict(taken or {})
    prompt = build(ids)
    prompts = {i: prompt for i in ids}
    ok, bad = check_names(ids, namer.complete(prompt), taken)
    if bad:
        log("    형식 불량·누락·중복 %d개 — 재요청: %s" % (len(bad), bad))
        taken.update({i: n for i, (n, _) in ok.items()})
        prompt2 = build(bad) + RETRY_NOTE % "; ".join(sorted(set(taken.values())))
        ok2, bad2 = check_names(bad, namer.complete(prompt2), taken)
        for i in bad:
            prompts[i] = prompt2
        ok.update(ok2)
        if bad2:
            log("    재요청 실패 %d개 — c-TF-IDF 라벨 유지: %s" % (len(bad2), bad2))
    return ok, prompts


def run(
    *,
    run_id: str | None = None,
    model_key: str = "scincl",
    backend: str = DEFAULT_BACKEND,
    model: str | None = None,
    leaves: bool = True,
    namer: Namer | None = None,
    log: Progress = print,
) -> dict[str, Any]:
    namer = namer or make_namer(backend, model)
    conn = store.connect()
    try:
        if not run_id:
            row = conn.execute(
                "SELECT run_id FROM runs WHERE kind='project' AND model=? "
                "ORDER BY created_at DESC LIMIT 1", (model_key,)
            ).fetchone()
            if not row:
                raise RuntimeError("투영 결과가 없다.")
            run_id = row[0]

        nodes = conn.execute(
            "SELECT node_id, left_id, right_id, size, n_leaves, cluster_id, "
            "       label, keywords FROM cluster_tree WHERE run_id = ? "
            "ORDER BY n_leaves, node_id", (run_id,)
        ).fetchall()
        if not nodes:
            raise RuntimeError("트리가 없다. constellation hierarchy 를 먼저 돌려라.")
        levels_rows = conn.execute(
            "SELECT level, node_id FROM tree_levels WHERE run_id = ? "
            "ORDER BY level, node_id", (run_id,)
        ).fetchall()
        levels: dict[int, list[int]] = {}
        for lv, nd in levels_rows:
            levels.setdefault(lv, []).append(nd)

        by_id = {n[0]: n for n in nodes}
        children = {n[0]: (n[1], n[2]) for n in nodes}
        parent = {c: n[0] for n in nodes for c in (n[1], n[2]) if c is not None}
        phrases = corpus_phrases([
            r[0] for r in conn.execute(
                "SELECT DISTINCT filter_expr FROM collections").fetchall()])
        kws = {n[0]: (n[7] or "").split(", ") if n[7] else [] for n in nodes}
        ctfidf = {n[0]: " · ".join(kws[n[0]][:3]) or "노드 %d" % n[0] for n in nodes}
        leaf_ids = [n[0] for n in nodes if n[5] is not None]
        inner_ids = [n[0] for n in nodes if n[5] is None]

        top_titles: dict[int, list[str]] = {}
        for cid, in conn.execute(
            "SELECT DISTINCT cluster_id FROM cluster_meta WHERE run_id = ?", (run_id,)
        ).fetchall():
            top_titles[cid] = [
                r[0] for r in conn.execute(
                    "SELECT w.title FROM clusters c JOIN works w ON w.id = c.work_id "
                    "WHERE c.run_id = ? AND c.cluster_id = ? "
                    "ORDER BY w.cited_by_count DESC NULLS LAST LIMIT 6", (run_id, cid)
                ).fetchall()
            ]

        log("백엔드 %s · 잎 %d개 · 내부 %d개" % (namer.label, len(leaf_ids), len(inner_ids)))
        t0 = datetime.now(timezone.utc)
        named: dict[int, tuple[str, bool]] = {}
        prompts: dict[int, str] = {}

        # 잎 이름은 내부 노드의 근거가 된다. 잎을 안 지으면 현재 라벨을 쓴다.
        if leaves:
            log("잎 %d개를 한 호출로 짓는다 ..." % len(leaf_ids))
            def build_leaves(ids: list[int]) -> str:
                return leaf_batch_prompt([{
                    "id": i, "size": by_id[i][3], "keywords": kws[i],
                    "titles": top_titles.get(by_id[i][5], []),
                } for i in ids])
            ok, ps = name_batch(namer, leaf_ids, build_leaves, log)
            named.update(ok)
            prompts.update(ps)
        leaf_name = {i: named[i][0] if i in named else by_id[i][6] for i in leaf_ids}

        def leaves_of(node: int) -> list[int]:
            l, r = children[node]
            if l is None or r is None:
                return [node]
            return leaves_of(l) + leaves_of(r)

        log("내부 노드 %d개를 한 호출로 짓는다 ..." % len(inner_ids))
        def build_inner(ids: list[int]) -> str:
            items = []
            for i in ids:
                groups = []
                for tag, c in zip("AB", children[i]):
                    ls = sorted(leaves_of(c), key=lambda x: -by_id[x][3])
                    groups.append({
                        "tag": tag, "size": by_id[c][3],
                        "node": c if by_id[c][5] is None else None,
                        "leaves": [(leaf_name[x], by_id[x][3]) for x in ls],
                    })
                items.append({"id": i, "size": by_id[i][3], "keywords": kws[i],
                              "parent": parent.get(i), "groups": groups})
            return node_batch_prompt(items, phrases)
        # 잎 이름은 이미 정해졌다. 부모가 잎과 같은 이름을 갖지 않게 넘긴다.
        ok, ps = name_batch(namer, inner_ids, build_inner, log, leaf_name)
        named.update(ok)
        prompts.update(ps)

        el = (datetime.now(timezone.utc) - t0).total_seconds()

        # ── 저장 ──
        targets = (leaf_ids if leaves else []) + inner_ids
        n_fallback = 0
        for i in targets:
            if i in named:
                nm, _ = named[i]
                conn.execute(
                    "UPDATE cluster_tree SET label = ?, label_src = 'llm' "
                    "WHERE run_id = ? AND node_id = ?", (nm, run_id, i))
            else:
                n_fallback += 1
                conn.execute(
                    "UPDATE cluster_tree SET label = ?, label_src = 'ctfidf' "
                    "WHERE run_id = ? AND node_id = ?", (ctfidf[i], run_id, i))
        # 잎 이름은 cluster_meta 에도 반영해 지도 라벨이 따라오게 한다
        for i in leaf_ids:
            if i in named:
                conn.execute(
                    "UPDATE cluster_meta SET label = ? WHERE run_id = ? AND cluster_id = ?",
                    (named[i][0], run_id, by_id[i][5]))

        coherent = {i: c for i, (_, c) in named.items()}
        new_levels = split_levels(levels, children, coherent)
        splits = []
        for lv in sorted(levels):
            gone = [n for n in levels[lv] if n not in new_levels[lv]]
            if gone:
                splits.append((lv, gone, len(new_levels[lv])))
        conn.execute("DELETE FROM tree_levels WHERE run_id = ?", (run_id,))
        store.bulk_insert(
            conn, "tree_levels", ["run_id", "level", "k", "node_id"],
            [(run_id, lv, len(ns), nd) for lv, ns in new_levels.items() for nd in ns])

        conn.execute("""CREATE TABLE IF NOT EXISTS naming_audit (
            run_id TEXT NOT NULL, node_id INTEGER NOT NULL,
            prompt TEXT NOT NULL, output TEXT NOT NULL, model TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL, PRIMARY KEY (run_id, node_id))""")
        conn.execute("DELETE FROM naming_audit WHERE run_id = ?", (run_id,))
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        store.bulk_insert(
            conn, "naming_audit",
            ["run_id", "node_id", "prompt", "output", "model", "created_at"],
            [(run_id, i, prompts[i],
              json.dumps({"name": named[i][0], "coherent": named[i][1]}
                         if i in named else {"fallback": ctfidf[i]}),
              namer.label, now) for i in targets])
        conn.commit()

        log("")
        for lv, gone, k in splits:
            log("  레벨 %d: 불응집 노드 %s 를 자식으로 갈랐다 → %d개"
                % (lv, ", ".join("%d(%s)" % (g, named[g][0]) for g in gone), k))
        joined = [i for i in targets if i in named and named[i][1]
                  and re.search(r"\b(and|&)\b|/", named[i][0])]
        if joined:
            log("  응집이라면서 두 영역을 잇는 이름 %d개 — 눈으로 확인: %s"
                % (len(joined), ", ".join("%d %s" % (i, named[i][0]) for i in joined)))
        log("완료 — %d개, %.0f초" % (len(targets), el))
        if n_fallback:
            log("  형식 불량으로 c-TF-IDF 라벨을 유지한 노드 %d개" % n_fallback)
        return {"run_id": run_id, "n": len(targets), "seconds": el,
                "fallback": n_fallback, "splits": splits,
                "levels": {lv: len(ns) for lv, ns in new_levels.items()}}
    finally:
        conn.close()
