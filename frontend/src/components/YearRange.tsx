import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";
import { Slider } from "./ui/slider";
// 발행연도 범위. 스테이지 아래쪽에 가로로 꽉 차게 얹힌다(모든 뷰에 적용되는 필터라 뷰
// 밖, 스테이지 안). 슬라이더는 두 입력 사이의 남는 폭을 다 쓴다(`.year-range` CSS).
export function YearRange() {
  const a = useAnalysis(),
    { state, update } = useExploration();
  const years = a.map.data?.year.filter((y): y is number => y !== null) ?? [];
  const lo = years.length ? Math.min(...years) : 1945,
    hi = years.length ? Math.max(...years) : 2026;
  return (
    <div
      className="year-range"
      role="group"
      aria-label="발행연도 범위"
      data-testid="year-range"
    >
      <Field className="w-16">
        <FieldLabel className="sr-only" htmlFor="year-from">
          시작 연도
        </FieldLabel>
        <Input
          id="year-from"
          type="number"
          className="text-center tabular-nums"
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
      <Field className="w-16">
        <FieldLabel className="sr-only" htmlFor="year-to">
          종료 연도
        </FieldLabel>
        <Input
          id="year-to"
          type="number"
          className="text-center tabular-nums"
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
  );
}
