"""소스 어댑터의 경계.

파이프라인 나머지는 Work만 안다. 소스가 바뀌어도 이 아래만 바뀐다.
"""
from __future__ import annotations

import re
from typing import AsyncIterator, Protocol, runtime_checkable

from pydantic import BaseModel, Field


class Author(BaseModel):
    id: str | None = None
    name: str
    orcid: str | None = None


class Topic(BaseModel):
    name: str
    score: float | None = None
    kind: str = "topic"  # topic | concept | keyword | subject_area


class Work(BaseModel):
    """모든 소스가 이 형태로 변환된다."""

    id: str                                   # "openalex:W2741809807"
    doi: str | None = None
    title: str
    abstract: str | None = None               # None = 초록 없음 (빈 문자열과 구분)
    year: int | None = None
    venue: str | None = None
    authors: list[Author] = Field(default_factory=list)
    referenced_works: list[str] = Field(default_factory=list)
    topics: list[Topic] = Field(default_factory=list)
    cited_by_count: int | None = None
    type: str | None = None
    source: str = "unknown"
    raw_ref: str | None = None                # data/raw/ 내 원본 위치

    @property
    def has_abstract(self) -> bool:
        return bool(self.abstract and self.abstract.strip())

    @property
    def embed_text(self) -> str:
        """임베딩 입력. 초록이 없으면 제목만 쓴다 (별도 표시 대상)."""
        return f"{self.title}\n\n{self.abstract}" if self.has_abstract else self.title


@runtime_checkable
class PaperSource(Protocol):
    name: str

    def search(self, query: str, limit: int) -> AsyncIterator[Work]: ...

    def fetch_by_ids(self, ids: list[str]) -> AsyncIterator[Work]: ...

    def supports_abstracts(self) -> bool:
        """Scopus는 entitlement에 따라 런타임에 달라진다. 정적 상수로 두면
        조용히 빈 초록을 임베딩하게 된다."""
        ...


# ── 중복 제거 키 ────────────────────────────────────────────

_DOI_PREFIX = re.compile(r"^https?://(dx\.)?doi\.org/", re.I)
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def norm_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    return _DOI_PREFIX.sub("", doi.strip()).lower() or None


def norm_title(title: str | None) -> str:
    if not title:
        return ""
    return _NON_ALNUM.sub("", title.lower())


def dedupe_key(w: Work) -> str:
    """DOI 우선, 없으면 정규화 제목 + 연도."""
    d = norm_doi(w.doi)
    if d:
        return f"doi:{d}"
    return f"ti:{norm_title(w.title)}:{w.year or '?'}"
