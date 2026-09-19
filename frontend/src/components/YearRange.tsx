import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { useQuery } from "@tanstack/react-query";
import { fetchEdges } from "../api";
import { clusterColor } from "../views/map/regions";
import { citationIndex, linksOf } from "../views/map/edges";
import { descendants } from "../views/map/labels";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
// 발행연도 범위. 스테이지 아래쪽에 가로로 꽉 차게 얹힌다(모든 뷰에 적용되는 필터라 뷰
// 밖, 스테이지 안). 축은 비례 축이다: 해마다 폭이 그 해 논문 수의 비율(최소 2px)이라
// 논문이 몰린 시대가 넓고 빈 시대는 몇 픽셀로 지나간다. 눈금자 모양이다 — 해마다 눈금,
// 칸이 넓은 해는 라벨, 좁은 시대는 10년마다 라벨. 범위 안의 선은 밝다.
// - 손잡이 끌기, 가운데 구간 끌기(폭 유지 이동), 트랙 클릭(가까운 손잡이 이동),
//   더블클릭(전체 범위), 키보드 ←→ 1년·Shift 10년·Home/End.
// - 손잡이 위 연도 라벨을 클릭하면 직접 입력.
// - 표식: 중요한 논문의 발행연도 자리에 큰 눈금. 아무것도 선택하지 않았으면 피인용
//   상위 60편(해마다 최대 3편, 주제마다 최소 1편)을 주제 색으로; 영역을 선택하면 그
//   영역 안의 상위 60편; 논문을 선택하면 그 논문이 인용한(파랑)·그 논문을 인용한(빨강)
//   논문. 높이는 피인용수(log)에 비례. 같은 해에 여럿이면 칸 안에 고르게 나눈다.
//   호버하면 제목, 클릭하면 그 논문을 선택. 범위 밖이면 옅다.
// - 돋보기: 트랙 위에 마우스가 있으면 그 자리를 중심으로 반지름 R 안이 어안(fisheye)
//   렌즈처럼 늘어나(Sarkar–Brown 1차원 식, 중심 배율 d+1, 가장자리에서 1/(d+1)로 압축,
//   렌즈 밖은 그대로) 좁은 시대의 눈금·표식이 벌어진다. 끄는 동안은 끈다.
// - 재생: 창을 초당 1년씩 앞으로 민다. 범위가 전체면 처음 5년 창으로 시작한다. 끝에
//   닿거나 손잡이를 잡으면 멈춘다. 선택 노드의 인용선도 그 시점까지만 그려진다.
// 범위가 전체와 같으면 URL에서 from·to를 뺀다. 끄는 동안의 갱신은 프레임마다 한 번.
const MIN_CELL_PX = 2,
  MARKER_MAX = 60,
  MARKER_PER_YEAR = 3,
  MARKER_MIN_H = 6,
  MARKER_MAX_H = 14,
  FISHEYE_D = 8,
  FISHEYE_R = 180,
  MARKER_GAP = 3,
  LINK_OUT = "rgb(57 135 229)",
  LINK_IN = "rgb(230 103 103)",
  LABEL_MIN_PX = 24,
  PLAY_WINDOW = 5,
  PLAY_MS = 1000;
export function YearRange() {
  const a = useAnalysis(),
    { state, update } = useExploration();
  const map = a.map.data;
  // 연도 범위와 해마다 논문 수. 연도가 없는 논문은 세지 않는다(필터도 그대로 통과시킨다).
  const { lo, hi, counts } = useMemo(() => {
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
    const counts = new Array<number>(hi - lo + 1).fill(0);
    for (const y of years) if (y !== null) counts[y - lo]++;
    return { lo, hi, counts };
  }, [map]);
  // 인용 관계(논문 선택 때 표식이 된다). MapView와 같은 키라 한 번만 받는다.
  const edgeQuery = useQuery({
    queryKey: ["edges", map?.run_id],
    queryFn: ({ signal }) => fetchEdges(map!.run_id, signal),
    enabled: !!map,
  });
  const index = useMemo(() => {
    const e = edgeQuery.data;
    return e && map && e.n === map.n
      ? citationIndex(map.n, e.citing, e.cited)
      : null;
  }, [edgeQuery.data, map]);
  const tree = a.tree.data;
  // 표식. 맥락(선택 없음·영역·논문)에 따라 후보를 고르고 점수(log 피인용) 순으로 자른다.
  const markers = useMemo(() => {
    if (!map) return [];
    const labels = new Map(
      (a.clusters.data ?? []).map((c) => [c.cluster_id, c.label]),
    );
    const selected = state.selected ? map.id.indexOf(state.selected) : -1;
    const score = (i: number) => Math.log1p(map.cited[i]);
    type Pick = { i: number; color: string; kind: string };
    let picks: Pick[] = [];
    if (selected >= 0 && index) {
      // 선택한 논문의 참조(파랑)·피인용(빨강). 많으면 점수 순으로 자른다.
      picks = linksOf(index, selected)
        .filter((l) => map.year[l.j] !== null)
        .map((l) => ({
          i: l.j,
          color: l.incoming ? LINK_IN : LINK_OUT,
          kind: l.incoming ? "이 논문을 인용" : "이 논문이 참조",
        }))
        .sort((p, q) => score(q.i) - score(p.i))
        .slice(0, MARKER_MAX);
    } else {
      const region =
        state.node !== undefined && tree
          ? descendants(tree, state.node)
          : state.cluster !== undefined
            ? new Set([state.cluster])
            : null;
      const pool: number[] = [];
      for (let i = 0; i < map.n; i++)
        if (
          map.year[i] !== null &&
          map.cluster[i] >= 0 &&
          (!region || region.has(map.cluster[i]))
        )
          pool.push(i);
      pool.sort((p, q) => score(q) - score(p));
      // 상위 N, 해마다 최대 k. 그 뒤 빠진 주제는 그 주제의 1위를 더한다.
      const perYear = new Map<number, number>(),
        chosen = new Set<number>();
      for (const i of pool) {
        if (chosen.size >= MARKER_MAX) break;
        const y = map.year[i]!,
          n = perYear.get(y) ?? 0;
        if (n >= MARKER_PER_YEAR) continue;
        perYear.set(y, n + 1);
        chosen.add(i);
      }
      const covered = new Set([...chosen].map((i) => map.cluster[i]));
      for (const i of pool) {
        const c = map.cluster[i];
        if (covered.has(c)) continue;
        covered.add(c);
        chosen.add(i);
      }
      picks = [...chosen].map((i) => ({
        i,
        color: `rgb(${clusterColor(map.cluster[i]).join(" ")})`,
        kind: labels.get(map.cluster[i]) ?? `주제 ${map.cluster[i]}`,
      }));
    }
    const scores = picks.map((p) => score(p.i)),
      sMin = Math.min(...scores),
      sMax = Math.max(...scores);
    return picks
      .map((p) => ({
        ...p,
        id: map.id[p.i],
        year: map.year[p.i]!,
        title: map.title[p.i],
        cited: map.cited[p.i],
        height:
          MARKER_MIN_H +
          (MARKER_MAX_H - MARKER_MIN_H) *
            (sMax > sMin ? (score(p.i) - sMin) / (sMax - sMin) : 1),
      }))
      .sort((p, q) => p.year - q.year || q.cited - p.cited);
  }, [
    map,
    a.clusters.data,
    tree,
    index,
    state.selected,
    state.node,
    state.cluster,
  ]);
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
  // 돋보기 초점(트랙 안 x). 끄는 동안은 없다.
  const [focus, setFocus] = useState<number | null>(null);
  // 렌즈 변환과 역변환. 초점 a에서 |x−a| = t·R (0 ≤ t ≤ 1)이면
  // t' = (d+1)·t / (d·t + 1). t=1에서 t'=1이라 렌즈 가장자리는 이어진다.
  // 렌즈 반지름은 트랙 끝을 넘지 않게 좌우 따로 줄인다 — 끝의 손잡이·라벨이 밀려나지 않는다.
  const lensR = (dx: number) =>
    Math.max(1, Math.min(FISHEYE_R, dx < 0 ? focus! : width - focus!));
  const warp = (x: number) => {
    if (focus === null) return x;
    const dx = x - focus,
      R = lensR(dx),
      t = Math.abs(dx) / R;
    if (t >= 1 || t === 0) return x;
    const tw = ((FISHEYE_D + 1) * t) / (FISHEYE_D * t + 1);
    return focus + Math.sign(dx) * tw * R;
  };
  const unwarp = (x: number) => {
    if (focus === null) return x;
    const dx = x - focus,
      R = lensR(dx),
      tw = Math.abs(dx) / R;
    if (tw >= 1 || tw === 0) return x;
    // t' = (d+1)t/(dt+1)  ⇒  t = t' / (d+1 − d·t')
    const t = tw / (FISHEYE_D + 1 - FISHEYE_D * tw);
    return focus + Math.sign(dx) * t * R;
  };
  const vx = (y: number) => warp(xOf(y));
  const cellWidth = (y: number) => vx(y + 1) - vx(y);
  // 같은 해의 표식은 칸 안에 고르게 나눈다(돋보기 뒤 좌표). 표식은 수십 개라 매 렌더
  // 계산해도 싸다.
  const markerX = (() => {
    const byYear = new Map<number, number[]>();
    markers.forEach((m, k) => {
      const list = byYear.get(m.year) ?? [];
      list.push(k);
      byYear.set(m.year, list);
    });
    const xs = new Array<number>(markers.length);
    for (const [y, ks] of byYear) {
      const x0 = vx(y),
        w = cellWidth(y);
      ks.forEach((k, j) => {
        xs[k] = x0 + ((j + 0.5) / ks.length) * w;
      });
    }
    // 그래도 3px 안이면 오른쪽으로 민다(돋보기 안에서는 벌어져 밀림이 줄어든다).
    const order = xs.map((x, k) => [x, k] as const).sort((p, q) => p[0] - q[0]);
    let prev = -Infinity;
    for (const [x, k] of order) {
      xs[k] = Math.max(x, prev + MARKER_GAP);
      prev = xs[k];
    }
    return xs;
  })();
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
    setFocus(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) {
      // 끌지 않는 동안은 돋보기 초점만 따라간다.
      if (!d && e.pointerType === "mouse")
        setFocus(e.clientX - track.current!.getBoundingClientRect().left);
      return;
    }
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
    const x = unwarp(e.clientX - track.current!.getBoundingClientRect().left),
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
  // 눈금: 해마다 하나(칸의 왼쪽 가장자리, 2px보다 촘촘하면 생략). 라벨은 칸이 넓은
  // 해(24px 이상)는 해마다, 좁은 시대는 10년마다, 앞 라벨과 겹치면 건너뛴다.
  const ticks: { y: number; x: number; label: boolean }[] = [];
  let lastLabelRight = -Infinity,
    lastTickX = -Infinity;
  for (let y = lo; y <= hi + 1; y++) {
    const x = vx(y),
      wide = y <= hi && cellWidth(y) >= LABEL_MIN_PX,
      decade = y % 10 === 0;
    if (x - lastTickX < 3 && !decade) continue;
    lastTickX = x;
    const half = 14;
    const label = (wide || decade) && x - half > lastLabelRight;
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
        data-focus={focus !== null || undefined}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setFocus(null)}
      >
        <div className="year-line" aria-hidden="true" />
        <div
          className="year-line-in"
          aria-hidden="true"
          style={{ left: vx(from), width: vx(to + 1) - vx(from) }}
        />
        {/* 가운데 구간: 폭을 유지한 채 이동. */}
        {to > from && (
          <div
            className="year-window"
            style={{ left: vx(from), width: vx(to + 1) - vx(from) }}
            onPointerDown={(e) => startDrag(e, "window")}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        )}
        {/* 주제 표식: 피인용 1위 논문의 연도. */}
        <div className="year-markers" aria-label="주제별 대표 논문">
          {markers.map((m, k) => (
            <Tooltip key={m.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="year-marker"
                    data-in={(m.year >= from && m.year <= to) || undefined}
                    data-selected={state.selected === m.id || undefined}
                    aria-label={`${m.kind}: ${m.title} (${m.year})`}
                    style={{
                      left: markerX[k],
                      height: m.height,
                      background: m.color,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      update({
                        selected: m.id,
                        cluster: undefined,
                        node: undefined,
                      });
                    }}
                  />
                }
              />
              <TooltipContent className="year-marker-tip">
                <span className="year-marker-title">{m.title}</span>
                <span className="year-marker-meta" style={{ color: m.color }}>
                  {m.kind} · {m.year} · 피인용 {m.cited.toLocaleString()}
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
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
              style={{ left: kind === "from" ? vx(y) : vx(y + 1) }}
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
