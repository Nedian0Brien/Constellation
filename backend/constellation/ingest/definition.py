"""앱에서 받는 지도 정의.

코드 상수인 `QuerySet` 대신 JSON으로 수집 방법을 받는다. 세 종류가 있다.

  terms   검색어(OR) + 연도 범위 + 연도별 편수 — `QuerySet`과 같은 수집
  topics  OpenAlex 토픽·서브필드·필드 + 연도 범위 + 연도별 편수
  seeds   DOI 목록에서 참고문헌·피인용으로 한 단계 넓힌다

terms·topics는 `years`, `per_year`, `target`, `filter_for_year`를 갖춰 기존
`collect()`가 그대로 받는다. 예상 편수(`estimate`)와 수집이 같은 필터를 쓴다.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any

DEFAULT_TYPES = ("article", "preprint", "conference-paper")
MAX_PER_YEAR = 2000
MAX_SEEDS = 50
DEFAULT_SEED_LIMIT = 3000
MAX_SEED_LIMIT = 10000  # OpenAlex page 방식은 1만 건이 상한이다

_TOPIC_ID = re.compile(r"^(?:https://openalex\.org/)?(T\d+|subfields/\d+|fields/\d+)$")


class DefinitionError(ValueError):
    """정의가 잘못되었다. 메시지는 사용자에게 그대로 보인다."""


@dataclass(frozen=True)
class _Common:
    name: str
    model: str

    @property
    def description(self) -> str:
        return self.name

    def to_json(self) -> dict[str, Any]:
        d = asdict(self)
        d["kind"] = self.kind  # type: ignore[attr-defined]
        for k, v in d.items():
            if isinstance(v, tuple):
                d[k] = list(v)
        return d


@dataclass(frozen=True)
class _Yearly(_Common):
    year_from: int
    year_to: int
    per_year: int
    types: tuple[str, ...] = DEFAULT_TYPES
    facets: dict[str, list[str]] = field(default_factory=dict)

    @property
    def years(self) -> list[int]:
        return list(range(self.year_from, self.year_to + 1))

    @property
    def target(self) -> int:
        return len(self.years) * self.per_year

    def _scope(self) -> str:
        raise NotImplementedError

    def filter_for_year(self, year: int) -> str:
        return ",".join([
            self._scope(),
            "publication_year:%d" % year,
            "type:" + "|".join(self.types),
        ])


@dataclass(frozen=True)
class TermsDef(_Yearly):
    terms: tuple[str, ...] = ()
    kind = "terms"

    def _scope(self) -> str:
        return "title_and_abstract.search:" + " OR ".join(self.terms)


@dataclass(frozen=True)
class TopicsDef(_Yearly):
    topics: tuple[str, ...] = ()
    kind = "topics"

    def _scope(self) -> str:
        """대표 토픽(primary_topic) 기준. `topics.*`보다 좁고 정밀하다."""
        groups: dict[str, list[str]] = {}
        for t in self.topics:
            if t.startswith("subfields/"):
                groups.setdefault("primary_topic.subfield.id", []).append(t.split("/")[1])
            elif t.startswith("fields/"):
                groups.setdefault("primary_topic.field.id", []).append(t.split("/")[1])
            else:
                groups.setdefault("primary_topic.id", []).append(t)
        if len(groups) > 1:
            # OpenAlex는 서로 다른 필터를 AND로 묶는다. 수준이 섞이면 OR가 안 된다.
            raise DefinitionError("토픽·서브필드·필드를 섞어 고를 수 없습니다. 한 수준만 고르세요.")
        (key, ids), = groups.items()
        return "%s:%s" % (key, "|".join(ids))


@dataclass(frozen=True)
class SeedsDef(_Common):
    dois: tuple[str, ...] = ()
    limit: int = DEFAULT_SEED_LIMIT
    kind = "seeds"


Definition = TermsDef | TopicsDef | SeedsDef


def _text(d: dict[str, Any], key: str) -> str:
    v = d.get(key)
    if not isinstance(v, str) or not v.strip():
        raise DefinitionError("%s 값이 필요합니다." % key)
    return v.strip()


def _int(d: dict[str, Any], key: str, lo: int, hi: int, default: int | None = None) -> int:
    v = d.get(key, default)
    if isinstance(v, bool) or not isinstance(v, int):
        raise DefinitionError("%s 값은 정수여야 합니다." % key)
    if not lo <= v <= hi:
        raise DefinitionError("%s 값은 %d–%d 사이여야 합니다." % (key, lo, hi))
    return v


def _strings(d: dict[str, Any], key: str) -> list[str]:
    v = d.get(key)
    if not isinstance(v, list):
        raise DefinitionError("%s 값은 목록이어야 합니다." % key)
    out = [s.strip() for s in v if isinstance(s, str) and s.strip()]
    if not out:
        raise DefinitionError("%s 값이 하나 이상 필요합니다." % key)
    return list(dict.fromkeys(out))


def _norm_doi(s: str) -> str:
    s = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:)", "", s.strip(), flags=re.I)
    if not s.startswith("10.") or "/" not in s:
        raise DefinitionError("DOI 형식이 아닙니다: %s" % s)
    return s.lower()


def parse(d: dict[str, Any]) -> Definition:
    """JSON 정의를 검증해 정의 객체로 바꾼다."""
    from ..embed.encoder import MODELS

    if not isinstance(d, dict):
        raise DefinitionError("정의는 객체여야 합니다.")
    name = _text(d, "name")
    model = d.get("model") or "scincl"
    if model not in MODELS:
        raise DefinitionError("모르는 임베딩 모델: %s (%s)" % (model, ", ".join(MODELS)))
    kind = d.get("kind")
    if kind in ("terms", "topics"):
        y0 = _int(d, "year_from", 1900, 2100)
        y1 = _int(d, "year_to", 1900, 2100)
        if y0 > y1:
            raise DefinitionError("year_from이 year_to보다 큽니다.")
        per_year = _int(d, "per_year", 1, MAX_PER_YEAR)
        if kind == "terms":
            terms = tuple(t if t.startswith('"') else '"%s"' % t.replace('"', "")
                          for t in _strings(d, "terms"))
            return TermsDef(name=name, model=model, year_from=y0, year_to=y1,
                            per_year=per_year, terms=terms)
        topics = []
        for t in _strings(d, "topics"):
            m = _TOPIC_ID.match(t)
            if not m:
                raise DefinitionError("토픽 id 형식이 아닙니다: %s" % t)
            topics.append(m.group(1))
        defn = TopicsDef(name=name, model=model, year_from=y0, year_to=y1,
                         per_year=per_year, topics=tuple(topics))
        defn.filter_for_year(y0)  # 수준을 섞었는지 미리 확인한다
        return defn
    if kind == "seeds":
        dois = tuple(dict.fromkeys(_norm_doi(s) for s in _strings(d, "dois")))
        if len(dois) > MAX_SEEDS:
            raise DefinitionError("시드 DOI는 %d개까지입니다." % MAX_SEEDS)
        limit = _int(d, "limit", 100, MAX_SEED_LIMIT, DEFAULT_SEED_LIMIT)
        return SeedsDef(name=name, model=model, dois=dois, limit=limit)
    raise DefinitionError("kind는 terms, topics, seeds 중 하나여야 합니다.")


def corpus_id(name: str, taken: set[str], now: str) -> str:
    """이름에서 ASCII kebab-case id를 만든다. 비거나 겹치면 `map-<시각>`."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40].strip("-")
    if slug and slug not in taken:
        return slug
    base = "map-" + now.lower()
    cid, n = base, 2
    while cid in taken:
        cid, n = "%s-%d" % (base, n), n + 1
    return cid
