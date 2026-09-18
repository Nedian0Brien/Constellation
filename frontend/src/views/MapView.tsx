import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useTween } from "../hooks/use-tween";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import DeckGL, { type DeckGLRef } from "@deck.gl/react";
import {
  LineLayer,
  ScatterplotLayer,
  TextLayer,
  type TextLayerProps,
} from "@deck.gl/layers";
import { OrthographicView, OrthographicViewport } from "@deck.gl/core";
import type { PickingInfo } from "@deck.gl/core";
import {
  Info,
  MessageSquareText,
  Minus,
  Plus,
  RotateCcw,
  Waypoints,
} from "lucide-react";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { useStore, type Camera } from "../store";
import { fetchEdges } from "../api";
// 제목 타일의 zoomStep(아래)과 이름이 겹쳐 에이전트 쪽은 별칭으로 들여온다.
import { levelOffset, zoomStep as agentZoomStep } from "../agent/resolve";
import { Button } from "../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/ui/tooltip";
import {
  labelLevel,
  paperTitleOpacity,
  PAPER_LABEL_ZOOM,
  paperLabelOpacity,
  clampRegionLabel,
  regionRadii,
  regionLabels,
  revealZooms,
  truncateTitle,
  MAX_ROWS,
  homeCamera,
  fitCamera,
  descendants,
} from "./map/labels";
import { placeLabels, type LabelBox } from "./map/active-labels";
import { clusterColor, regionBlobs, type RegionBlob } from "./map/regions";
import {
  citationIndex,
  degreeOf,
  dotScale,
  linksOf,
  localGraph,
  type GraphLink,
  type LocalGraph,
} from "./map/edges";
import { SnapTextExtension } from "./map/text-snap";
import { RegionGradientExtension } from "./map/region-gradient";
const view = new OrthographicView({ id: "research-map" });
const snapText = new SnapTextExtension(),
  regionGradient = new RegionGradientExtension();
// 라벨이 켜지고 꺼지는 시간. `.region-name`의 transition과 같다. 호버 연결선과
// 옅어짐도 같은 시간에 맞춘다.
const LABEL_FADE_MS = 240;
// 점 반지름의 픽셀 상한. 제목이 점 중심 아래 9px에서 시작하므로 그 안에 둔다. 선택한
// 논문의 고리는 점보다 5px 밖, 기준 배율에서는 지금처럼 10px.
const DOT_RADIUS_MAX = 7,
  HALO_GAP = 5,
  HALO_MIN = 10;
// 마우스를 올린 논문의 인용 관계. 참조(올린 논문 → 이웃)는 파랑, 피인용(이웃 → 올린
// 논문)은 빨강 — dataviz 기준 팔레트의 다크 모드 발산 쌍(#3987e5·#e66767)으로, 지도
// 바탕 #0e1319 위에서 검증기를 통과한다(CVD ΔE 19.2, 정상 시각 29.0, 대비 3:1 이상).
// 굵기 2px는 같은 규격의 선 표식. 나머지 점은 절반으로 옅어진다(shadcn `opacity-50`).
const LINK_OUT: [number, number, number] = [57, 135, 229],
  LINK_IN: [number, number, number] = [230, 103, 103],
  LINK_WIDTH = 2,
  HOVER_DIM = 0.5;
// 로컬 그래프(2홉)에서 선택 노드에 닿지 않는 선. `--ink-soft` #93a3b4, 1px, 옅게.
const LINK_FAR: [number, number, number, number] = [147, 163, 180, 110],
  LINK_FAR_WIDTH = 1;
// 점 위에 이만큼 머물러야 강조가 켜진다. 사용자가 정한 값("한 1초").
const HOVER_DELAY_MS = 1000;
// 선택 모드의 버튼 셋: 노드에서 36px 떨어진 원의 위쪽 호에 60° 간격. 아래쪽은 노드의
// 제목이 차지한다(점 아래 9px). 버튼은 32px(desktop dense, `design-ops`
// patterns/button.md 높이 분포).
const MENU_RADIUS = 36,
  MENU_ANGLES = [-150, -90, -30];
// 선택 시 노드가 가장자리 이 안쪽이면 중앙으로 옮긴다 — 버튼이 화면 밖으로 안 나가게.
const SELECT_MARGIN = 90;
// 로컬 그래프를 화면에 맞출 때의 여백.
const FIT_PADDING = 80;
// 논문 제목 상자. 본문 글꼴 11px, 220px 최대 폭(안쪽 여백 2px 4px를 뺀 212px에
// 글자), 이웃과의 간격은 가로 8px·세로 4px(간격 스케일 4·8). 높이는 쌓을 때의 줄
// 간격이기도 하다. 글자는 점 아래 9px(위 여백 7 + 안쪽 2)에서 시작한다.
const TITLE_FONT_SIZE = 11,
  TITLE_MAX_WIDTH = 220,
  TITLE_PADDING = 8,
  TITLE_GAP_X = 8,
  TITLE_HEIGHT = 20 + 4,
  TITLE_OFFSET_Y = 9,
  // 화면 밖이어도 이만큼 안이면 그린다: 가로는 라벨 폭의 절반, 세로는 쌓인 줄까지.
  TITLE_MARGIN_X = TITLE_MAX_WIDTH / 2 + TITLE_GAP_X,
  TITLE_MARGIN_Y = TITLE_HEIGHT * (MAX_ROWS + 1),
  // 제목 배열을 다시 만드는 카메라 칸: 중심 240px, 배율 반 단계. `titles` 참고.
  TITLE_TILE = 240,
  TITLE_ZOOM_STEP = 0.5;
// TextLayer에 주는 제목 하나. 위치는 지도 좌표라 카메라가 움직여도 안 바뀐다.
interface Title {
  id: string;
  /** map 배열의 색인. 툴팁·선택이 쓴다. */
  i: number;
  /** boxes·reveals의 색인. */
  k: number;
  text: string;
  position: [number, number];
  /** 점 아래 픽셀 거리: 9 + 줄 × 24. */
  dy: number;
  selected: boolean;
}
// 기준 배율 위로 확대할 수 있는 단계. 25600%.
const ZOOM_RANGE = 8;
// 제목 글꼴·색. 본문의 글꼴 문자열과 글자색을 한 번 읽는다 — 글자 폭 재기와
// TextLayer(글꼴 아틀라스)가 같은 글꼴을 쓴다. 테마 변수가 oklch라 색은 캔버스에
// 넣었다 꺼내 sRGB로 읽는다. 캔버스가 없으면 글자 수로 어림한다.
type RGB = [number, number, number];
interface TitleTypography {
  fontFamily: string;
  color: RGB;
  measureChar: (char: string) => number;
}
function titleTypography(): TitleTypography {
  const ctx =
    typeof document === "undefined"
      ? null
      : document.createElement("canvas").getContext("2d");
  // 실측 기본값: 어두운 테마의 글자색(#e8e8ec)과 본문 글꼴.
  const fallback: TitleTypography = {
    fontFamily: "system-ui, sans-serif",
    color: [232, 232, 236],
    measureChar: () => 6,
  };
  if (!ctx) return fallback;
  const style = getComputedStyle(document.body);
  const rgb = (css: string, or: RGB): RGB => {
    ctx.fillStyle = css;
    const hex = ctx.fillStyle;
    return /^#[0-9a-f]{6}$/i.test(hex)
      ? ([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB)
      : or;
  };
  ctx.font = `${TITLE_FONT_SIZE}px ${style.fontFamily}`;
  return {
    fontFamily: style.fontFamily,
    color: rgb(style.color, fallback.color),
    measureChar: (char) => ctx.measureText(char).width,
  };
}
// 글꼴 아틀라스의 글리프를 DOM과 같은 래스터로 만든다. deck 기본 방식은 아틀라스
// 크기(여기서는 22px)의 글꼴을 그려 절반으로 줄이는 셈이라, 시스템 글꼴의 광학
// 크기 때문에 11px 글자보다 4% 좁게 나왔다. 그래서 11px 글꼴을 기기 픽셀 비율만큼
// 키운 캔버스에 그린다. 캔버스 글자는 macOS의 글꼴 다듬기(획 굵히기)를 받아 본문의
// `-webkit-font-smoothing: antialiased`보다 3할 굵어지는데, `textRendering`을
// geometricPrecision으로 두면 같은 잉크 양이 나온다(실측: 같은 제목에서 1644 대
// 2188). 치수는 아틀라스 픽셀(= 기기 픽셀)로 돌려준다. `_getFontRenderer`는 deck
// 9.3의 실험 API다(text-layer.d.ts).
type FontRenderer = ReturnType<NonNullable<TextLayerProps["_getFontRenderer"]>>;
function titleFontRenderer(fontFamily: string, dpr: number): FontRenderer {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // 캔버스 크기를 바꾸면 컨텍스트가 초기화되므로 그릴 때마다 다시 잡는다.
  const style = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${TITLE_FONT_SIZE}px ${fontFamily}`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.textRendering = "geometricPrecision";
    ctx.fillStyle = "#fff";
  };
  style();
  const measure = (char?: string) => {
    const m = ctx.measureText(char ?? "A");
    return char === undefined
      ? {
          advance: 0,
          width: 0,
          ascent: Math.ceil(m.fontBoundingBoxAscent * dpr),
          descent: Math.ceil(m.fontBoundingBoxDescent * dpr),
        }
      : {
          advance: m.width * dpr,
          width: Math.ceil(
            (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) * dpr,
          ),
          ascent: Math.ceil(m.actualBoundingBoxAscent * dpr),
          descent: Math.ceil(m.actualBoundingBoxDescent * dpr),
        };
  };
  return {
    measure,
    draw(char) {
      const g = measure(char),
        left = ctx.measureText(char).actualBoundingBoxLeft,
        pad = Math.ceil(dpr);
      canvas.width = g.width + pad * 2;
      canvas.height = g.ascent + g.descent + pad * 2;
      style();
      ctx.fillText(char, pad / dpr + left, (pad + g.ascent) / dpr);
      return {
        data: ctx.getImageData(0, 0, canvas.width, canvas.height),
        left: pad,
        top: pad,
      };
    },
  };
}
// E2E용 다리. 제목이 DOM에 없으므로 켜진 제목과 deck의 투영·픽킹을 컨테이너에 걸어
// 둔다. `project`는 JS 쪽 뷰포트, `pick`은 실제로 그려진 픽셀을 본다 — 둘이 어긋나면
// 지도와 라벨이 따로 노는 것이다.
export interface MapBridge {
  /** 켜진 제목: 지도 좌표, 점 아래 글자까지의 픽셀 거리, 불투명도. */
  titles(): { id: string; x: number; y: number; dy: number; opacity: number }[];
  /** 지도 좌표를 화면 픽셀로. */
  project(x: number, y: number): [number, number] | null;
  /** 화면 픽셀 자리에 그려진 논문 id. */
  pick(x: number, y: number): string | null;
  /** 이 run 안에서 그 논문과 인용으로 이어진 논문 수. 자료가 아직 없으면 -1. */
  degree(id: string): number;
}
const EMPTY_TITLES: Title[] = [];
// 활성 라벨(강조 노드와 인용 이웃의 제목). 지도 제목과 같은 모양이지만 자리는
// 겹치지 않게 그때그때 고른다.
interface ActiveTitle {
  id: string;
  i: number;
  text: string;
  position: [number, number];
  dy: number;
}
const EMPTY_ACTIVE: ActiveTitle[] = [];
const EMPTY_GRAPH: LocalGraph = { nodes: [], links: [] };
// 영역 이름 하나. 켜진 동안만 자리를 옮기고, 꺼지면 마지막 자리에 그대로 두어 240ms
// 페이드아웃만 한다 — 매 프레임 65개의 위치를 갱신하던 것이 스타일 재계산의 대부분이었다.
// 한 번도 켜진 적 없는 이름은 만들지 않는다. 마지막 자리는 이전 렌더의 값을 state에
// 남기는 방식으로 기억한다(https://react.dev/reference/react/useState#storing-information-from-previous-renders).
function RegionName({
  label,
  placed,
  opacity,
  onClick,
}: {
  label: string;
  placed: [number, number] | undefined;
  opacity: number;
  onClick: () => void;
}) {
  const [last, setLast] = useState(placed);
  if (placed && (!last || placed[0] !== last[0] || placed[1] !== last[1]))
    setLast(placed);
  const at = placed ?? last;
  if (!at) return null;
  const visible = !!placed;
  const [x, y] = at;
  return (
    <button
      className="region-name"
      title={label}
      data-active={visible}
      style={{ left: x, top: y, opacity: visible ? opacity : 0 }}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
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
  const [hover, setHover] = useState<PickingInfo<{ i: number }> | null>(null);
  // run 안의 인용 관계 전부를 한 번 받아 인접 표로 둔다. 호버는 로컬에서 바로 그린다.
  const edges = useQuery({
    queryKey: ["edges", map.run_id],
    queryFn: ({ signal }) => fetchEdges(map.run_id, signal),
  });
  const index = useMemo(() => {
    const e = edges.data;
    if (!e) return null;
    const built =
      e.n === map.n ? citationIndex(map.n, e.citing, e.cited) : null;
    if (!built)
      console.error(
        "인용 관계 자료가 지도와 어긋난다 — 연결선을 그리지 않는다.",
        {
          edges: e.n,
          map: map.n,
        },
      );
    return built;
  }, [edges.data, map.n]);
  // 호버는 같은 점 위에 1초 머문 뒤에야 켜진다. 다른 점으로 옮기거나 떠나면 바로
  // 꺼지고(렌더 중 state 조정) 새 점은 다시 1초를 기다린다.
  const pointerIndex = hover?.object?.i ?? -1;
  const [active, setActive] = useState(-1);
  if (active >= 0 && active !== pointerIndex) setActive(-1);
  useEffect(() => {
    if (pointerIndex < 0) return;
    const t = setTimeout(() => setActive(pointerIndex), HOVER_DELAY_MS);
    return () => clearTimeout(t);
  }, [pointerIndex]);
  const deckRef = useRef<DeckGLRef<typeof view>>(null);
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
  // 에이전트 도구가 내린 카메라 요청. 이 run 의 것만, nonce 마다 한 번만 움직인다.
  const cameraRequest = useStore((s) => s.cameraRequest),
    consumedRequest = useRef(0);
  useEffect(() => {
    if (
      !cameraRequest ||
      cameraRequest.run !== map.run_id ||
      cameraRequest.nonce === consumedRequest.current
    )
      return;
    consumedRequest.current = cameraRequest.nonce;
    const current = useStore.getState().cameras[map.run_id] ?? home;
    const zoom =
      cameraRequest.level !== undefined
        ? home.zoom + levelOffset[cameraRequest.level]
        : cameraRequest.steps !== undefined
          ? current.zoom + agentZoomStep * cameraRequest.steps
          : current.zoom;
    move({
      target: cameraRequest.target ?? current.target,
      zoom: Math.min(home.zoom + 8, Math.max(home.zoom - 2, zoom)),
    });
  }, [cameraRequest, map.run_id, home, move]);
  const annotations = useStore((s) => s.annotations);
  const lastSelected = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!state.selected || lastSelected.current === state.selected) return;
    lastSelected.current = state.selected;
    const i = map.id.indexOf(state.selected);
    if (i < 0) return;
    const [x, y] = viewport.project([map.x[i], map.y[i], 0]);
    if (
      x < SELECT_MARGIN ||
      y < SELECT_MARGIN ||
      x > size.width - SELECT_MARGIN ||
      y > size.height - SELECT_MARGIN
    )
      move({ ...camera, target: [map.x[i], map.y[i], 0] });
  }, [state.selected, map, viewport, move, camera, size.width, size.height]);
  const selectedIndex = map.id.indexOf(state.selected ?? "");
  // 강조 노드: 켜진 호버, 없으면 선택 노드. 강조의 진행도는 켜지면 0 → 1, 꺼지면
  // 1 → 0이고, 옅어지는 동안은 마지막 강조 노드의 선·라벨을 그대로 둔다.
  const focusIndex = active >= 0 ? active : selectedIndex;
  const hoverT = useTween(focusIndex >= 0 ? 1 : 0, LABEL_FADE_MS, reduced);
  const [lastFocus, setLastFocus] = useState(focusIndex);
  if (focusIndex >= 0 && focusIndex !== lastFocus) setLastFocus(focusIndex);
  const heldIndex = focusIndex >= 0 ? focusIndex : hoverT > 0 ? lastFocus : -1;
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
  const blobs = useMemo(
    () => regionBlobs(map, a.clusters.data ?? []),
    [map, a.clusters.data],
  );
  const relativeZoom = camera.zoom - home.zoom;
  const level = labelLevel(relativeZoom);
  // 점 반지름. 점마다의 기본값(피인용 색이면 피인용수에 따라 1.5~4.5px)에 배율 배수를
  // 레이어 uniform으로 곱한다 — 확대해도 점별 속성은 다시 채우지 않는다.
  const scale = dotScale(relativeZoom);
  const baseRadius = (p: { i: number }) =>
    state.color === "cited"
      ? 1.5 + (3 * Math.log1p(map.cited[p.i])) / maxLog
      : 1.5;
  const radiusPx = (p: { i: number }) =>
    Math.min(DOT_RADIUS_MAX, scale * baseRadius(p));
  const haloRadius =
    selectedIndex >= 0
      ? Math.max(HALO_MIN, radiusPx(points[selectedIndex]) + HALO_GAP)
      : HALO_MIN;
  // 강조 노드의 인용 그래프. 보통은 그 노드에 닿는 선(1홉)만, 선택 노드의 로컬
  // 그래프가 켜져 있으면 2홉 이웃과 그 사이 선까지. 이웃이 없으면 노드 하나.
  const showLocal = state.local && heldIndex === selectedIndex;
  const graph = useMemo<LocalGraph>(() => {
    if (!index || heldIndex < 0) return EMPTY_GRAPH;
    if (showLocal) return localGraph(index, heldIndex);
    const links: GraphLink[] = linksOf(index, heldIndex).map((l) =>
      l.incoming
        ? { a: l.j, b: heldIndex, seed: true }
        : { a: heldIndex, b: l.j, seed: true },
    );
    return {
      nodes: [
        heldIndex,
        ...new Set(links.map((l) => (l.a === heldIndex ? l.b : l.a))),
      ],
      links,
    };
  }, [index, heldIndex, showLocal]);
  const hoverNodes = useMemo(
    () => graph.nodes.map((i) => points[i]),
    [points, graph],
  );
  // 에이전트의 시스템 프롬프트가 읽는 확대 단계.
  const setMapLevel = useStore((s) => s.setMapLevel);
  useEffect(() => setMapLevel(level), [level, setMapLevel]);
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
      const covering = Math.hypot(cx - n.x, cy - n.y) <= (radii.get(n.id) ?? 0);
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
  // 논문 제목의 바닥 배율(절대 zoom). 겹치지 않는 제목은 여기서부터 진해진다.
  // 상위 분야 단계에서는 안 켠다. 하위 분야 단계인데 화면에 영역 이름이 하나도
  // 없으면(영역 사이 빈 곳) 바닥을 없애 겹치지 않는 제목을 바로 켠다 — 그 순간
  // 한꺼번에 켜지지 않도록 `regionless`를 240ms에 걸쳐 0 ↔ 1로 잇고, 두 바닥의
  // 불투명도를 그 비율로 섞는다. 영역 이름이 같은 시간에 옅어지는 것과 교차한다.
  const paperFloor =
    level === "field" ? Infinity : home.zoom + PAPER_LABEL_ZOOM - 0.5;
  const regionless = useTween(
    level === "topic" && shownRegions.size === 0 ? 1 : 0,
    LABEL_FADE_MS,
    reduced,
  );
  const opacityAt = (reveal: number) =>
    paperTitleOpacity(camera.zoom, reveal, paperFloor, regionless);
  // 겹치지 않는 제목 하나가 지금 갖는 불투명도. 선택한 논문은 이만큼은 보인다.
  const paperOpacity = opacityAt(-Infinity);
  const paperLabelsOn = paperOpacity > 0;
  // 영역 이름은 같은 곡선을 거꾸로 따라 옅어진다.
  const regionOpacity = 1 - paperLabelOpacity(relativeZoom);
  const typo = useMemo(() => titleTypography(), []);
  // TextLayer의 글꼴 아틀라스에 넣을 글자. 제목에 나오는 글자 전부와 말줄임표(133자).
  // 'auto'로 두면 새 글자가 화면에 들어올 때마다 아틀라스를 다시 만든다.
  const characterSet = useMemo(
    () => [...new Set(map.title.join("") + "…")].join(""),
    [map],
  );
  // 글꼴 아틀라스는 실제로 그려질 크기(11px × 기기 픽셀 비율)로, 1:1로 표본한다.
  // 기본값(64px SDF)은 22px로 줄여 그릴 때 i의 점·따옴표·마침표 같은 작은 획이
  // 사라졌다. 글리프는 `titleFontRenderer`가 DOM과 같은 11px 글꼴로 그린다.
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const fontSettings = useMemo(
    () => ({ fontSize: TITLE_FONT_SIZE * dpr, sdf: false }),
    [dpr],
  );
  const getFontRenderer = useMemo(
    () => () => titleFontRenderer(typo.fontFamily, dpr),
    [typo, dpr],
  );
  // 글자 폭 표로 글 폭을 잰다. TextLayer는 글자마다 잰 폭을 더해 글을 놓으므로(커닝
  // 없음) 이 합이 실제 그려지는 폭이다. 제목 상자 폭과 말줄임이 모두 이 표를 쓴다.
  const measure = useMemo(() => {
    const table = new Map<string, number>();
    for (const ch of characterSet) table.set(ch, typo.measureChar(ch));
    const missing = typo.measureChar("M");
    return (text: string) => {
      let w = 0;
      for (const ch of text) w += table.get(ch) ?? missing;
      return w;
    };
  }, [characterSet, typo]);
  // 제목 상자 폭과 한 줄로 줄인 제목(`…`). 지도마다 한 번(1만 편에 약 70ms). 필터가
  // 바뀌어도 다시 재지 않는다.
  const widths = useMemo(
    () =>
      map.title.map(
        (t) =>
          Math.min(TITLE_MAX_WIDTH, measure(t) + TITLE_PADDING) + TITLE_GAP_X,
      ),
    [map, measure],
  );
  const displays = useMemo(
    () =>
      map.title.map((t) =>
        truncateTitle(measure, t, TITLE_MAX_WIDTH - TITLE_PADDING),
      ),
    [map, measure],
  );
  // 제목 상자: 필터에 든 논문만. 필터 밖 논문은 자리를 차지하지 않는다.
  const boxes = useMemo(
    () =>
      points
        .filter(
          (p) =>
            a.ids.has(p.id) &&
            Number.isFinite(map.x[p.i]) &&
            Number.isFinite(map.y[p.i]),
        )
        .map((p) => ({
          i: p.i,
          x: map.x[p.i],
          y: map.y[p.i],
          width: widths[p.i],
          priority: map.cited[p.i],
        })),
    [points, a.ids, map, widths],
  );
  // 논문마다 제목이 켜지는 배율과 줄. 좌표·제목 폭·피인용수로만 정하므로 이동해도
  // 바뀌지 않는다. 바닥과 최대 배율은 기준 배율(지도 크기에 따라 다름)에서 온다.
  // 1만 편에 약 120ms라 지도 크기가 바뀔 때는 멎은 뒤에 한 번만 다시 계산한다 —
  // 사이드바를 여닫는 동안은 이전 값을 쓴다(절대 배율이라 그대로 유효하다).
  const [settledHome, setSettledHome] = useState(home.zoom);
  useEffect(() => {
    const t = setTimeout(() => setSettledHome(home.zoom), 250);
    return () => clearTimeout(t);
  }, [home.zoom]);
  const reveals = useMemo(
    () =>
      revealZooms(boxes, settledHome, TITLE_HEIGHT, settledHome + ZOOM_RANGE),
    [boxes, settledHome],
  );
  // 하위 분야 단계부터 목록을 만든다. 상위 분야 단계에서는 1만 개를 거를 이유가 없다
  // — 제목이 아직 꺼지는 중이 아니라면. 바닥이 없는 동안(섞이는 중 포함)은 바닥 없이
  // 고른다.
  const showTitles = level !== "field" || regionless > 0;
  const memberFloor = regionless > 0 ? -Infinity : paperFloor;
  // 제목 배열. 위치가 지도 좌표라 이동할 때는 손댈 것이 없다. 다만 TextLayer는 배열이
  // 바뀌면 글자를 전부 다시 놓으므로(수백 제목 × 수십 글자) 카메라가 조금 움직일
  // 때마다 새 배열을 주면 DOM 시절만큼 비싸진다. 그래서 카메라를 칸으로 묶는다:
  // 중심은 240px 칸, 배율은 반 단계로 끊고, 그 칸에서 화면에 들어올 수 있는 제목을
  // (칸 안 어느 중심에서든, 반 단계 안 어느 배율에서든) 전부 넣어 만든다. 카메라가
  // 같은 칸 안에서 움직이는 동안은 같은 배열을 쓰고, 아직 안 켜진 제목은 불투명도
  // 0으로 그린다(픽셀은 버려진다). 선택한 제목은 마지막에 두어 이웃 위에 그린다.
  const zoomStep = Math.floor(camera.zoom / TITLE_ZOOM_STEP),
    tileWorld = TITLE_TILE / 2 ** (zoomStep * TITLE_ZOOM_STEP),
    tileX = Math.floor(camera.target[0] / tileWorld),
    tileY = Math.floor(camera.target[1] / tileWorld);
  const titles = useMemo(() => {
    if (!showTitles) return EMPTY_TITLES;
    const z0 = zoomStep * TITLE_ZOOM_STEP,
      scale = 2 ** z0,
      tile = TITLE_TILE / scale,
      cx = (tileX + 0.5) * tile,
      cy = (tileY + 0.5) * tile,
      hx = tile / 2 + (size.width / 2 + TITLE_MARGIN_X) / scale,
      hy = tile / 2 + (size.height / 2 + TITLE_MARGIN_Y) / scale,
      lit = z0 + TITLE_ZOOM_STEP;
    const data: Title[] = [];
    let selected: Title | null = null;
    for (let k = 0; k < boxes.length; k++) {
      const b = boxes[k];
      if (Math.abs(b.x - cx) > hx || Math.abs(b.y - cy) > hy) continue;
      const id = map.id[b.i],
        isSelected = id === state.selected;
      if (!isSelected && Math.max(reveals.zoom[k], memberFloor) >= lit)
        continue;
      const t: Title = {
        id,
        i: b.i,
        k,
        text: displays[b.i],
        position: [b.x, b.y],
        dy: TITLE_OFFSET_Y + TITLE_HEIGHT * reveals.row[k],
        selected: isSelected,
      };
      if (isSelected) selected = t;
      else data.push(t);
    }
    if (selected) data.push(selected);
    return data;
  }, [
    showTitles,
    boxes,
    reveals,
    map,
    displays,
    state.selected,
    memberFloor,
    zoomStep,
    tileX,
    tileY,
    size,
  ]);
  // 제목 하나의 불투명도. 제목마다 제 배율에서 서서히 진해진다. 선택한 논문은 이웃에
  // 가려지지 않는다.
  const titleOpacity = (t: Title) =>
    t.selected ? paperOpacity : opacityAt(reveals.zoom[t.k]);
  // 활성 노드(강조 노드와 그래프의 이웃). 지도 제목에서는 알파 0으로 감추고(배열은
  // 그대로 — 다시 만들면 글자를 전부 다시 놓는다) 활성 라벨 레이어가 대신 그린다.
  const activeSet = useMemo(() => new Set(graph.nodes), [graph]);
  const activeKey = heldIndex + ":" + graph.nodes.length;
  // 활성 라벨의 자리. 강조 노드는 항상, 나머지는 피인용수 순으로 앞서 놓인 활성
  // 라벨·지도 제목(이 칸에서 켜질 수 있는 것 전부)과 겹치지 않을 때만. 반 단계 배율의
  // 내림값으로 재므로 같은 단계 안에서 더 확대돼도 겹치지 않고, 단계가 오르면 다시
  // 재서 더 놓인다.
  const activeTitles = useMemo<ActiveTitle[]>(() => {
    if (heldIndex < 0) return EMPTY_ACTIVE;
    const s = 2 ** (zoomStep * TITLE_ZOOM_STEP);
    const boxOf = (i: number, dy: number): LabelBox => ({
      x: map.x[i] * s - widths[i] / 2,
      y: map.y[i] * s + dy,
      w: widths[i],
      h: TITLE_HEIGHT,
    });
    // 지도 제목이 있는 노드는 그 자리(쌓인 줄 포함)를 그대로 쓴다 — 지도 제목끼리는
    // 이미 겹치지 않으니 앞선 활성 라벨과만 다투면 된다.
    const baseDy = new Map(titles.map((t) => [t.i, t.dy]));
    const order = graph.nodes
      .filter(
        (i) =>
          i !== heldIndex &&
          Number.isFinite(map.x[i]) &&
          Number.isFinite(map.y[i]),
      )
      .sort((p, q) => map.cited[q] - map.cited[p]);
    const candidates = [heldIndex, ...order].map((i) => ({
      i,
      dy: baseDy.get(i) ?? TITLE_OFFSET_Y,
    }));
    const obstacles = titles
      .filter((t) => !activeSet.has(t.i))
      .map((t) => boxOf(t.i, t.dy));
    return placeLabels(
      candidates.map((c) => boxOf(c.i, c.dy)),
      obstacles,
    ).map((k) => {
      const { i, dy } = candidates[k];
      return {
        id: map.id[i],
        i,
        text: displays[i],
        position: [map.x[i], map.y[i]] as [number, number],
        dy,
      };
    });
  }, [heldIndex, graph, activeSet, zoomStep, map, widths, displays, titles]);
  useEffect(() => {
    const el = container.current as
      (HTMLDivElement & { __map?: MapBridge }) | null;
    if (!el) return;
    el.__map = {
      titles: () =>
        titles
          .map((t) => ({
            id: t.id,
            x: t.position[0],
            y: t.position[1],
            dy: t.dy,
            opacity: titleOpacity(t),
          }))
          .filter((t) => t.opacity > 0),
      project: (x, y) => {
        const vp = deckRef.current?.deck?.getViewports()[0];
        if (!vp) return null;
        const [px, py] = vp.project([x, y, 0]);
        return [px, py];
      },
      pick: (x, y) =>
        (
          deckRef.current?.pickObject({ x, y, radius: 6 })?.object as
            { id?: string } | undefined
        )?.id ?? null,
      degree: (id) => {
        const i = map.id.indexOf(id);
        return !index ? -1 : i < 0 ? 0 : degreeOf(index, i);
      },
    };
  });
  // 선택 모드의 버튼 셋. 노드가 화면 안에 있을 때만.
  const setDetailOpen = useStore((s) => s.setDetailOpen),
    requestChat = useStore((s) => s.requestChat);
  const menuAt = useMemo(() => {
    if (selectedIndex < 0) return null;
    const [x, y] = viewport.project([
      map.x[selectedIndex],
      map.y[selectedIndex],
      0,
    ]);
    return x >= 0 && y >= 0 && x <= size.width && y <= size.height
      ? ([x, y] as [number, number])
      : null;
  }, [selectedIndex, viewport, map, size]);
  const menu = [
    {
      label: "노드 상세정보",
      icon: <Info />,
      pressed: undefined,
      onClick: () => setDetailOpen(true),
    },
    {
      label: "AI에게 질문하기",
      icon: <MessageSquareText />,
      pressed: undefined,
      onClick: () => requestChat(),
    },
    {
      label: "로컬 그래프 보기",
      icon: <Waypoints />,
      pressed: !!state.local,
      onClick: () => update({ local: !state.local }),
    },
  ];
  // 로컬 그래프를 켜면 2홉 이웃이 여백을 두고 화면에 들어오도록 카메라를 옮기고, 끄면
  // 켜기 전 카메라로 돌아간다(선택이 바뀌어 꺼진 경우는 그대로).
  const fitted = useRef<{ key: string; before: Camera } | null>(null);
  useEffect(() => {
    const key = state.local && selectedIndex >= 0 ? state.selected! : null;
    const last = fitted.current;
    if ((last?.key ?? null) === key) return;
    if (!key) {
      fitted.current = null;
      if (last && state.selected === last.key) move(last.before);
      return;
    }
    if (!index) return;
    fitted.current = {
      key,
      before: useStore.getState().cameras[map.run_id] ?? home,
    };
    const g = localGraph(index, selectedIndex);
    move(
      fitCamera(
        g.nodes.map((i) => map.x[i]).filter(Number.isFinite),
        g.nodes.map((i) => map.y[i]).filter(Number.isFinite),
        size.width,
        size.height,
        FIT_PADDING,
        home.zoom - 2,
        home.zoom + ZOOM_RANGE,
      ),
    );
  }, [
    state.local,
    state.selected,
    selectedIndex,
    index,
    map,
    size,
    home,
    move,
  ]);
  const layers = [
    // 영역 배경. 영역마다 옅어지는 원 하나를 GPU에서 픽셀마다 계산한다 — 어떤
    // 배율에서도 매끈하다.
    new ScatterplotLayer<RegionBlob>({
      id: "soft-regions",
      data: blobs,
      getPosition: (b) => b.position,
      getRadius: (b) => b.radius,
      radiusUnits: "common",
      getFillColor: (b) => [...b.color, 255],
      antialiasing: false,
      opacity: state.color === "cluster" ? 0.7 : 0.2,
      extensions: [regionGradient],
      pickable: false,
    }),
    new ScatterplotLayer({
      id: "papers",
      data: points,
      getPosition: (p) => p.position,
      getFillColor: (p) => colors[p.i],
      getRadius: baseRadius,
      radiusUnits: "pixels",
      radiusScale: scale,
      radiusMinPixels: 1.3,
      radiusMaxPixels: DOT_RADIUS_MAX,
      // 마우스를 올린 동안 올린 점과 이웃 말고는 절반으로 옅어진다.
      opacity: 1 - HOVER_DIM * hoverT,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 255],
      updateTriggers: { getFillColor: [colors], getRadius: [state.color] },
      onHover: (info) => setHover(info.object ? info : null),
      onClick: (info) => {
        if (info.object) update({ selected: info.object.id });
      },
    }),
    // 올린 논문의 인용 관계. 참조는 파랑, 피인용은 빨강. 올린 점은 흰색, 이웃은 제 색
    // 그대로 위에 다시 그린다. 픽킹은 기본 점·제목 레이어가 맡는다. 올린 것이 없으면
    // 레이어 자체를 두지 않는다(deck은 falsy 항목을 거른다).
    heldIndex >= 0 &&
      new LineLayer<GraphLink>({
        id: "hover-links",
        data: graph.links,
        getSourcePosition: (l) => points[l.a].position,
        getTargetPosition: (l) => points[l.b].position,
        // 강조 노드에 닿는 선은 방향 색(강조 노드가 인용 → 파랑, 강조 노드를 인용 →
        // 빨강), 로컬 그래프의 나머지 선은 옅은 한 색.
        getColor: (l) =>
          !l.seed ? LINK_FAR : l.a === heldIndex ? LINK_OUT : LINK_IN,
        getWidth: (l) => (l.seed ? LINK_WIDTH : LINK_FAR_WIDTH),
        widthUnits: "pixels",
        opacity: hoverT,
        pickable: false,
        updateTriggers: { getColor: [heldIndex] },
      }),
    heldIndex >= 0 &&
      new ScatterplotLayer({
        id: "hover-nodes",
        data: hoverNodes,
        getPosition: (p) => p.position,
        getFillColor: (p) =>
          p.i === heldIndex ? [255, 255, 255, 255] : colors[p.i],
        getRadius: baseRadius,
        radiusUnits: "pixels",
        radiusScale: scale,
        radiusMinPixels: 1.3,
        radiusMaxPixels: DOT_RADIUS_MAX,
        opacity: hoverT,
        pickable: false,
        updateTriggers: {
          getFillColor: [colors, heldIndex],
          getRadius: [state.color],
        },
      }),
    new ScatterplotLayer({
      id: "selected-halo",
      data: selectedIndex >= 0 ? [points[selectedIndex]] : [],
      getPosition: (p) => p.position,
      getRadius: haloRadius,
      radiusUnits: "pixels",
      filled: false,
      stroked: true,
      getLineColor: [232, 232, 236, 210],
      lineWidthUnits: "pixels",
      getLineWidth: 1,
      pickable: false,
    }),
    // 논문 제목. GPU에서 그린다 — DOM 버튼 수백 개를 프레임마다 옮기던 비용이 사라진다.
    // 배율이 바뀔 때만 색(불투명도) 속성을 다시 채우고, 이동은 그리기만 한다.
    new TextLayer<Title>({
      id: "paper-titles",
      data: titles,
      characterSet,
      fontFamily: typo.fontFamily,
      fontSettings,
      _getFontRenderer: getFontRenderer,
      extensions: [snapText],
      sizeUnits: "pixels",
      getSize: TITLE_FONT_SIZE,
      getPosition: (t) => t.position,
      getPixelOffset: (t) => [0, t.dy],
      getTextAnchor: "middle",
      getAlignmentBaseline: "top",
      getColor: (t) => [
        ...typo.color,
        activeSet.has(t.i) ? 0 : Math.round(255 * titleOpacity(t)),
      ],
      updateTriggers: {
        getColor: [camera.zoom, paperFloor, regionless, activeKey],
      },
      pickable: true,
      onHover: (info) => setHover(info.object ? info : null),
      onClick: (info) => {
        if (info.object) update({ selected: info.object.id });
      },
    }),
    // 활성 라벨. 강조가 켜지는 동안 지도 제목과 같은 모양으로 나타난다.
    heldIndex >= 0 &&
      new TextLayer<ActiveTitle>({
        id: "active-titles",
        data: activeTitles,
        characterSet,
        fontFamily: typo.fontFamily,
        fontSettings,
        _getFontRenderer: getFontRenderer,
        extensions: [snapText],
        sizeUnits: "pixels",
        getSize: TITLE_FONT_SIZE,
        getPosition: (t) => t.position,
        getPixelOffset: (t) => [0, t.dy],
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getColor: [...typo.color, 255],
        opacity: hoverT,
        pickable: true,
        onHover: (info) => setHover(info.object ? info : null),
        onClick: (info) => {
          if (info.object) update({ selected: info.object.id });
        },
      }),
  ];
  const renderRegions = (items: typeof top, active: boolean, prefix: string) =>
    items.map((n) => (
      <RegionName
        key={prefix + n.id}
        label={n.label}
        placed={active ? shownRegions.get(n.id) : undefined}
        opacity={regionOpacity}
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
      />
    ));
  return (
    <div
      ref={container}
      className="map-wrap"
      data-testid="research-map"
      data-label-level={level}
      data-paper-labels={paperLabelsOn}
      data-paper-opacity={paperOpacity.toFixed(2)}
      data-title-count={titles.length}
      data-hover-id={heldIndex >= 0 ? points[heldIndex].id : undefined}
      data-hover-links={graph.links.length}
      data-active-labels={activeTitles.length}
      data-local={showLocal || undefined}
      data-reveal-floor={settledHome.toFixed(4)}
      data-camera={`${camera.zoom.toFixed(4)}:${camera.target.slice(0, 2).join(",")}`}
      tabIndex={0}
      aria-label="연구 지도. 방향키 이동, 더하기와 빼기로 확대 축소"
      // deck은 캔버스 안에서 빈 곳으로 옮겨야 호버를 거둔다. 지도 밖(사이드바·도구 막대)으로
      // 바로 나가면 툴팁과 인용 선이 남으므로 여기서 거둔다.
      onPointerLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Escape" && state.selected) {
          e.preventDefault();
          update({ selected: undefined });
          return;
        }
        if (["+", "=", "-"].includes(e.key)) {
          e.preventDefault();
          move(
            {
              ...camera,
              zoom: Math.min(
                home.zoom + ZOOM_RANGE,
                Math.max(
                  home.zoom - 2,
                  camera.zoom + (e.key === "-" ? -0.5 : 0.5),
                ),
              ),
            },
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
        ref={deckRef}
        pickingRadius={6}
        views={view}
        viewState={{
          ...camera,
          minZoom: home.zoom - 2,
          maxZoom: home.zoom + ZOOM_RANGE,
        }}
        controller={{ dragRotate: false }}
        onViewStateChange={({ viewState: next }) => {
          cancelAnimationFrame(frame.current);
          // deck이 주는 viewState에는 zoomX·zoomY·width 같은 제 내부 값이 딸려 온다.
          // 그대로 저장하면 뒤에 zoom만 바꾸는 키·버튼 확대가 zoomX·zoomY에 눌려
          // 지도는 그대로인데 배율 표시와 라벨만 바뀐다. 카메라 두 값만 남긴다.
          const { target = camera.target, zoom = camera.zoom } = next;
          setCamera(map.run_id, {
            target: [target[0], target[1], 0],
            zoom: typeof zoom === "number" ? zoom : camera.zoom,
          });
        }}
        layers={layers}
        // 빈 곳 클릭은 선택 해제. 점·제목 클릭은 레이어가 먼저 받아 선택을 바꾼다.
        onClick={(info) => {
          if (!info.object && state.selected) update({ selected: undefined });
        }}
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
        {menuAt && (
          <div
            className="node-menu"
            data-testid="node-menu"
            style={{ left: menuAt[0], top: menuAt[1] }}
          >
            {menu.map((item, k) => {
              const a = (MENU_ANGLES[k] * Math.PI) / 180;
              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="secondary"
                        size="icon"
                        className="node-menu-btn"
                        aria-label={item.label}
                        aria-pressed={item.pressed}
                        style={{
                          left: MENU_RADIUS * Math.cos(a),
                          top: MENU_RADIUS * Math.sin(a),
                        }}
                        onClick={item.onClick}
                      />
                    }
                  >
                    {item.icon}
                  </TooltipTrigger>
                  <TooltipContent>{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>
      {annotations.length > 0 && (
        <svg
          className="map-annotations"
          aria-label="에이전트 주석"
          data-testid="map-annotations"
          data-count={annotations.length}
        >
          {annotations.map((n) => {
            const [px, py] = viewport.project([n.x, n.y, 0]);
            // 라벨은 점의 오른쪽 위. 화면 밖으로 나가면 반대쪽으로 꺾는다.
            const dx = px > size.width - 200 ? -36 : 36,
              dy = py < 60 ? 36 : -36;
            const lx = px + dx,
              ly = py + dy;
            return (
              <g key={n.id} className="map-annotation" data-kind={n.kind}>
                <line x1={px} y1={py} x2={lx} y2={ly} />
                <circle cx={px} cy={py} r={n.kind === "cluster" ? 6 : 4} />
                <text
                  x={lx + (dx > 0 ? 4 : -4)}
                  y={ly}
                  textAnchor={dx > 0 ? "start" : "end"}
                  dominantBaseline="middle"
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
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
              zoom: Math.min(home.zoom + ZOOM_RANGE, camera.zoom + 0.6),
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
    </div>
  );
}
