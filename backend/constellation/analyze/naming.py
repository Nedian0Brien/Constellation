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

SYSTEM = (
    "너는 학술 문헌 지도에 이름을 붙이는 사서다. "
    "주어진 근거만 보고 연구 주제 묶음의 이름을 짓는다. "
    "근거에 없는 내용을 지어내지 않는다."
)

RULES = """규칙:
- 한국어 이름. 6단어를 넘기지 마라. 짧을수록 좋다.
- 학술 분야 이름처럼 쓴다. 문장도, 설명도, "~ 기반 ~"류의 구절도 아니다.
- 널리 쓰이는 영문 약어(RAG, IR, LLM, PIR, NER)는 그대로 둔다.
- 하위 묶음들이 서로 무관하면 억지로 하나로 잇지 말고 "혼합: A와 B"로 쓴다.
- 근거(특징 용어·논문 제목·하위 묶음 이름)에 나오지 않는 개념을 넣지 마라.
- "~ 기반 ~" 꼴을 쓰지 마라. 명사구 하나로 끝내라.
- 이름만 출력한다. 따옴표, 설명, 접두사를 붙이지 마라."""

# 규칙을 말로만 주면 4B급 모델은 지키지 않는다. 실측에서 한국어 규칙을
# 어기고("dense & interactive ranking"), 무관한 자식을 억지로 이어
# 없는 개념을 지어냈다("PIR과 에너지 기반 애플리케이션의 보안 공학").
# 형식은 예시로 가르치는 편이 확실하다. 이 코퍼스 밖의 예시를 쓴다.
SHOTS = """예시 1
특징 용어: federated, client, aggregation, privacy, decentralized
이름: 연합학습

예시 2
하위 묶음:
  - transformer · attention · pretraining (2,100편)
  - bert · fine-tuning · downstream (900편)
이름: 사전학습 언어모델

예시 3
하위 묶음:
  - protein · folding · structure (800편)
  - solar · photovoltaic · efficiency (760편)
이름: 혼합: 단백질 구조와 태양전지

예시 4
하위 묶음:
  - graph neural · message passing (410편)
  - node classification · link prediction (380편)
이름: 그래프 신경망

"""


def _leaf_prompt(label: str, keywords: list[str], titles: list[str], size: int) -> str:
    t = "\n".join("  - " + x[:110] for x in titles[:6])
    return "\n\n".join([
        RULES,
        SHOTS,
        "이제 아래 묶음의 이름을 지어라.\n"
        "논문 %s편으로 이루어진 하나의 주제 묶음이다.\n\n"
        "특징 용어(빈도 가중 상위): %s\n\n"
        "피인용 상위 논문 제목:\n%s"
        % (format(size, ","), ", ".join(keywords[:8]), t),
        "이름:",
    ])


def _node_prompt(children: list[tuple[str, int]], keywords: list[str], size: int) -> str:
    c = "\n".join("  - %s (%s편)" % (lab, format(n, ",")) for lab, n in children)
    return "\n\n".join([
        RULES,
        SHOTS,
        "이제 아래 묶음의 이름을 지어라.\n"
        "논문 %s편을 담은 상위 묶음이다. 하위 묶음들을 포괄하는 이름이어야 한다.\n\n"
        "하위 묶음:\n%s\n\n전체 특징 용어: %s"
        % (format(size, ","), c, ", ".join(keywords[:8])),
        "이름:",
    ])


def _clean(text: str) -> str:
    """모델이 덧붙이는 군더더기를 떼어낸다."""
    t = text.strip().split("\n")[0].strip()
    t = re.sub(r'^["\'“‘`]+|["\'”’`]+$', "", t).strip()
    t = re.sub(r"^(이름|라벨|답|Name|Label)\s*[:：]\s*", "", t, flags=re.I).strip()
    t = t.rstrip(".。").strip()
    return t[:60]


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
        return {"run_id": run_id, "n": len(named), "seconds": el}
    finally:
        conn.close()
