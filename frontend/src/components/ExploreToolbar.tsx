import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "./ui/select";
import { Slider } from "./ui/slider";
import type { ColorBy } from "../app/navigation";
export function ExploreToolbar() {
  const a = useAnalysis(),
    { state, update } = useExploration();
  const [draft, setDraft] = useState(state.q),
    [composing, setComposing] = useState(false);
  useEffect(() => setDraft(state.q), [state.q]);
  useEffect(() => {
    if (composing || draft.trim() === state.q) return;
    const timer = setTimeout(() => update({ q: draft.trim() }, true), 250);
    return () => clearTimeout(timer);
  }, [draft, composing, state.q, update]);
  const years = a.map.data?.year.filter((y): y is number => y !== null) ?? [];
  const lo = years.length ? Math.min(...years) : 1945,
    hi = years.length ? Math.max(...years) : 2026;
  return (
    <div className="explore-toolbar">
      <Field className="search-field" data-invalid={draft.trim().length === 1}>
        <FieldLabel className="sr-only" htmlFor="paper-search">
          논문 검색
        </FieldLabel>
        <div className="search-control">
          <Search aria-hidden="true" />
          <Input
            id="paper-search"
            value={draft}
            placeholder="논문 제목·초록 검색"
            aria-invalid={draft.trim().length === 1}
            aria-describedby="search-hint"
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onChange={(e) => setDraft(e.target.value)}
          />
          {draft && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="검색 지우기"
              onClick={() => {
                setDraft("");
                update({ q: "" }, true);
              }}
            >
              <X />
            </Button>
          )}
        </div>
      </Field>
      <Select
        value={state.color}
        onValueChange={(value) => {
          if (value) update({ color: value as ColorBy }, true);
        }}
      >
        <SelectTrigger aria-label="지도 색상">
          <SelectValue>
            {
              {
                cluster: "주제 색상",
                year: "발행연도",
                cited: "피인용수",
                abstract: "초록 유무",
              }[state.color]
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {Object.entries({
              cluster: "주제 색상",
              year: "발행연도",
              cited: "피인용수",
              abstract: "초록 유무",
            }).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="year-filter">
        <Field>
          <FieldLabel className="sr-only" htmlFor="year-from">
            시작 연도
          </FieldLabel>
          <Input
            id="year-from"
            type="number"
            min={lo}
            max={hi}
            value={state.from ?? lo}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value && n >= lo && n <= hi)
                update({ from: Math.min(n, state.to ?? hi) }, true);
            }}
          />
        </Field>
        <Slider
          thumbLabels={["시작 연도 범위", "종료 연도 범위"]}
          min={lo}
          max={Math.max(lo + 1, hi)}
          value={[state.from ?? lo, state.to ?? hi]}
          aria-label="발행연도 범위"
          onValueChange={(value) => {
            if (Array.isArray(value))
              update({ from: value[0], to: value[1] }, true);
          }}
        />
        <Field>
          <FieldLabel className="sr-only" htmlFor="year-to">
            종료 연도
          </FieldLabel>
          <Input
            id="year-to"
            type="number"
            min={lo}
            max={hi}
            value={state.to ?? hi}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value && n >= lo && n <= hi)
                update({ to: Math.max(n, state.from ?? lo) }, true);
            }}
          />
        </Field>
      </div>
      <span id="search-hint" className="filter-result" role="status">
        {draft.trim().length === 1
          ? "두 글자 이상 입력"
          : a.matches.isFetching
            ? "검색 중…"
            : `${a.matches.data?.total.toLocaleString() ?? "—"}편`}
      </span>
      {(state.from !== undefined ||
        state.to !== undefined ||
        state.cluster !== undefined ||
        state.node !== undefined) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            update(
              {
                from: undefined,
                to: undefined,
                cluster: undefined,
                node: undefined,
              },
              true,
            )
          }
        >
          필터 초기화
        </Button>
      )}
    </div>
  );
}
