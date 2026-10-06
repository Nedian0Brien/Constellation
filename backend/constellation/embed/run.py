"""임베딩 실행 — DB의 works를 읽어 캐시를 채운다."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable

import pyarrow as pa
import pyarrow.parquet as pq

from ..db import store
from .cache import EmbeddingStore
from .encoder import build_text, encode, get_spec, load_model, text_hash

Progress = Callable[[str], None]
Count = Callable[[int, int], None]

# 진행률을 알리는 단위. 배치 여러 개를 한 번에 encode에 넘긴다.
CHUNK = 512


def _no_count(done: int, total: int) -> None:
    pass


def embed_corpus(
    model_key: str,
    *,
    batch_size: int = 64,
    log: Progress = print,
    work_ids: list[str] | None = None,
    progress: Count = _no_count,
) -> dict:
    """works를 임베딩해 캐시에 넣는다.

    work_ids를 주면 그 논문만 계산한다(앱이 새 지도를 만들 때). 이때
    works.parquet는 다른 코퍼스의 행을 지우지 않고 이 논문의 행만 바꿔 쓴다.
    """
    spec = get_spec(model_key)
    conn = store.connect()
    try:
        if work_ids is None:
            rows = conn.execute(
                "SELECT id, title, abstract, has_abstract FROM works ORDER BY id"
            ).fetchall()
        else:
            conn.register("_want", pa.table({"id": pa.array(sorted(set(work_ids)))}))
            try:
                rows = conn.execute(
                    "SELECT w.id, w.title, w.abstract, w.has_abstract FROM works w "
                    "JOIN _want USING (id) ORDER BY w.id"
                ).fetchall()
            finally:
                conn.unregister("_want")
        if not rows:
            raise RuntimeError("코퍼스가 비어 있다. 먼저 collect를 돌려라.")

        texts = [build_text(r[1], r[2], spec) for r in rows]
        hashes = [text_hash(t, spec) for t in texts]
        n_title_only = sum(1 for r in rows if not r[3])

        st = EmbeddingStore(model_key)
        by_hash: dict[str, str] = {}
        for h, t in zip(hashes, texts):
            by_hash.setdefault(h, t)
        todo = st.missing(hashes)

        log("모델 %s (%s)" % (spec.key, spec.hf_id))
        log("  %s" % spec.note)
        log("코퍼스 %s편 · 캐시 보유 %s · 새로 계산 %s"
            % (format(len(rows), ","), format(st.n_cached, ","),
               format(len(todo), ",")))
        if n_title_only:
            log("  제목만으로 임베딩되는 논문 %s편 (초록 없음)"
                % format(n_title_only, ","))

        if todo:
            model = load_model(spec)
            try:
                import torch
                dev = str(next(model.parameters()).device)
                log("장치: %s" % dev)
                if dev.startswith("cuda"):
                    log("  %s" % torch.cuda.get_device_name(0))
            except Exception:
                pass
            import numpy as np
            parts = []
            progress(0, len(todo))
            for i in range(0, len(todo), CHUNK):
                part = todo[i:i + CHUNK]
                parts.append(encode(model, [by_hash[h] for h in part],
                                    batch_size=batch_size))
                progress(min(i + CHUNK, len(todo)), len(todo))
            vecs = np.vstack(parts)
            st.add(todo, vecs)
            st.save()
            log("임베딩 완료 — 차원 %d" % vecs.shape[1])
        else:
            log("전부 캐시에 있다. 계산 없음.")

        # work_id -> text_hash 매핑. 다음 단계가 works 순서대로 행렬을 만든다.
        ids = [r[0] for r in rows]
        mapping = dict(zip(ids, hashes))
        path = st.dir / "works.parquet"
        if work_ids is not None and path.exists():
            old = pq.read_table(path)
            for w, h in zip(old.column("work_id").to_pylist(),
                            old.column("text_hash").to_pylist()):
                mapping.setdefault(w, h)
        keys = sorted(mapping)
        st.dir.mkdir(parents=True, exist_ok=True)
        pq.write_table(
            pa.table({"work_id": pa.array(keys),
                      "text_hash": pa.array([mapping[k] for k in keys])}),
            path,
        )

        run_id = "embed-%s-%s" % (model_key,
                                  datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
        conn.execute(
            "INSERT OR REPLACE INTO runs "
            "(run_id, kind, model, params_json, n_items, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (run_id, "embed", model_key,
             json.dumps({"hf_id": spec.hf_id, "pooling": spec.pooling,
                         "batch_size": batch_size, "title_only": n_title_only}),
             len(rows), datetime.now(timezone.utc).replace(tzinfo=None)),
        )
        conn.commit()
        return {"run_id": run_id, "n": len(rows), "new": len(todo),
                "dim": 0 if st.vectors is None else int(st.vectors.shape[1])}
    finally:
        conn.close()
