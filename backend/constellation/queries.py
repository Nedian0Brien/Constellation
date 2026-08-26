"""쿼리 세트 정의.

수집 전략 — 연도별 할당량 + 피인용순 정렬.

  단순히 cursor로 앞에서부터 1만 편을 받으면 표본이 최근에 심하게 쏠린다.
  RAG는 2024년 이후가 전체의 95%라 그대로 받으면 Flow 뷰의 시간 윈도우
  대부분이 비어버린다. 연도마다 할당량을 두고 그 안에서 피인용 상위를
  가져오면, 시간 축이 고르게 채워지면서 각 시기의 영향력 있는 논문이 들어온다.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class QuerySet:
    name: str
    description: str
    terms: list[str]                    # title_and_abstract.search 에 OR로 결합된다
    year_from: int
    year_to: int
    per_year: int
    types: tuple[str, ...] = ("article", "preprint", "conference-paper")
    # 사후 태깅용 — 어떤 갈래로 들어온 논문인지 표시한다
    facets: dict[str, list[str]] = field(default_factory=dict)

    def filter_for_year(self, year: int) -> str:
        search = " OR ".join(self.terms)
        return ",".join([
            'title_and_abstract.search:' + search,
            "publication_year:%d" % year,
            "type:" + "|".join(self.types),
        ])

    @property
    def years(self) -> list[int]:
        return list(range(self.year_from, self.year_to + 1))

    @property
    def target(self) -> int:
        return len(self.years) * self.per_year


# ── RAG / IR ────────────────────────────────────────────────
#
# IR이 역사적 척추를, RAG가 최근 가지를 담당한다. RAG만 모으면 2023년
# 이전이 사실상 비어 있어서 "갈래가 뻗어나가는" 그림 자체가 안 나온다.

RAG_IR = QuerySet(
    name="rag-ir",
    description="Retrieval-Augmented Generation + Information Retrieval",
    terms=[
        # RAG 가지
        '"retrieval-augmented generation"',
        '"retrieval augmented generation"',
        '"retrieval-augmented"',
        '"open-domain question answering"',
        '"knowledge-intensive"',
        # 다리 — 신경망 검색 (2019~2022)
        '"dense retrieval"',
        '"dense passage retrieval"',
        '"neural information retrieval"',
        '"neural ranking"',
        '"cross-encoder"',
        '"bi-encoder"',
        # IR 척추
        '"information retrieval"',
        '"learning to rank"',
        '"document ranking"',
        '"passage ranking"',
        '"query expansion"',
        '"relevance feedback"',
        '"semantic search"',
        '"vector search"',
    ],
    year_from=2014,
    year_to=2026,
    per_year=750,
    facets={
        "rag": ["retrieval-augmented", "retrieval augmented", " rag ",
                "knowledge-intensive", "open-domain question"],
        "dense": ["dense retrieval", "dense passage", "bi-encoder",
                  "cross-encoder", "neural ranking", "neural information retrieval"],
        "ranking": ["learning to rank", "document ranking", "passage ranking",
                    "reranking", "re-ranking"],
        "classic": ["query expansion", "relevance feedback", "pseudo-relevance",
                    "bm25", "tf-idf"],
        "vector": ["vector search", "semantic search", "nearest neighbor",
                   "vector database", "embedding index"],
    },
)


# ── 실사용 대상 (M1 이후) ───────────────────────────────────

PHYSICAL_AI = QuerySet(
    name="physical-ai",
    description="Physical AI — 로보틱스·구현형 지능·시각운동 정책",
    terms=[
        '"physical AI"',
        '"embodied AI"',
        '"embodied intelligence"',
        '"vision-language-action"',
        '"robot learning"',
        '"visuomotor policy"',
        '"sim-to-real"',
        '"robot foundation model"',
        '"manipulation policy"',
        '"imitation learning"',
        '"world model"',
    ],
    year_from=2014,
    year_to=2026,
    per_year=750,
    facets={
        "vla": ["vision-language-action", "robot foundation model"],
        "policy": ["visuomotor", "manipulation policy", "imitation learning"],
        "sim2real": ["sim-to-real", "domain randomization"],
        "world-model": ["world model", "model-based rl"],
    },
)

ON_DEVICE_AI = QuerySet(
    name="on-device-ai",
    description="On-device AI — 엣지 추론·모델 압축·효율적 서빙",
    terms=[
        '"on-device"',
        '"edge inference"',
        '"edge AI"',
        '"tinyML"',
        '"model compression"',
        '"knowledge distillation"',
        '"post-training quantization"',
        '"quantization-aware training"',
        '"neural architecture search"',
        '"efficient inference"',
        '"mobile neural network"',
    ],
    year_from=2014,
    year_to=2026,
    per_year=750,
    facets={
        "quant": ["quantization", "int8", "low-bit"],
        "distill": ["distillation", "teacher-student"],
        "prune": ["pruning", "sparsity", "structured sparse"],
        "nas": ["architecture search", "nas"],
        "serving": ["inference engine", "edge inference", "latency"],
    },
)


SETS: dict[str, QuerySet] = {q.name: q for q in (RAG_IR, PHYSICAL_AI, ON_DEVICE_AI)}


def get(name: str) -> QuerySet:
    if name not in SETS:
        raise KeyError("알 수 없는 쿼리 세트: %s (가능: %s)" % (name, ", ".join(SETS)))
    return SETS[name]
