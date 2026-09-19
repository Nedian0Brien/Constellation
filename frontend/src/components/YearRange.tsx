import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { descendants } from "../views/map/labels";
// 발행연도 범위. 스테이지 아래쪽에 가로로 꽉 차게 얹힌다(모든 뷰에 적용되는 필터라 뷰
// 밖, 스테이지 안). 축은 비례 축이다: 해마다 폭이 그 해 논문 수의 비율(최소 2px)이라
// 논문이 몰린 시대가 넓고 빈 시대는 몇 픽셀로 지나간다. 막대 높이는 균일하고(폭이
// 분포다), 선택한 영역(주제·분야)의 논문 지분은 각 해 칸 안의 주황 높이로 보인다.
// - 띠: 범위 밖은 옅게, 범위 안은 밝게.
// - 손잡이 끌기, 가운데 구간 끌기(폭 유지 이동), 트랙 클릭(가까운 손잡이 이동),
//   더블클릭(전체 범위), 키보드 ←→ 1년·Shift 10년·Home/End.
// - 손잡이 위 연도 라벨을 클릭하면 직접 입력.
// - 재생: 창을 초당 1년씩 앞으로 민다. 범위가 전체면 처음 5년 창으로 시작한다. 끝에
//   닿거나 손잡이를 잡으면 멈춘다. 선택 노드의 인용선도 그 시점까지만 그려진다.
// 범위가 전체와 같으면 URL에서 from·to를 뺀다. 끄는 동안의 갱신은 프레임마다 한 번.
const BAR_MAX = 22,
  MIN_CELL_PX = 2,
  LABEL_MIN_PX = 24,
  ACCENT = "var(--warn)",
  PLAY_WINDOW = 5,
  PLAY_MS = 1000;
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
  const from = Math.min(Math.max(state.from ?? lo, lo), hi),
    to = Math.min(Math.max(state.to ?? hi, lo), hi);
  const track = useRef<HTMLDivElement>(null);
  // 트랙 폭(px). 비례 축의 최소 칸 폭이 픽셀이라 실제 폭이 필요하다.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const o = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  // 비례 축: 해마다 폭 = max(2px, 폭 × 지분), 합이 트랙 폭이 되도록 다시 맞춘다.
  // `edges[k]`는 연도 lo+k 칸의 왼쪽 x, `edges[n]`은 오른쪽 끝.
  const edges = useMemo(() => {
    const total = Math.max(
      1,
      counts.reduce((a, b) => a + b, 0),
    );
    const raw = counts.map((n) => Math.max(MIN_CELL_PX, (width * n) / total));
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const out = [0];
    for (const w of raw) out.push(out[out.length - 1] + (w * width) / sum);
    return out;
  }, [counts, width]);
  const xOf = (y: number) =>
    edges[Math.min(Math.max(y - lo, 0), counts.length)];
  const cellWidth = (y: number) => edges[y - lo + 1] - edges[y - lo];
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
  // 재생. 지금 창을 1초마다 1년 민다. 끝(hi)에 닿으면 멈춘다.
  const [playing, setPlaying] = useState(false);
  const range = useRef({ from, to });
  useEffect(() => {
    range.current = { from, to };
  }, [from, to]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const { from: f, to: t } = range.current;
      if (t >= hi) {
        setPlaying(false);
        return;
      }
      commit(f + 1, t + 1);
    }, PLAY_MS);
    return () => clearInterval(t);
  }, [playing, hi, commit]);
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // 전체 범위거나 이미 끝에 있으면 처음 5년 창부터.
    if ((from <= lo && to >= hi) || to >= hi)
      commit(lo, Math.min(hi, lo + PLAY_WINDOW - 1));
    setPlaying(true);
  };
  // 트랙 안 x → 연도(칸 안의 위치를 소수로). 손잡이는 반올림해 칸 경계에 붙는다.
  const yearAtX = (x: number) => {
    if (x <= 0) return lo;
    if (x >= edges[edges.length - 1]) return hi + 1;
    let k = 0;
    while (k < counts.length - 1 && edges[k + 1] <= x) k++;
    return lo + k + (x - edges[k]) / Math.max(1e-6, edges[k + 1] - edges[k]);
  };
  const yearAt = (clientX: number) =>
    yearAtX(clientX - track.current!.getBoundingClientRect().left);
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
    setPlaying(false);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.kind === "window") {
      // 창의 왼쪽 가장자리를 픽셀만큼 옮긴 자리의 연도로. 폭(연도 수)은 그대로.
      const span = d.to - d.from,
        y = Math.floor(yearAtX(xOf(d.from) + (e.clientX - d.x0))),
        f = Math.min(Math.max(y, lo), hi - span);
      commit(f, f + span);
    } else if (d.kind === "from") {
      commit(Math.min(Math.floor(yearAt(e.clientX)), d.to), d.to);
    } else {
      commit(d.from, Math.max(Math.ceil(yearAt(e.clientX)) - 1, d.from));
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
    const x = e.clientX - track.current!.getBoundingClientRect().left,
      y = Math.floor(yearAtX(x));
    if (Math.abs(x - xOf(from)) <= Math.abs(x - xOf(to + 1))) commit(y, to);
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
  // 눈금: 칸이 넓은 해(24px 이상)는 해마다 라벨, 좁은 시대는 10년마다. 앞 라벨과 겹치면
  // 건너뛴다. 눈금 자리는 칸의 왼쪽 가장자리.
  const ticks: { y: number; x: number; label: boolean }[] = [];
  let lastLabelRight = -Infinity;
  for (let y = lo; y <= hi; y++) {
    const x = xOf(y),
      wide = cellWidth(y) >= LABEL_MIN_PX,
      candidate = wide || y % 10 === 0;
    if (!candidate) continue;
    const half = 14;
    const label = x - half > lastLabelRight;
    if (label) lastLabelRight = x + half;
    ticks.push({ y, x, label });
  }
  return (
    <div
      className="year-range"
      role="group"
      aria-label="발행연도 범위"
      data-testid="year-range"
      data-from={from}
      data-to={to}
      data-dragging={dragging ?? undefined}
      data-playing={playing || undefined}
    >
      <Button
        variant="ghost"
        size="icon"
        className="year-play"
        aria-label={playing ? "재생 멈춤" : "연도 재생"}
        aria-pressed={playing}
        onClick={togglePlay}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <div
        ref={track}
        onDoubleClick={() => {
          setPlaying(false);
          commit(lo, hi);
        }}
        className="year-track"
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* 연도 띠. 폭이 논문 수, 주황 높이가 선택 영역의 지분. 범위 밖은 옅게. */}
        <div className="year-bars" aria-hidden="true">
          {counts.map((n, k) => {
            const y = lo + k,
              inRange = y >= from && y <= to,
              w = cellWidth(y);
            return (
              <div
                key={y}
                className="year-bar"
                data-in={inRange || undefined}
                data-wide={w >= 6 || undefined}
                style={{ left: xOf(y), width: w, height: BAR_MAX }}
              >
                {n > 0 && regionCounts[k] > 0 && (
                  <i
                    style={{
                      height: (BAR_MAX * regionCounts[k]) / n,
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
          style={{ left: xOf(from), width: xOf(to + 1) - xOf(from) }}
        />
        {/* 가운데 구간: 폭을 유지한 채 이동. */}
        {to > from && (
          <div
            className="year-window"
            style={{ left: xOf(from), width: xOf(to + 1) - xOf(from) }}
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
              style={{ left: kind === "from" ? xOf(y) : xOf(y + 1) }}
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
              data-major={t.label || undefined}
              style={{ left: t.x }}
            >
              {t.label && <span>{t.y}</span>}
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
