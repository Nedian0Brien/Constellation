import { useEffect, useState } from "react";
import { Palette, Search, X } from "lucide-react";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "./ui/input-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "./ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { ColorBy } from "../app/navigation";
// 스테이지 위쪽 가운데에 뜨는 검색 pill과 그 오른쪽의 컨트롤 버블(색상·건수·필터 초기화).
// 모든 뷰에서 같은 자리다. 빈 곳은 포인터를 통과시켜 지도를 끌 수 있다.
export function StageSearch() {
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
  return (
    <div className="stage-search">
      <Field className="search-pill" data-invalid={draft.trim().length === 1}>
        <FieldLabel className="sr-only" htmlFor="paper-search">
          논문 검색
        </FieldLabel>
        {/* 애드온은 초점 관리 때문에 입력 뒤에 두고 align으로 자리를 정한다. */}
        <InputGroup>
          <InputGroupInput
            id="paper-search"
            value={draft}
            placeholder="논문 제목·초록 검색"
            aria-invalid={draft.trim().length === 1}
            aria-describedby="search-hint"
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onChange={(e) => setDraft(e.target.value)}
          />
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          {draft && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="검색 지우기"
                onClick={() => {
                  setDraft("");
                  update({ q: "" }, true);
                }}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </Field>
      <div className="search-bubble">
        <Select
          value={state.color}
          onValueChange={(value) => {
            if (value) update({ color: value as ColorBy }, true);
          }}
        >
          <SelectTrigger aria-label="지도 색상">
            <Palette aria-hidden="true" />
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
        <span id="search-hint" className="filter-result" role="status">
          {draft.trim().length === 1
            ? "두 글자 이상 입력"
            : a.matches.isFetching
              ? "검색 중…"
              : `${a.count?.toLocaleString() ?? "—"}편`}
        </span>
        {(state.from !== undefined ||
          state.to !== undefined ||
          state.cluster !== undefined ||
          state.node !== undefined) && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="필터 초기화"
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
                  <X />
                </Button>
              }
            />
            <TooltipContent>필터 초기화</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
