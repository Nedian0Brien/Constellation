"""초록 임베딩.

모델 교체가 설정 한 줄이어야 한다 — M1의 열린 질문이 "어느 모델인가"이고,
그건 같은 코퍼스로 셋 다 돌려봐야 답이 나온다.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable, Sequence

if TYPE_CHECKING:  # torch/sentence-transformers는 실제 인코딩 때만 부른다
    from sentence_transformers import SentenceTransformer


@dataclass(frozen=True)
class ModelSpec:
    key: str
    hf_id: str
    pooling: str          # 'cls' | 'mean'
    sep: str              # 제목과 초록을 잇는 방식
    note: str
    query_prefix: str = ""


# SPECTER 계열은 "title[SEP]abstract"로 학습됐다. 이 형식을 어기면
# 성능이 눈에 띄게 떨어진다.
MODELS: dict[str, ModelSpec] = {
    "scincl": ModelSpec(
        key="scincl",
        hf_id="malteos/scincl",
        pooling="cls",
        sep="[SEP]",
        note="인용 그래프 대조학습. 설치가 가장 단순하다.",
    ),
    "specter2": ModelSpec(
        key="specter2",
        hf_id="allenai/specter2_base",
        pooling="cls",
        sep="[SEP]",
        note="SPECTER2 base. 검색용 proximity adapter를 못 얹은 상태라 "
             "실제 SPECTER2보다 낮게 나온다 (adapters 라이브러리가 "
             "transformers 4.x를 요구해 현재 환경과 충돌).",
    ),
    "specter": ModelSpec(
        key="specter",
        hf_id="sentence-transformers/allenai-specter",
        pooling="cls",
        sep="[SEP]",
        note="SPECTER v1. 어댑터가 필요 없어 온전한 상태로 돌아간다 — "
             "SPECTER 계열의 공정한 대표값.",
    ),
    "bge-m3": ModelSpec(
        key="bge-m3",
        hf_id="BAAI/bge-m3",
        pooling="cls",
        sep="\n\n",
        note="범용 다국어. 인용 신호로 학습되지 않은 대조군.",
    ),
}

DEFAULT_MODEL = "scincl"


def get_spec(key: str) -> ModelSpec:
    if key not in MODELS:
        raise KeyError("알 수 없는 모델: %s (가능: %s)" % (key, ", ".join(MODELS)))
    return MODELS[key]


def build_text(title: str, abstract: str | None, spec: ModelSpec) -> str:
    """초록이 없으면 제목만. 빈 문자열을 넣으면 [SEP] 뒤가 비어 노이즈가 된다."""
    t = (title or "").strip()
    a = (abstract or "").strip()
    return t + spec.sep + a if a else t


def text_hash(text: str, spec: ModelSpec) -> str:
    """캐시 키. 본문이 같고 모델이 같으면 다시 계산하지 않는다."""
    h = hashlib.blake2b(digest_size=16)
    h.update(spec.hf_id.encode())
    h.update(b"\x00")
    h.update(text.encode("utf-8", "replace"))
    return h.hexdigest()


def load_model(spec: ModelSpec, device: str | None = None) -> "SentenceTransformer":
    """지정한 풀링으로 명시 조립한다.

    SentenceTransformer(hf_id)를 그냥 부르면 풀링 설정이 없는 모델에
    mean 풀링을 조용히 붙인다. SPECTER 계열은 CLS라 결과가 달라진다.
    """
    import torch
    from sentence_transformers import SentenceTransformer, models

    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    word = models.Transformer(spec.hf_id, max_seq_length=512)
    dim = (word.get_embedding_dimension() if hasattr(word, "get_embedding_dimension")
           else word.get_word_embedding_dimension())
    pool = models.Pooling(dim, pooling_mode=spec.pooling)
    return SentenceTransformer(modules=[word, pool], device=device)


def encode(
    model: "SentenceTransformer",
    texts: Sequence[str],
    batch_size: int = 64,
    log=print,
) -> "object":
    """정규화된 float32 벡터를 돌려준다.

    코사인 유사도를 쓸 것이므로 여기서 L2 정규화해두면 이후 단계가
    내적만으로 끝난다.
    """
    import numpy as np

    vecs = model.encode(
        list(texts),
        batch_size=batch_size,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    return vecs.astype(np.float32)
