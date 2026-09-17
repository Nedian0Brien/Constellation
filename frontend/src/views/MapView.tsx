import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer, BitmapLayer } from "@deck.gl/layers";
import { OrthographicView, OrthographicViewport } from "@deck.gl/core";
import type { PickingInfo } from "@deck.gl/core";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { useStore, type Camera } from "../store";
import { Button } from "../components/ui/button";
import {
  labelLevel,
  PAPER_LABEL_ZOOM,
  paperLabelOpacity,
  clampRegionLabel,
  regionRadii,
  regionLabels,
  homeCamera,
  descendants,
  visibleTitles,
} from "./map/labels";
import { clusterColor, regionTexture } from "./map/regions";
const view = new OrthographicView({ id: "research-map" });
export default function MapView() {
  const a = useAnalysis(),
    { state, update } = useExploration(),
    map = a.map.data!;
  const container = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 800, height: 600 });
  const saved = useStore((s) => s.cameras[map.run_id]),
    setCamera = useStore((s) => s.setCamera);
  const home = useMemo(
    () => homeCamera(map, size.width, size.height),
    [map, size],
  );
  const camera = saved ?? home,
    frame = useRef(0);
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<PickingInfo | null>(null);
  useEffect(() => {
    if (reduced) cancelAnimationFrame(frame.current);
  }, [reduced]);
  useEffect(() => {
    const o = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    if (container.current) o.observe(container.current);
    return () => {
      o.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, []);
  const move = useCallback(
    (next: Camera, animate = true) => {
      cancelAnimationFrame(frame.current);
      if (!animate || reduced) {
        setCamera(map.run_id, next);
        return;
      }
      const from = useStore.getState().cameras[map.run_id] ?? home,
        start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 280),
          f = 1 - (1 - t) ** 3;
        setCamera(map.run_id, {
          zoom: from.zoom + (next.zoom - from.zoom) * f,
          target: from.target.map(
            (v, i) => v + (next.target[i] - v) * f,
          ) as Camera["target"],
        });
        if (t < 1) frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    },
    [map.run_id, home, reduced, setCamera],
  );
  const viewport = useMemo(
    () => new OrthographicViewport({ ...camera, ...size }),
    [camera, size],
  );
  const lastSelected = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!state.selected || lastSelected.current === state.selected) return;
    lastSelected.current = state.selected;
    const i = map.id.indexOf(state.selected);
    if (i < 0) return;
    const [x, y] = viewport.project([map.x[i], map.y[i], 0]);
    if (x < 70 || y < 70 || x > size.width - 70 || y > size.height - 70)
      move({ ...camera, target: [map.x[i], map.y[i], 0] });
  }, [state.selected, map, viewport, move, camera, size.width, size.height]);
  const selectedIndex = map.id.indexOf(state.selected ?? "");
  const points = useMemo(
    () =>
      map.id.map((id, i) => ({
        id,
        i,
        position: [map.x[i], map.y[i], 0] as [number, number, number],
      })),
    [map],
  );
  const nodeClusters = useMemo(
    () =>
      state.node !== undefined && a.tree.data
        ? descendants(a.tree.data, state.node)
        : null,
    [a.tree.data, state.node],
  );
  const yearRank = useMemo(() => {
    const years = [
      ...new Set(map.year.filter((y): y is number => y !== null)),
    ].sort((a, b) => a - b);
    return new Map(years.map((y, i) => [y, i / Math.max(1, years.length - 1)]));
  }, [map]);
  const maxLog = Math.log1p(Math.max(1, ...map.cited));
  const colors = useMemo(
    () =>
      points.map((p) => {
        let c = clusterColor(map.cluster[p.i]);
        if (state.color === "year") {
          const v =
            map.year[p.i] === null ? null : yearRank.get(map.year[p.i]!);
          c =
            v === null
              ? [130, 131, 142]
              : [
                  100 + Math.round(140 * (v ?? 0)),
                  110 + Math.round(130 * (v ?? 0)),
                  135 + Math.round(110 * (v ?? 0)),
                ];
        }
        if (state.color === "cited") {
          const v = Math.log1p(map.cited[p.i]) / maxLog;
          c = [
            120 + Math.round(120 * v),
            110 + Math.round(85 * v),
            145 - Math.round(35 * v),
          ];
        }
        if (state.color === "abstract")
          c = map.has_abstract[p.i] ? [141, 223, 193] : [255, 161, 174];
        const hit =
          a.valid &&
          a.ids.has(p.id) &&
          (state.cluster === undefined || map.cluster[p.i] === state.cluster) &&
          (!nodeClusters || nodeClusters.has(map.cluster[p.i]));
        return (
          p.id === state.selected
            ? [255, 255, 255, 255]
            : [...c, hit ? 205 : 18]
        ) as [number, number, number, number];
      }),
    [
      points,
      map,
      state.color,
      state.selected,
      state.cluster,
      nodeClusters,
      a.ids,
      a.valid,
      yearRank,
      maxLog,
    ],
  );
  const texture = useMemo(
    () => regionTexture(map, a.clusters.data ?? []),
    [map, a.clusters.data],
  );
  const relativeZoom = camera.zoom - home.zoom;
  const level = labelLevel(relativeZoom);
  const top = useMemo(
    () => regionLabels(a.tree.data, a.clusters.data ?? [], 0),
    [a.tree.data, a.clusters.data],
  );
  const sub = useMemo(
    () => regionLabels(a.tree.data, a.clusters.data ?? [], 1),
    [a.tree.data, a.clusters.data],
  );
  const leaves = useMemo(
    () => regionLabels(a.tree.data, a.clusters.data ?? [], 2),
    [a.tree.data, a.clusters.data],
  );
  const radii = useMemo(
    () => regionRadii(map, a.tree.data, a.clusters.data ?? []),
    [map, a.tree.data, a.clusters.data],
  );
  // 영역 라벨 배치. 배율 단계마다 한 묶음만 켜진다. 중심이 화면 안이면 그 자리에,
  // 중심은 밖이지만 화면 중앙이 영역 안(반지름 이내)이면 가장자리에 붙인다.
  // 그래서 영역을 확대해 들어가도 이름이 남는다. 겹치는 라벨은 큰 영역이 이긴다.
  const regionSet = level === "field" ? top : relativeZoom < 2 ? sub : leaves;
  const shownRegions = useMemo(() => {
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const out = new Map<string, [number, number]>();
    // 문턱을 넘어도 반 단계까지는 영역 이름이 옅어지며 남는다.
    if (relativeZoom >= PAPER_LABEL_ZOOM + 0.5) return out;
    const [cx, cy] = viewport.unproject([size.width / 2, size.height / 2]);
    for (const n of [...regionSet].sort((a, b) => b.size - a.size)) {
      let [x, y] = viewport.project([n.x, n.y, 0]);
      const w = Math.min(205, n.label.length * 10),
        h = Math.ceil(n.label.length / 20) * 23;
      const inside =
        x > w / 2 &&
        x < size.width - w / 2 &&
        y > 55 + h / 2 &&
        y < size.height - 75 - h / 2;
      const covering =
        Math.hypot(cx - n.x, cy - n.y) <= (radii.get(n.id) ?? 0);
      if (!inside && !covering) continue;
      if (!inside)
        [x, y] = clampRegionLabel(x, y, w, h, size.width, size.height);
      if (
        boxes.some(
          (b) =>
            Math.abs(x - b.x) < (w + b.w) / 2 + 12 &&
            Math.abs(y - b.y) < (h + b.h) / 2 + 10,
        )
      )
        continue;
      boxes.push({ x, y, w, h });
      out.set(n.id, [x, y]);
    }
    return out;
  }, [relativeZoom, regionSet, viewport, size, radii]);
  // 논문 제목 불투명도: 확대에 따라 서서히 진해진다. 하위 분야 단계인데 화면에 영역
  // 이름이 하나도 없으면(영역 사이 빈 곳) 바로 켠다. 상위 분야 단계에서는 켜지 않는다.
  const paperOpacity =
    level === "field"
      ? 0
      : level === "topic" && shownRegions.size === 0
        ? 1
        : paperLabelOpacity(relativeZoom);
  const paperLabelsOn = paperOpacity > 0;
  // 영역 이름은 같은 곡선을 거꾸로 따라 옅어진다.
  const regionOpacity = 1 - paperLabelOpacity(relativeZoom);
  // 하위 분야 단계부터 목록을 만든다. 상위 분야 단계에서는 1만 개를 투영할 이유가 없다.
  const showTitles = level !== "field";
  const titles = useMemo(
    () =>
      showTitles
        ? visibleTitles(
            points
              .filter((p) => a.ids.has(p.id))
              .map((p) => {
                const [x, y] = viewport.project(p.position);
                return {
                  id: p.id,
                  text: map.title[p.i],
                  x,
                  y,
                  selected: p.id === state.selected,
                };
              }),
            size.width,
            size.height,
          )
        : [],
    [showTitles, points, a.ids, viewport, map, state.selected, size],
  );
  const layers = [
    ...(texture
      ? [
          new BitmapLayer({
            id: "soft-regions",
            image: texture.image,
            bounds: texture.bounds,
            opacity: state.color === "cluster" ? 0.7 : 0.2,
            pickable: false,
          }),
        ]
      : []),
    new ScatterplotLayer({
      id: "papers",
      data: points,
      getPosition: (p) => p.position,
      getFillColor: (p) => colors[p.i],
      getRadius: (p) =>
        state.color === "cited"
          ? 1.5 + (3 * Math.log1p(map.cited[p.i])) / maxLog
          : 1.5,
      radiusUnits: "pixels",
      radiusMinPixels: 1.3,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 255],
      updateTriggers: { getFillColor: [colors], getRadius: [state.color] },
      onHover: (info) => setHover(info.index >= 0 ? info : null),
      onClick: (info) => {
        if (info.object) update({ selected: info.object.id });
      },
    }),
    new ScatterplotLayer({
      id: "selected-halo",
      data: selectedIndex >= 0 ? [points[selectedIndex]] : [],
      getPosition: (p) => p.position,
      getRadius: 10,
      radiusUnits: "pixels",
      filled: false,
      stroked: true,
      getLineColor: [232, 232, 236, 210],
      lineWidthUnits: "pixels",
      getLineWidth: 1,
      pickable: false,
    }),
  ];
  const renderRegions = (
    items: typeof top,
    active: boolean,
    prefix: string,
  ) => {
    return items.map((n) => {
      const placed = shownRegions.get(n.id);
      const [x, y] = placed ?? viewport.project([n.x, n.y, 0]);
      const visible = active && !!placed;
      return (
        <button
          key={prefix + n.id}
          className="region-name"
          title={n.label}
          data-active={visible}
          style={{ left: x, top: y, opacity: visible ? regionOpacity : 0 }}
          tabIndex={visible ? 0 : -1}
          aria-hidden={!visible}
          onClick={() => {
            update({
              node: n.node,
              selected: undefined,
              cluster: n.node === undefined ? n.cluster : undefined,
            });
            move({
              target: [n.x, n.y, 0],
              zoom: Math.max(
                camera.zoom + 0.8,
                home.zoom + (prefix === "top" ? 1.2 : 3),
              ),
            });
          }}
        >
          {n.label}
        </button>
      );
    });
  };
  return (
    <div
      ref={container}
      className="map-wrap"
      data-testid="research-map"
      data-label-level={level}
      data-paper-labels={paperLabelsOn}
      data-paper-opacity={paperOpacity.toFixed(2)}
      data-camera={`${camera.zoom.toFixed(4)}:${camera.target.slice(0, 2).join(",")}`}
      tabIndex={0}
      aria-label="연구 지도. 방향키 이동, 더하기와 빼기로 확대 축소"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (["+", "=", "-"].includes(e.key)) {
          e.preventDefault();
          move(
            { ...camera, zoom: camera.zoom + (e.key === "-" ? -0.5 : 0.5) },
            false,
          );
        } else if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          const d = 40 / 2 ** camera.zoom;
          move(
            {
              ...camera,
              target: [
                camera.target[0] +
                  (e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0),
                camera.target[1] +
                  (e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0),
                0,
              ],
            },
            false,
          );
        }
      }}
    >
      <DeckGL
        pickingRadius={6}
        views={view}
        viewState={{
          ...camera,
          minZoom: home.zoom - 2,
          maxZoom: home.zoom + 8,
        }}
        controller={{ dragRotate: false }}
        onViewStateChange={({ viewState: next }) => {
          cancelAnimationFrame(frame.current);
          setCamera(map.run_id, next as Camera);
        }}
        layers={layers}
        getCursor={({ isDragging }) =>
          isDragging ? "grabbing" : hover ? "pointer" : "grab"
        }
      />
      <div className="map-labels" aria-label="지도 라벨">
        {renderRegions(top, level === "field", "top")}
        {renderRegions(
          sub,
          level === "topic" && camera.zoom - home.zoom < 2,
          "sub",
        )}
        {renderRegions(
          leaves,
          relativeZoom >= 2 && relativeZoom < PAPER_LABEL_ZOOM + 0.5,
          "leaf",
        )}
        {titles.map((l) => (
          <button
            key={l.id}
            className="paper-name"
            data-active={paperLabelsOn}
            data-selected={l.selected || undefined}
            title={l.text}
            style={{ left: l.x, top: l.y + 7, opacity: paperOpacity }}
            tabIndex={paperLabelsOn ? 0 : -1}
            aria-hidden={!paperLabelsOn}
            onClick={() => update({ selected: l.id })}
          >
            {l.text}
          </button>
        ))}
      </div>
      <div className="map-caption">
        <span className="eyebrow">
          {level === "field"
            ? "상위 분야"
            : level === "topic"
              ? "하위 분야"
              : "논문 제목"}
        </span>
        <span>
          {a.clusters.data?.length ?? 0}개 주제 · {map.n.toLocaleString()}편
        </span>
      </div>
      <div className="map-controls">
        <Button
          variant="ghost"
          size="icon"
          aria-label="지도 축소"
          onClick={() =>
            move({
              ...camera,
              zoom: Math.max(home.zoom - 2, camera.zoom - 0.6),
            })
          }
        >
          <Minus />
        </Button>
        <span className="mono">
          {Math.round(100 * 2 ** (camera.zoom - home.zoom))}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="지도 확대"
          onClick={() =>
            move({
              ...camera,
              zoom: Math.min(home.zoom + 8, camera.zoom + 0.6),
            })
          }
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="지도 전체 보기"
          onClick={() => {
            update({ cluster: undefined, node: undefined });
            move(home);
          }}
        >
          <RotateCcw />
        </Button>
      </div>
      <div className="map-footnote">
        {state.color === "year"
          ? "발행연도 · 밝을수록 최근 · 연도 미상은 회색"
          : state.color === "cited"
            ? "피인용수 · 색·크기 로그 척도"
            : state.color === "abstract"
              ? "초록 있음: 녹색 / 없음: 분홍"
              : "색상: 연구 주제 · 미분류: 회색"}
        <br />
        지도 거리는 차원 축소 결과입니다. 인용 관계와 함께 확인하세요.
      </div>
      {hover && (
        <div
          className="tooltip"
          style={{
            left: Math.min(hover.x + 14, size.width - 290),
            top: Math.min(hover.y + 12, size.height - 100),
          }}
        >
          <strong>{map.title[hover.index]}</strong>
          <div>
            {map.year[hover.index] ?? "연도 미상"} · 피인용{" "}
            {map.cited[hover.index].toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
