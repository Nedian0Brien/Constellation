import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { descendants } from "../views/map/labels";
// 발행연도 범위. 스테이지 아래쪽에 가로로 꽉 차게 얹힌다(모든 뷰에 적용되는 필터라 뷰
// 밖, 스테이지 안). 해마다 논문 수 히스토그램 위에 두 손잡이로 범위를 잡는다.
// - 막대: 전체(옅게), 범위 안(밝게), 선택한 영역(주제·분야)의 논문(주황).
// - 손잡이 끌기, 가운데 구간 끌기(폭 유지 이동), 트랙 클릭(가까운 손잡이 이동),
//   더블클릭(전체 범위), 키보드 ←→ 1년·Shift 10년·Home/End.
// - 손잡이 위 연도 라벨을 클릭하면 직접 입력.
// 범위가 전체와 같으면 URL에서 from·to를 뺀다. 끄는 동안의 갱신은 프레임마다 한 번.
const BAR_MAX = 22,
  ACCENT = "var(--warn)";
export function YearRange() {
  const a = useAnalysis(),
    { state, update } = useExploration();
  const map = a.map.data,
    tree = a.tree.data;
  // 연도 범위와 해마다 논문 수. 연도가 없는 논문은 세지 않는다(필터도 그대로 통과시킨다).
  const { lo, hi, counts, regionCounts } = useMemo(() => {
    const years = map?.year ?? [];
    let lo = Infinity,
      hi = -Infinity;
    for (const y of years)
      if (y !== null) {
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    if (!Number.isFinite(lo)) {
      lo = 1945;
      hi = 2026;
    }
    const counts = new Array<number>(hi - lo + 1).fill(0),
      regionCounts = new Array<number>(hi - lo + 1).fill(0);
    const region =
      state.node !== undefined && tree
        ? descendants(tree, state.node)
        : state.cluster !== undefined
          ? new Set([state.cluster])
          : null;
    years.forEach((y, i) => {
      if (y === null) return;
      counts[y - lo]++;
      if (region && map && region.has(map.cluster[i])) regionCounts[y - lo]++;
    });
    return { lo, hi, counts, regionCounts };
  }, [map, state.node, state.cluster, tree]);
  const span = Math.max(1, hi - lo);
  const from = Math.min(Math.max(state.from ?? lo, lo), hi),
    to = Math.min(Math.max(state.to ?? hi, lo), hi);
  const peak = Math.max(1, ...counts);
  const track = useRef<HTMLDivElement>(null);
  // 범위 갱신. 전체 범위면 URL에서 뺀다. 끄는 동안은 프레임마다 한 번만 보낸다.
  const pending = useRef<{ from: number; to: number } | null>(null),
    frame = useRef(0);
  const commit = useCallback(
    (f: number, t: number) => {
      const nf = Math.round(Math.min(Math.max(f, lo), hi)),
        nt = Math.round(Math.min(Math.max(t, lo), hi));
      pending.current = { from: Math.min(nf, nt), to: Math.max(nf, nt) };
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const p = pending.current;
        if (!p) return;
        update(
          {
            from: p.from <= lo ? undefined : p.from,
            to: p.to >= hi ? undefined : p.to,
          },
          true,
        );
      });
    },
    [lo, hi, update],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const yearAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return lo + ((clientX - r.left) / r.width) * span;
  };
  const pct = (y: number) => ((y - lo) / span) * 100;
  // 끌기: 손잡이 하나, 또는 가운데 구간(폭 유지).
  const drag = useRef<{
    id: number;
    kind: "from" | "to" | "window";
    x0: number;
    from: number;
    to: number;
  } | null>(null);
  const [dragging, setDragging] = useState<"from" | "to" | "window" | null>(
    null,
  );
  const startDrag = (e: React.PointerEvent, kind: "from" | "to" | "window") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, kind, x0: e.clientX, from, to };
    setDragging(kind);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.kind === "window") {
      const r = track.current!.getBoundingClientRect(),
        dy = Math.round(((e.clientX - d.x0) / r.width) * span),
        width = d.to - d.from,
        f = Math.min(Math.max(d.from + dy, lo), hi - width);
      commit(f, f + width);
    } else {
      const y = yearAt(e.clientX);
      if (d.kind === "from") commit(Math.min(y, d.to), d.to);
      else commit(d.from, Math.max(y, d.from));
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(null);
  };
  // 트랙의 빈 곳을 누르면 가까운 손잡이가 그리로 온다.
  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const y = yearAt(e.clientX);
    if (Math.abs(y - from) <= Math.abs(y - to)) commit(y, to);
    else commit(from, y);
  };
  const onKey = (e: React.KeyboardEvent, kind: "from" | "to") => {
    const step = e.shiftKey ? 10 : 1;
    const back = e.key === "ArrowLeft" || e.key === "ArrowDown",
      forward = e.key === "ArrowRight" || e.key === "ArrowUp";
    let f = from,
      t = to;
    if (kind === "from") {
      if (back) f -= step;
      else if (forward) f = Math.min(to, f + step);
      else if (e.key === "Home") f = lo;
      else if (e.key === "End") f = to;
      else return;
    } else {
      if (back) t = Math.max(from, t - step);
      else if (forward) t += step;
      else if (e.key === "Home") t = from;
      else if (e.key === "End") t = hi;
      else return;
    }
    e.preventDefault();
    commit(f, t);
  };
  // 10년마다 라벨 눈금, 5년마다 작은 눈금.
  const ticks: { y: number; major: boolean }[] = [];
  for (let y = Math.ceil(lo / 5) * 5; y <= hi; y += 5)
    ticks.push({ y, major: y % 10 === 0 });
  return (
    <div
      className="year-range"
      role="group"
      aria-label="발행연도 범위"
      data-testid="year-range"
      data-from={from}
      data-to={to}
      data-dragging={dragging ?? undefined}
      onDoubleClick={() => commit(lo, hi)}
    >
      <div
        ref={track}
        className="year-track"
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* 히스토그램. 범위 밖은 옅게, 범위 안은 밝게, 선택 영역은 주황으로 겹친다. */}
        <div className="year-bars" aria-hidden="true">
          {counts.map((n, k) => {
            const y = lo + k,
              inRange = y >= from && y <= to;
            return (
              <div
                key={y}
                className="year-bar"
                data-in={inRange || undefined}
                style={{
                  left: `${pct(y)}%`,
                  width: `${100 / (span + 1)}%`,
                  height: (BAR_MAX * n) / peak,
                }}
              >
                {regionCounts[k] > 0 && (
                  <i
                    style={{
                      height: (BAR_MAX * regionCounts[k]) / peak,
                      background: ACCENT,
                      opacity: inRange ? 1 : 0.35,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="year-line" aria-hidden="true" />
        <div
          className="year-line-in"
          aria-hidden="true"
          style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }}
        />
        {/* 가운데 구간: 폭을 유지한 채 이동. */}
        {to > from && (
          <div
            className="year-window"
            style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }}
            onPointerDown={(e) => startDrag(e, "window")}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        )}
        {(["from", "to"] as const).map((kind) => {
          const y = kind === "from" ? from : to;
          return (
            <div
              key={kind}
              className="year-thumb"
              data-kind={kind}
              role="slider"
              tabIndex={0}
              aria-label={kind === "from" ? "시작 연도" : "종료 연도"}
              aria-valuemin={kind === "from" ? lo : from}
              aria-valuemax={kind === "from" ? to : hi}
              aria-valuenow={y}
              style={{ left: `${pct(y)}%` }}
              onPointerDown={(e) => startDrag(e, kind)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(e) => onKey(e, kind)}
            >
              <YearLabel
                value={y}
                lo={kind === "from" ? lo : from}
                hi={kind === "from" ? to : hi}
                onChange={(v) =>
                  kind === "from" ? commit(v, to) : commit(from, v)
                }
              />
            </div>
          );
        })}
        <div className="year-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <div
              key={t.y}
              className="year-tick"
              data-major={t.major || undefined}
              style={{ left: `${pct(t.y)}%` }}
            >
              {t.major && <span>{t.y}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// 손잡이 위의 연도. 클릭하면 입력 상자가 되고 Enter·포커스 이탈로 확정, Escape로 취소.
function YearLabel({
  value,
  lo,
  hi,
  onChange,
}: {
  value: number;
  lo: number;
  hi: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  const done = (save: boolean) => {
    setEditing(false);
    const n = Number(draft);
    if (save && draft && Number.isFinite(n))
      onChange(Math.min(Math.max(Math.round(n), lo), hi));
  };
  if (!editing)
    return (
      <button
        type="button"
        className="year-label"
        aria-label="연도 직접 입력"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(String(value));
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  return (
    <input
      ref={input}
      className="year-label year-input"
      type="number"
      min={lo}
      max={hi}
      value={draft}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(true);
        else if (e.key === "Escape") done(false);
      }}
    />
  );
}
