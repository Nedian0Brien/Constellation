"""임베딩 캐시.

키는 hash(모델 + 제목 + 초록)다. 쿼리를 바꿔 다시 수집해도 이미 계산한
논문은 건드리지 않고, 초록이 나중에 보강되면(=본문이 바뀌면) 그 논문만
다시 계산된다.

벡터는 DuckDB가 아니라 .npy에 둔다. 1만 × 768 float32 ≈ 30MB이고,
UMAP·최근접이웃은 어차피 통째로 메모리에 올려 쓴다.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from ..config import DATA

EMB_DIR = DATA / "embeddings"


class EmbeddingStore:
    def __init__(self, model_key: str) -> None:
        self.model_key = model_key
        self.dir = EMB_DIR / model_key
        self.vec_path = self.dir / "vectors.npy"
        self.idx_path = self.dir / "index.parquet"
        self.vectors: np.ndarray | None = None
        self.row_of: dict[str, int] = {}      # text_hash -> row
        self._load()

    def _load(self) -> None:
        if self.vec_path.exists() and self.idx_path.exists():
            self.vectors = np.load(self.vec_path)
            tbl = pq.read_table(self.idx_path)
            hashes = tbl.column("text_hash").to_pylist()
            rows = tbl.column("row").to_pylist()
            self.row_of = dict(zip(hashes, rows))

    @property
    def n_cached(self) -> int:
        return len(self.row_of)

    def missing(self, hashes: list[str]) -> list[str]:
        """아직 계산하지 않은 해시를 순서 유지하며 중복 없이 돌려준다."""
        seen: set[str] = set()
        out: list[str] = []
        for h in hashes:
            if h not in self.row_of and h not in seen:
                seen.add(h)
                out.append(h)
        return out

    def add(self, hashes: list[str], vectors: np.ndarray) -> None:
        if not hashes:
            return
        if vectors.shape[0] != len(hashes):
            raise ValueError("해시 수와 벡터 수가 다르다")
        base = 0 if self.vectors is None else self.vectors.shape[0]
        if self.vectors is None:
            self.vectors = vectors.astype(np.float32)
        else:
            if self.vectors.shape[1] != vectors.shape[1]:
                raise ValueError(
                    "차원이 다르다 (%d vs %d) — 캐시 디렉터리를 지우고 다시 만들어라"
                    % (self.vectors.shape[1], vectors.shape[1])
                )
            self.vectors = np.vstack([self.vectors, vectors.astype(np.float32)])
        for i, h in enumerate(hashes):
            self.row_of[h] = base + i

    def save(self) -> None:
        if self.vectors is None:
            return
        self.dir.mkdir(parents=True, exist_ok=True)
        np.save(self.vec_path, self.vectors)
        items = sorted(self.row_of.items(), key=lambda kv: kv[1])
        pq.write_table(
            pa.table({
                "text_hash": pa.array([h for h, _ in items]),
                "row": pa.array([r for _, r in items], type=pa.int64()),
            }),
            self.idx_path,
        )

    def matrix_for(self, hashes: list[str]) -> np.ndarray:
        """주어진 순서 그대로 (N, D) 행렬을 만든다."""
        if self.vectors is None:
            raise RuntimeError("캐시가 비어 있다")
        rows = [self.row_of[h] for h in hashes]
        return self.vectors[rows]
