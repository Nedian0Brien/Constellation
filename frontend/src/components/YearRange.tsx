import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { setPlayhead, usePlayhead } from "../hooks/use-playhead";
import { useQuery } from "@tanstack/react-query";
import { fetchEdges } from "../api";
import { clusterColor } from "../views/map/regions";
import { citationIndex, linksOf } from "../views/map/edges";
import { descendants } from "../views/map/labels";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
// 발행연도 범위. 스테이지 아래쪽에 가로로 꽉 차게 얹힌다(모든 뷰에 적용되는 필터라 뷰
// 밖, 스테이지 안). 축은 비례 축이다: 해마다 폭이 그 해 논문 수의 비율(최소 2px)이라
// 논문이 몰린 시대가 넓고 빈 시대는 몇 픽셀로 지나간다. 눈금자 모양이다 — 해마다 눈금,
// 칸이 넓은 해는 라벨, 좁은 시대는 10년마다 라벨. 범위 안의 선은 밝다.
// - 손잡이 끌기, 가운데 구간 끌기(폭 유지 이동), 트랙 클릭(가까운 손잡이 이동),
//   더블클릭(전체 범위), 키보드 ←→ 1년·Shift 10년·Home/End.
// - 손잡이 위 연도 라벨을 클릭하면 직접 입력.
// - 표식: 중요한 논문의 발행연도 자리에 큰 눈금. 주제마다 피인용 상위 3편 ∪ 연도마다
//   피인용 상위 3편 — 논문이 있는 해는 반드시 표식이 있고, 주제마다 고전이 남는다.
//   영역을 선택하면 그 영역 안에서 같은 규칙, 논문을 선택하면 그 논문이 참조한(파랑)·
//   인용한(빨강) 논문. 높이는 피인용수(log)에 비례. 축에서 6px 안에 붙는 표식은 묶음
//   표식(전경색, 개수 배지) 하나로 접힌다 — 호버하면 기간·편수, 클릭하면 목록 팝오버.
//   낱개 표식은 호버하면 제목, 클릭하면 그 논문을 선택. 범위 밖이면 옅다.
// - 재생: 두 손잡이 사이를 동영상 재생 헤드처럼 빨간 세로선이 연속으로 지난다(rAF). 속도는
//   축 위 픽셀로 일정해(전체 축이 20초) 논문이 몰린 해는 오래, 빈 시대는 순식간에 지나고
//   지도의 점은 일정한 속도로 는다. 선 위에 지나는 해가 붙고, 지도는 [from, 그 해]의 논문을 보인다 — 헤드의
//   해는 URL이 아니라 `use-playhead` 스토어에 있고 한 해를 넘을 때만 쓴다. `to` 손잡이에
//   닿으면 멈추고 헤드가 사라진다. 일시정지하면 헤드가 남고 다시 누르면 이어 간다. 손잡이를
//   잡거나 범위를 바꾸면 헤드가 사라진다. 선택 노드의 인용선도 헤드의 해까지만 그려진다.
// 범위가 전체와 같으면 URL에서 from·to를 뺀다. 끄는 동안의 갱신은 프레임마다 한 번.
const MIN_CELL_PX = 2,
  MARKER_MAX = 60,
  MARKER_PER_YEAR = 3,
  MARKER_PER_TOPIC = 3,
  MARKER_MIN_H = 6,
  MARKER_MAX_H = 14,
  MARKER_SPACING = 4,
  GROUP_SPAN = 24,
  LINK_OUT = "rgb(57 135 229)",
  LINK_IN = "rgb(230 103 103)",
  LABEL_MIN_PX = 24,
  PLAY_FULL_MS = 20000;
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
      // 주제마다 상위 3편 ∪ 연도마다 상위 3편.
      const perTopic = new Map<number, number>(),
        perYear = new Map<number, number>(),
        chosen = new Set<number>();
      for (const i of pool) {
        const c = map.cluster[i],
          y = map.year[i]!,
          nc = perTopic.get(c) ?? 0,
          ny = perYear.get(y) ?? 0;
        if (nc >= MARKER_PER_TOPIC && ny >= MARKER_PER_YEAR) continue;
        perTopic.set(c, nc + 1);
        perYear.set(y, ny + 1);
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
  const cellWidth = (y: number) => xOf(y + 1) - xOf(y);
  // 같은 해의 표식은 칸 안에 고르게 나눈다. 칸이 표식 수 × 4px보다 좁아 다 못 놓는 해는
  // 그 해 전체가 묶음이 되고, 이웃한 묶음은 첫 묶음에서 24px 안이면 하나로 합친다(칸이
  // 넓은 최근 시대는 낱개로 남는다). 표식은 수백 개 이하라 매 렌더 계산해도 싸다.
  type Group = { x: number; items: number[]; y0: number; y1: number };
  const groups: Group[] = (() => {
    const byYear = new Map<number, number[]>();
    markers.forEach((m, k) => {
      const list = byYear.get(m.year) ?? [];
      list.push(k);
      byYear.set(m.year, list);
    });
    const out: Group[] = [];
    let open: Group | null = null,
      openStart = 0;
    for (const y of [...byYear.keys()].sort((p, q) => p - q)) {
      const ks = byYear.get(y)!,
        x0 = xOf(y),
        w = cellWidth(y);
      if (w >= ks.length * MARKER_SPACING) {
        open = null;
        ks.forEach((k, j) =>
          out.push({
            x: x0 + ((j + 0.5) / ks.length) * w,
            items: [k],
            y0: y,
            y1: y,
          }),
        );
        continue;
      }
      const cx = x0 + w / 2;
      if (open && cx - openStart < GROUP_SPAN) {
        open.items.push(...ks);
        open.y1 = y;
        open.x = (openStart + cx) / 2;
      } else {
        open = { x: cx, items: [...ks], y0: y, y1: y };
        openStart = cx;
        out.push(open);
      }
    }
    return out;
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
  const select = useCallback(
    (id: string) =>
      update({ selected: id, cluster: undefined, node: undefined }),
    [update],
  );
  // 재생 헤드. 소수 연도 `head`는 ref(프레임마다 바뀐다), 지나는 해(정수)는 스토어,
  // 도는 중인지는 state. 헤드가 보이는 조건은 스토어에 해가 있는 것(재생·일시정지).
  const [playing, setPlaying] = useState(false);
  const headYear = usePlayhead();
  const head = useRef(0);
  const live = useRef({ from, to, edges, lo });
  useLayoutEffect(() => {
    live.current = { from, to, edges, lo };
  }, [from, to, edges, lo]);
  const headEl = useRef<HTMLDivElement>(null);
  // 소수 연도 ↔ x. `yearAtX`와 같은 계산이지만 ref의 최신 축을 읽어 rAF 루프에서 쓴다.
  const xAt = useCallback((y: number) => {
    const { edges, lo } = live.current,
      k = Math.min(Math.max(Math.floor(y) - lo, 0), edges.length - 2);
    return edges[k] + (y - lo - k) * (edges[k + 1] - edges[k]);
  }, []);
  const yearAtPx = useCallback((x: number) => {
    const { edges, lo } = live.current;
    let k = 0;
    while (k < edges.length - 2 && edges[k + 1] <= x) k++;
    return lo + k + (x - edges[k]) / Math.max(1e-6, edges[k + 1] - edges[k]);
  }, []);
  // 헤드의 폭을 그린다(라벨은 정수 연도라 스토어가 바뀔 때 React가 그린다).
  const drawHead = useCallback(() => {
    const el = headEl.current;
    if (!el) return;
    el.style.width = `${Math.max(0, xAt(head.current) - xAt(live.current.from))}px`;
  }, [xAt]);
  const stopPlay = useCallback(() => {
    setPlaying(false);
    setPlayhead(undefined);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let id = 0,
      last = performance.now();
    const tick = (now: number) => {
      const { from, to, edges } = live.current;
      // 축 위 픽셀로 일정한 속도: 전체 축 폭을 PLAY_FULL_MS에 건넌다.
      const track = edges[edges.length - 1];
      if (track > 0)
        head.current = Math.min(
          to + 1,
          yearAtPx(xAt(head.current) + ((now - last) * track) / PLAY_FULL_MS),
        );
      last = now;
      drawHead();
      if (head.current >= to + 1) {
        stopPlay();
        return;
      }
      // `head < to + 1`이라 `floor(head) ≤ to`. 소수 값은 지도의 점이 서서히 나타나는 데 쓴다.
      setPlayhead(Math.max(from, head.current));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, stopPlay, drawHead, xAt, yearAtPx]);
  // 처음 그릴 때와 트랙 폭이 바뀔 때 헤드 자리를 맞춘다.
  useLayoutEffect(drawHead);
  // 범위가 바뀌면(손잡이·URL·run) 헤드는 의미를 잃는다. 사라질 때도 스토어를 비운다.
  const hasHead = useRef(false);
  useLayoutEffect(() => {
    hasHead.current = headYear !== undefined;
  }, [headYear]);
  useEffect(() => {
    if (hasHead.current) stopPlay();
  }, [from, to, lo, hi, stopPlay]);
  useEffect(() => () => setPlayhead(undefined), []);
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (headYear === undefined) {
      head.current = from;
      setPlayhead(from);
    }
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
    stopPlay();
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
    stopPlay();
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
  // 눈금: 해마다 하나(칸의 왼쪽 가장자리, 2px보다 촘촘하면 생략). 라벨은 칸이 넓은
  // 해(24px 이상)는 해마다, 좁은 시대는 10년마다, 앞 라벨과 겹치면 건너뛴다.
  const ticks: { y: number; x: number; label: boolean }[] = [];
  let lastLabelRight = -Infinity,
    lastTickX = -Infinity;
  for (let y = lo; y <= hi + 1; y++) {
    const x = xOf(y),
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
      data-head={headYear}
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
          stopPlay();
          commit(lo, hi);
        }}
        className="year-track"
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="year-line" aria-hidden="true" />
        <div
          className="year-line-in"
          aria-hidden="true"
          style={{ left: xOf(from), width: xOf(to + 1) - xOf(from) }}
        />
        {/* 재생 헤드: from에서 지나는 자리까지 빨간 채움, 오른쪽 끝이 세로선. 폭은
            프레임마다 ref로 쓴다(React가 쓰지 않는다). */}
        {headYear !== undefined && (
          <div
            ref={headEl}
            className="year-playhead"
            aria-hidden="true"
            style={{ left: xOf(from) }}
          >
            <span className="year-playhead-year">{headYear}</span>
          </div>
        )}
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
        {/* 주제 표식: 피인용 1위 논문의 연도. */}
        <div className="year-markers" aria-label="대표 논문">
          {groups.map((g) =>
            g.items.length === 1 ? (
              <SingleMarker
                key={markers[g.items[0]].id}
                m={markers[g.items[0]]}
                x={g.x}
                inRange={
                  markers[g.items[0]].year >= from &&
                  markers[g.items[0]].year <= to
                }
                selected={state.selected === markers[g.items[0]].id}
                onSelect={select}
              />
            ) : (
              <GroupMarker
                key={`${g.y0}-${g.y1}-${g.items[0]}`}
                group={g}
                items={g.items.map((k) => markers[k])}
                x={g.x}
                inRange={g.y1 >= from && g.y0 <= to}
                onSelect={select}
              />
            ),
          )}
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
interface Marker {
  i: number;
  id: string;
  year: number;
  title: string;
  cited: number;
  color: string;
  kind: string;
  height: number;
}
// 낱개 표식. 호버하면 제목, 클릭하면 선택.
function SingleMarker({
  m,
  x,
  inRange,
  selected,
  onSelect,
}: {
  m: Marker;
  x: number;
  inRange: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="year-marker"
            data-in={inRange || undefined}
            data-selected={selected || undefined}
            aria-label={`${m.kind}: ${m.title} (${m.year})`}
            style={{ left: x, height: m.height, background: m.color }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m.id);
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
  );
}
// 묶음 표식. 호버하면 기간·편수, 클릭하면 목록 팝오버(점수순). 항목을 고르면 선택.
function GroupMarker({
  group,
  items,
  x,
  inRange,
  onSelect,
}: {
  group: { y0: number; y1: number };
  items: Marker[];
  x: number;
  inRange: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const span =
    group.y0 === group.y1 ? `${group.y0}` : `${group.y0}–${group.y1}`;
  const sorted = [...items].sort((p, q) => q.cited - p.cited);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="year-marker year-marker-group"
                  data-in={inRange || undefined}
                  data-open={open || undefined}
                  aria-label={`${span} 대표 논문 ${items.length}편`}
                  style={{ left: x }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="year-marker-count">{items.length}</span>
                </button>
              }
            />
          }
        />
        <TooltipContent className="year-marker-tip">
          <span className="year-marker-meta">
            {span} · {items.length}편
          </span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        sideOffset={8}
        className="year-group-pop"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <span className="year-marker-meta">
          {span} · {items.length}편 · 피인용순
        </span>
        <ul className="year-group-list">
          {sorted.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="year-group-item"
                onClick={() => {
                  setOpen(false);
                  onSelect(m.id);
                }}
              >
                <i style={{ background: m.color }} />
                <span className="year-group-title">{m.title}</span>
                <span className="year-group-meta">
                  {m.year} · {m.cited.toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
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
