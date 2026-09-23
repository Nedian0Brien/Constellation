"""연산 장치 선택. CUDA가 있으면 CUDA, Apple GPU(MPS)가 있으면 MPS, 없으면 CPU."""
from __future__ import annotations

from typing import Any


def pick_device(torch: Any) -> str:
    """임베딩과 LLM 이름 짓기가 같은 규칙을 쓴다. torch 모듈을 받아 import 비용을
    호출부에 두고, 테스트는 가짜 모듈로 분기를 확인한다."""
    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(getattr(torch, "backends", None), "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"
