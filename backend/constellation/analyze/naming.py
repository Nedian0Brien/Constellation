"""로컬 LLM으로 클러스터·계층 노드에 이름을 붙인다.

c-TF-IDF는 통계적으로 두드러진 어절을 나열할 뿐이라, 잎에서는 그런대로
읽히지만(`dense · passage · bert`) 내부 노드에서는 무너진다. 자식들의
키워드를 합쳐봐야 `energy · pir · bug` 같은 조합이 나온다 — 셋이 한
갈래인 이유를 설명하지 못한다.

LLM에는 자식 라벨·크기·대표 논문 제목을 주고 짧은 이름만 받는다.

지키는 것 세 가지:

  1. c-TF-IDF 키워드를 지우지 않는다. LLM 이름은 독자가 검증할 수 없으므로
     근거가 옆에 남아 있어야 한다. label_src 컬럼으로 출처를 구분한다.
  2. 입력과 출력을 저장한다. 어떤 근거로 그 이름이 나왔는지 나중에 물을 수
     있어야 한다.
  3. "혼합"이라고 말할 여지를 준다. 지배적 주제가 없는 노드에 억지로 하나의
     이름을 붙이면 그게 거짓말이 된다. 자식 크기를 함께 주고 명시적으로
     허용한다.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Callable

from ..db import store

Progress = Callable[[str], None]

DEFAULT_MODEL = "Qwen/Qwen3-4B-Instruct-2507"
MAX_NEW_TOKENS = 48

# 영어로 뽑는다.
#
# 처음에는 한국어로 시켰다가 도메인 용어의 한국어 대응을 모른다는 것이
# 드러났다 — dense retrieval을 "신문 검색", music information retrieval을
# "음성 정보 검색", semantic web을 "세미어nt릭"으로 냈다.
#
# beam search(4, 8)로도 "신문 검색 모델"이 그대로 나왔다. 전체 확률로
# 비교해도 모델이 그 경로를 선호한다는 뜻이라 디코딩 문제가 아니었다.
# 이 분야의 명칭은 원래 영어가 표준이고(Dense Retrieval, Learning to Rank),
# 모델의 영어가 훨씬 안정적이다.

SYSTEM = (
    "You are a librarian who names regions on a map of scholarly literature. "
    "You name a cluster of research papers using only the evidence given. "
    "You never introduce concepts that are absent from the evidence."
)

RULES = """Rules:
- Answer in English. At most 5 words. Shorter is better.
- Write it like the name of a research area, not a sentence or a description.
- Use Title Case. Keep established acronyms as-is (RAG, IR, LLM, PIR, NER, OCR).
- If the sub-clusters are unrelated, do not force a single name.
  Write "Mixed: A and B" instead.
- Do not introduce any concept that is absent from the evidence
  (characteristic terms, paper titles, sub-cluster names).
- Output the name only. No quotes, no explanation, no prefix."""

# 규칙을 말로만 주면 작은 모델은 지키지 않는다. 형식은 예시로 가르치는
# 편이 확실하다. 이 코퍼스 밖의 예시를 쓴다.
SHOTS = """Example 1
Characteristic terms: federated, client, aggregation, privacy, decentralized
Name: Federated Learning

Example 2
Sub-clusters:
  - transformer · attention · pretraining (2,100 papers)
  - bert · fine-tuning · downstream (900 papers)
Name: Pretrained Language Models

Example 3
Sub-clusters:
  - protein · folding · structure (800 papers)
  - solar · photovoltaic · efficiency (760 papers)
Name: Mixed: Protein Structure and Photovoltaics

Example 4
Sub-clusters:
  - graph neural · message passing (410 papers)
  - node classification · link prediction (380 papers)
Name: Graph Neural Networks

"""


def _leaf_prompt(label: str, keywords: list[str], titles: list[str], size: int) -> str:
    t = "\n".join("  - " + x[:110] for x in titles[:6])
    return "\n\n".join([
        RULES,
        SHOTS,
        "Now name the cluster below.\n"
        "It is a single topical cluster of %s papers.\n\n"
        "Characteristic terms (frequency-weighted): %s\n\n"
        "Most-cited paper titles:\n%s"
        % (format(size, ","), ", ".join(keywords[:8]), t),
        "Name:",
    ])


def _node_prompt(children: list[tuple[str, int]], keywords: list[str], size: int) -> str:
    c = "\n".join("  - %s (%s papers)" % (lab, format(n, ",")) for lab, n in children)
    return "\n\n".join([
        RULES,
        SHOTS,
        "Now name the cluster below.\n"
        "It is a parent cluster of %s papers. The name must cover its sub-clusters.\n\n"
        "Sub-clusters:\n%s\n\nCharacteristic terms overall: %s"
        % (format(size, ","), c, ", ".join(keywords[:8])),
        "Name:",
    ])


def _clean(text: str) -> str:
    """모델이 덧붙이는 군더더기를 떼어낸다."""
    t = text.strip().split("\n")[0].strip()
    t = re.sub(r'^["\'“‘`]+|["\'”’`]+$', "", t).strip()
    t = re.sub(r"^(Name|Label|Answer|이름|라벨|답)\s*[:：]\s*", "", t, flags=re.I).strip()
    t = t.rstrip(".。").strip()
    return t[:90]   # 영어 이름은 한국어보다 길다. 60자면 잘린다.


# 영어 이름을 기대하므로 한글·한자·가나가 섞이면 실패로 본다.
_NON_LATIN = re.compile(r"[぀-ヿ㐀-鿿가-힯]")


def is_malformed(name: str) -> str | None:
    """쓸 수 없는 출력이면 이유를, 멀쩡하면 None을 돌려준다.

    유창하지만 틀린 이름은 이걸로 못 잡는다 — 그래서 c-TF-IDF 키워드를
    라벨 옆에 남겨 독자가 대조할 수 있게 한다.
    """
    if not name or len(name) < 2:
        return "빈 출력"
    if _NON_LATIN.search(name):
        return "영어가 아님"
    if len(name.split()) > 8:
        return "너무 김"
    if name.count(":") > 1:
        return "구분자 중복"
    if not re.search(r"[A-Za-z]", name):
        return "알파벳이 없음"
    return None


class LocalNamer:
    def __init__(self, model_id: str = DEFAULT_MODEL, *, load_4bit: bool = False,
                 log: Progress = print) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.model_id = model_id
        log("모델 로딩: %s%s" % (model_id, " (4bit)" if load_4bit else ""))
        self.tok = AutoTokenizer.from_pretrained(model_id)
        kw: dict[str, Any] = {
            "dtype": torch.bfloat16,
            "device_map": "cuda" if torch.cuda.is_available() else "cpu",
        }
        if load_4bit:
            # 14B를 bf16으로 올리면 28GB라 16GB 카드에 안 들어간다.
            # nf4 + double quant로 약 9GB.
            from transformers import BitsAndBytesConfig
            kw["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
            )
        self.model = AutoModelForCausalLM.from_pretrained(model_id, **kw)
        self.model.eval()
        dev = next(self.model.parameters()).device
        log("  장치 %s · %.1fGB" % (dev, torch.cuda.memory_allocated() / 1e9))

    def name(self, prompt: str) -> str:
        import torch

        msgs = [{"role": "system", "content": SYSTEM},
                {"role": "user", "content": prompt}]
        # Qwen3는 thinking 모드가 기본이라 긴 추론을 뱉는다. 이름 짓기에는
        # 필요 없고 max_new_tokens 안에서 답이 안 나온다.
        try:
            text = self.tok.apply_chat_template(
                msgs, tokenize=False, add_generation_prompt=True,
                enable_thinking=False)
        except TypeError:
            text = self.tok.apply_chat_template(
                msgs, tokenize=False, add_generation_prompt=True)
        ids = self.tok([text], return_tensors="pt").to(self.model.device)
        with torch.no_grad():
            out = self.model.generate(
                **ids,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,          # 결정적으로 — 같은 근거면 같은 이름
                temperature=None,
                top_p=None,
                top_k=None,
                pad_token_id=self.tok.eos_token_id,
            )
        gen = out[0][ids["input_ids"].shape[1]:]
        return _clean(self.tok.decode(gen, skip_special_tokens=True))


def run(
    *,
    run_id: str | None = None,
    model_key: str = "scincl",
    model_id: str = DEFAULT_MODEL,
    load_4bit: bool = False,
    leaves: bool = True,
    log: Progress = print,
) -> dict[str, Any]:
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

        by_id = {n[0]: n for n in nodes}
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

        targets = [n for n in nodes if leaves or n[5] is None]
        log("이름을 붙일 노드 %d개 (잎 %d · 내부 %d)"
            % (len(targets),
               sum(1 for n in targets if n[5] is not None),
               sum(1 for n in targets if n[5] is None)))

        namer = LocalNamer(model_id, load_4bit=load_4bit, log=log)
        named: dict[int, str] = {}
        audit: list[tuple] = []
        n_fallback = 0
        t0 = datetime.now(timezone.utc)

        for i, n in enumerate(targets, 1):
            node_id, lid, rid, size, n_leaves, cid, old, kw = n
            kws = (kw or "").split(", ") if kw else []
            if cid is not None:
                prompt = _leaf_prompt(old, kws, top_titles.get(cid, []), size)
            else:
                ch = []
                for c in (lid, rid):
                    if c is None:
                        continue
                    # 이미 이름을 붙인 자식이면 새 이름을 쓴다
                    lab = named.get(c, by_id[c][6])
                    ch.append((lab, by_id[c][3]))
                prompt = _node_prompt(ch, kws, size)

            out = namer.name(prompt)
            why = is_malformed(out)
            if why:
                # 한 번만 더 시도한다. 결정적 생성이라 프롬프트를 바꿔야 결과가 바뀐다.
                log("    [%d] %s: %r — 재시도" % (node_id, why, out))
                out2 = namer.name(
                    prompt
                    + "\n\n(The previous answer was not in the required form. "
                      "Answer in English only, as a short Title Case noun "
                      "phrase of at most 5 words.)")
                out = out2 if not is_malformed(out2) else old
                if out is old:
                    log("    [%d] 재시도 실패 — c-TF-IDF 라벨 유지" % node_id)
                    n_fallback += 1
            if not out:
                out = old
            named[node_id] = out
            audit.append((run_id, node_id, prompt, out))
            if i % 10 == 0 or i == len(targets):
                log("  %d/%d ..." % (i, len(targets)))

        el = (datetime.now(timezone.utc) - t0).total_seconds()

        for node_id, nm in named.items():
            conn.execute(
                "UPDATE cluster_tree SET label = ?, label_src = 'llm' "
                "WHERE run_id = ? AND node_id = ?", (nm, run_id, node_id))
        # 잎 이름은 cluster_meta 에도 반영해 지도 라벨이 따라오게 한다
        for node_id, nm in named.items():
            cid = by_id[node_id][5]
            if cid is not None:
                conn.execute(
                    "UPDATE cluster_meta SET label = ? WHERE run_id = ? AND cluster_id = ?",
                    (nm, run_id, cid))

        conn.execute("""CREATE TABLE IF NOT EXISTS naming_audit (
            run_id TEXT NOT NULL, node_id INTEGER NOT NULL,
            prompt TEXT NOT NULL, output TEXT NOT NULL, model TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL, PRIMARY KEY (run_id, node_id))""")
        conn.execute("DELETE FROM naming_audit WHERE run_id = ?", (run_id,))
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        store.bulk_insert(
            conn, "naming_audit",
            ["run_id", "node_id", "prompt", "output", "model", "created_at"],
            [(a[0], a[1], a[2], a[3], model_id, now) for a in audit])
        conn.commit()

        log("")
        log("완료 — %d개, %.0f초 (%.1f초/개)" % (len(named), el, el / max(len(named), 1)))
        if n_fallback:
            log("  형식 불량으로 c-TF-IDF 라벨을 유지한 노드 %d개" % n_fallback)
        return {"run_id": run_id, "n": len(named), "seconds": el,
                "fallback": n_fallback}
    finally:
        conn.close()
