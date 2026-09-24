import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { LineLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { OrthographicView, OrthographicViewport } from "@deck.gl/core";
import {
  DataFilterExtension,
  type DataFilterExtensionProps,
} from "@deck.gl/extensions";
import {
  homeCamera,
  labelLevel,
  paperLabelOpacity,
  paperTitleOpacity,
  placeRegionLabels,
  PAPER_LABEL_ZOOM,
} from "../../../frontend/src/views/map/labels";
import {
  clusterColor,
  type RegionBlob,
} from "../../../frontend/src/views/map/regions";
import {
  dotScale,
  linksOf,
  type GraphLink,
} from "../../../frontend/src/views/map/edges";
import {
  DOT_RADIUS,
  DOT_RADIUS_MAX,
  DOT_RADIUS_TOP,
  HOVER_DIM,
  LINK_IN,
  LINK_OUT,
  LINK_WIDTH,
  TITLE_FONT_SIZE,
  TITLE_HEIGHT,
  TITLE_MARGIN_X,
  TITLE_MARGIN_Y,
  TITLE_OFFSET_X,
  titleFontRenderer,
} from "../../../frontend/src/views/map/style";
import { SnapTextExtension } from "../../../frontend/src/views/map/text-snap";
import { RegionGradientExtension } from "../../../frontend/src/views/map/region-gradient";
import { useDeckFrameSync } from "./frame-sync";
import { HEIGHT, WIDTH, type MapModel, type Point } from "./model";

const view = new OrthographicView({ id: "research-map" });
const snapText = new SnapTextExtension(),
  regionGradient = new RegionGradientExtension(),
  yearFilter = new DataFilterExtension({ filterSize: 1 });

// 영역 이름 묶음이 바뀌는 배율(기준 대비). 앱은 문턱에서 묶음을 바꾸고 CSS가 240ms
// 교차 페이드한다(`labelLevel`, MapView의 regionSet). 영상은 시간 대신 배율로 잇는다:
// 문턱 ±REGION_FADE/2 안에서 두 묶음이 교차 페이드한다.
const REGION_STEPS = [-Infinity, 1, 2, Infinity],
  REGION_FADE = 0.5;
const ramp = (v: number) => Math.min(1, Math.max(0, v));

export interface Camera {
  target: [number, number, number];
  zoom: number;
}
// 강조 노드의 인용선. 앱의 호버(MapView `hoverT`·`front`)와 같은 뜻의 값을 프레임에서
// 계산해 넘긴다.
export interface Focus {
  index: number;
  /** 강조가 켜진 정도 0~1(앱의 `hoverT`). */
  t: number;
  /** 강조 노드에서 뻗어 나간 연결선 앞머리(지도 단위). */
  front: number;
  /** 이웃이 선에 닿은 뒤 다 켜질 때까지의 거리(지도 단위, 앱의 `fadeWorld`). */
  fadeWorld: number;
}
// 에이전트 주석(앱의 `annotate` 결과). 지도 좌표와 라벨, 켜진 정도(0~1).
export interface Annotation {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: "paper" | "cluster";
  alpha: number;
}
interface Title {
  i: number;
  text: string;
  value: string;
  valueDx: number;
  position: [number, number];
  dy: number;
  alpha: number;
}

export function MapScene({
  model,
  camera,
  focus,
  width = WIDTH,
  yearHead,
  annotations = [],
  labels = true,
}: {
  model: MapModel;
  camera: Camera;
  focus?: Focus;
  /** 지도 폭(CSS px). 오른쪽에 패널이 열리면 줄어든다(앱과 같다). */
  width?: number;
  /** 연도 재생 헤드(소수 연도). 없으면 모든 논문. 앱의 재생 헤드와 같은 필터를 건다. */
  yearHead?: number;
  annotations?: Annotation[];
  /** 영역 이름과 논문 제목을 그릴지(엔딩 카드의 배경 지도는 끈다). */
  labels?: boolean;
}) {
  const { deck, onAfterRender } = useDeckFrameSync();
  const { map, points, topCited, metrics, reveals } = model;
  const size = { width, height: HEIGHT };
  // 기준 배율은 지도 폭에 따른다(앱의 homeCamera). 제목이 켜지는 배율(reveals)은 전체 폭
  // 기준으로 한 번 잰 값을 쓴다 — 앱도 폭이 바뀌는 동안은 이전 값을 쓴다(settledHome).
  const home = useMemo(
    () => (width === WIDTH ? model.home : homeCamera(map, width, HEIGHT)),
    [model, map, width],
  );
  // 연도 재생: 헤드까지의 논문만(연도 없는 논문은 늘). 영역 배경과 이름은 그 비율을 따른다.
  const share = useMemo(
    () => (yearHead === undefined ? null : clusterShare(model, yearHead)),
    [model, yearHead],
  );
  const alive = useMemo(
    () =>
      share
        ? new Set(
            [...model.regionClusters]
              .filter(([, cs]) => [...cs].some((c) => (share.get(c) ?? 0) > 0))
              .map(([id]) => id),
          )
        : model.alive,
    [model, share],
  );
  const viewport = new OrthographicViewport({ ...camera, ...size });
  const relativeZoom = camera.zoom - home.zoom;
  const level = labelLevel(relativeZoom);
  const scale = dotScale(relativeZoom);

  // 영역 이름: 묶음마다 앱과 같은 규칙(`placeRegionLabels`)으로 놓고, 교차 페이드 무게와
  // 앱의 옅어짐(논문 제목이 켜지는 만큼 꺼진다)을 곱한다.
  const regionOpacity = 1 - paperLabelOpacity(relativeZoom);
  const regionNames = model.regions.flatMap((items, k) => {
    const lo = REGION_STEPS[k],
      hi = REGION_STEPS[k + 1];
    const weight =
      ramp((relativeZoom - lo) / REGION_FADE + 0.5) *
      ramp((hi - relativeZoom) / REGION_FADE + 0.5);
    if (!labels || weight <= 0 || regionOpacity <= 0) return [];
    const placed = placeRegionLabels(
      items,
      viewport,
      size,
      model.radii,
      alive,
      relativeZoom,
    );
    return items
      .filter((n) => placed.has(n.id))
      .map((n) => ({
        key: `${k}:${n.id}`,
        label: n.label,
        at: placed.get(n.id)!,
        opacity: weight * regionOpacity,
      }));
  });
  // 하위 분야 단계인데 화면에 영역 이름이 하나도 없으면 제목의 바닥을 없앤다(앱의
  // `regionless`). 앱은 240ms에 걸쳐 잇고, 영상은 그 프레임에서 바로 바꾼다.
  const current = REGION_STEPS.findIndex((s) => relativeZoom < s) - 1;
  const regionless =
    level === "topic" &&
    placeRegionLabels(
      model.regions[current],
      viewport,
      size,
      model.radii,
      alive,
      relativeZoom,
    ).size === 0
      ? 1
      : 0;
  const paperFloor =
    level === "field" ? Infinity : home.zoom + PAPER_LABEL_ZOOM - 0.5;

  // 논문 제목: 화면 안(제목 폭만큼 여유)에서 지금 불투명도가 0보다 큰 것.
  const titles: Title[] = [];
  if (
    labels &&
    yearHead === undefined &&
    (level !== "field" || regionless > 0)
  ) {
    const s = 2 ** camera.zoom,
      hx = (size.width / 2 + TITLE_MARGIN_X) / s,
      hy = (HEIGHT / 2 + TITLE_MARGIN_Y) / s;
    model.boxes.forEach((b, k) => {
      if (
        Math.abs(b.x - camera.target[0]) > hx ||
        Math.abs(b.y - camera.target[1]) > hy
      )
        return;
      const alpha =
        255 *
        paperTitleOpacity(camera.zoom, reveals.zoom[k], paperFloor, regionless);
      if (alpha <= 0) return;
      titles.push({
        i: b.i,
        text: metrics.displays[b.i],
        value: metrics.values[b.i],
        valueDx: metrics.valueDx[b.i],
        position: [b.x, b.y],
        dy: TITLE_HEIGHT * reveals.row[k],
        alpha,
      });
    });
  }

  const colors = useMemo(
    () =>
      points.map(
        (p) =>
          [...clusterColor(map.cluster[p.i]), 205] as [
            number,
            number,
            number,
            number,
          ],
      ),
    [points, map],
  );
  const baseRadius = (p: { i: number }) =>
    topCited[p.i] ? DOT_RADIUS_TOP : DOT_RADIUS;

  // 강조 노드의 인용선(앱의 1홉 그래프). 참조는 강조 노드 → 이웃, 피인용은 이웃 → 강조 노드.
  const held = focus?.index ?? -1;
  const graph = useMemo(() => {
    if (held < 0) return { nodes: [] as number[], links: [] as GraphLink[] };
    const links: GraphLink[] = linksOf(model.index, held).map((l) =>
      l.incoming
        ? { a: l.j, b: held, seed: true }
        : { a: held, b: l.j, seed: true },
    );
    const nodes = [
      held,
      ...new Set(links.map((l) => (l.a === held ? l.b : l.a))),
    ];
    return { nodes, links };
  }, [held, model.index]);
  const linkLength = useMemo(() => {
    const out = new Map<number, number>();
    for (const i of graph.nodes)
      if (i !== held)
        out.set(i, Math.hypot(map.x[i] - map.x[held], map.y[i] - map.y[held]));
    return out;
  }, [graph, held, map]);
  const hoverT = focus?.t ?? 0,
    front = focus?.front ?? 0;
  // 강조한 논문의 제목은 강조가 켜진 만큼 진하게 둔다. 앱은 이 자리에 강조 라벨(제목 전문
  // 타이핑)을 따로 그리는데, 영상은 지도 제목 하나로 대신한다.
  if (labels && held >= 0 && hoverT > 0) {
    const k = model.boxOf[held];
    const t = titles.find((x) => x.i === held);
    if (t) t.alpha = Math.max(t.alpha, 255 * hoverT);
    else if (k >= 0) {
      const b = model.boxes[k];
      titles.push({
        i: held,
        text: metrics.displays[held],
        value: metrics.values[held],
        valueDx: metrics.valueDx[held],
        position: [b.x, b.y],
        dy: TITLE_HEIGHT * reveals.row[k],
        alpha: 255 * hoverT,
      });
    }
  }
  const linked = (i: number) =>
    hoverT * ramp((front - (linkLength.get(i) ?? 0)) / (focus?.fadeWorld ?? 1));

  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const fontSettings = useMemo(
    () => ({ fontSize: TITLE_FONT_SIZE * dpr, sdf: false }),
    [dpr],
  );
  const getFontRenderer = useMemo(
    () => () => titleFontRenderer(model.typo.fontFamily, dpr),
    [model.typo, dpr],
  );
  const textCommon = {
    characterSet: model.characterSet,
    fontFamily: model.typo.fontFamily,
    fontSettings,
    _getFontRenderer: getFontRenderer,
    extensions: [snapText],
    sizeUnits: "pixels" as const,
    getSize: TITLE_FONT_SIZE,
    getTextAnchor: "start" as const,
    getAlignmentBaseline: "center" as const,
  };

  const layers = [
    // 영역 배경(앱의 `soft-regions`, 주제 색 모드).
    new ScatterplotLayer<RegionBlob>({
      id: "soft-regions",
      data: model.blobs,
      getPosition: (b) => b.position,
      getRadius: (b) => b.radius,
      radiusUnits: "common",
      getFillColor: (b) => [
        ...b.color,
        Math.round(255 * (share ? (share.get(b.id) ?? 0) : 1)),
      ],
      updateTriggers: { getFillColor: [share] },
      antialiasing: false,
      opacity: 0.7,
      extensions: [regionGradient],
    }),
    new ScatterplotLayer<Point, DataFilterExtensionProps<Point>>({
      id: "papers",
      // 앱의 재생 헤드와 같은 필터: 헤드 해의 논문은 소프트 범위로 옅게 켜진다.
      extensions: [yearFilter],
      filterEnabled: yearHead !== undefined,
      getFilterValue: (p) => {
        const y = map.year[p.i];
        return y === null ? model.yearLower - 1 : y;
      },
      filterRange: [model.yearLower - 1, yearHead ?? Infinity],
      filterSoftRange:
        yearHead === undefined
          ? undefined
          : [model.yearLower - 1, yearHead - 1],
      data: points,
      getPosition: (p) => p.position,
      getFillColor: (p) => colors[p.i],
      getRadius: baseRadius,
      radiusUnits: "pixels",
      radiusScale: scale,
      radiusMinPixels: 1.3,
      radiusMaxPixels: DOT_RADIUS_MAX,
      stroked: true,
      getLineColor: [255, 255, 255, 235],
      getLineWidth: (p) => (topCited[p.i] ? 1 : 0),
      lineWidthUnits: "pixels",
      opacity: 1 - HOVER_DIM * hoverT,
    }),
    held >= 0 &&
      new LineLayer<GraphLink>({
        id: "hover-links",
        data: graph.links,
        getSourcePosition: (l) =>
          l.b === held ? points[l.b].position : points[l.a].position,
        getTargetPosition: (l) => {
          const from = l.b === held ? points[l.b] : points[l.a],
            to = l.b === held ? points[l.a] : points[l.b];
          const len = linkLength.get(to.i) ?? 0,
            f = len > 0 ? Math.min(1, front / len) : 1;
          return [
            from.position[0] + (to.position[0] - from.position[0]) * f,
            from.position[1] + (to.position[1] - from.position[1]) * f,
            0,
          ];
        },
        getColor: (l) => {
          const c = l.a === held ? LINK_OUT : LINK_IN;
          return [c[0], c[1], c[2], 255 * hoverT];
        },
        getWidth: LINK_WIDTH,
        widthUnits: "pixels",
        updateTriggers: {
          getTargetPosition: [front],
          getColor: [hoverT],
        },
      }),
    held >= 0 &&
      new ScatterplotLayer<Point>({
        id: "hover-nodes",
        data: graph.nodes.map((i) => points[i]),
        getPosition: (p) => p.position,
        getFillColor: (p) =>
          p.i === held
            ? [255, 255, 255, 255 * hoverT]
            : [
                colors[p.i][0],
                colors[p.i][1],
                colors[p.i][2],
                colors[p.i][3] * linked(p.i),
              ],
        getRadius: baseRadius,
        radiusUnits: "pixels",
        radiusScale: scale,
        radiusMinPixels: 1.3,
        radiusMaxPixels: DOT_RADIUS_MAX,
        stroked: true,
        getLineColor: (p) => [
          255,
          255,
          255,
          235 * (p.i === held ? hoverT : linked(p.i)),
        ],
        getLineWidth: (p) => (topCited[p.i] ? 1 : 0),
        lineWidthUnits: "pixels",
        updateTriggers: {
          getFillColor: [hoverT, front],
          getLineColor: [hoverT, front],
        },
      }),
    new TextLayer<Title>({
      ...textCommon,
      id: "paper-titles",
      data: titles,
      getText: (t) => t.text,
      getPosition: (t) => t.position,
      getPixelOffset: (t) => [TITLE_OFFSET_X, t.dy],
      getColor: (t) => [...model.typo.color, Math.round(t.alpha)],
      updateTriggers: { getColor: [camera.zoom, regionless] },
    }),
    new TextLayer<Title>({
      ...textCommon,
      id: "paper-values",
      data: titles,
      getText: (t) => t.value,
      getPosition: (t) => t.position,
      getPixelOffset: (t) => [t.valueDx, t.dy],
      getColor: (t) => [
        colors[t.i][0],
        colors[t.i][1],
        colors[t.i][2],
        Math.round(t.alpha),
      ],
      updateTriggers: { getColor: [camera.zoom, regionless] },
    }),
  ];

  return (
    <div className="map-ground" style={{ width, right: "auto" }}>
      <DeckGL
        ref={deck}
        views={view}
        viewState={camera}
        layers={layers}
        onAfterRender={onAfterRender}
      />
      {regionNames.map((r) => (
        <div
          key={r.key}
          className="region-name"
          style={{ left: r.at[0], top: r.at[1], opacity: r.opacity }}
        >
          {r.label}
        </div>
      ))}
      {annotations.length > 0 && (
        <svg className="map-annotations">
          {annotations.map((n) => {
            // 앱(MapView)과 같은 자리: 점의 오른쪽 위, 화면 밖이면 반대쪽으로 꺾는다.
            const [px, py] = viewport.project([n.x, n.y, 0]);
            const dx = px > size.width - 200 ? -36 : 36,
              dy = py < 60 ? 36 : -36;
            const lx = px + dx,
              ly = py + dy;
            return (
              <g
                key={n.id}
                className="map-annotation"
                style={{ opacity: n.alpha }}
              >
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
    </div>
  );
}

// 주제마다 헤드까지 그려지는 논문 비율(앱 MapView의 `clusterShare`). 헤드 해의 논문은
// 소수 부분만큼 센다 — 필터의 소프트 범위와 같이 해마다 계단 없이 는다.
function clusterShare(model: MapModel, head: number): Map<number, number> {
  const { map } = model;
  const total = new Map<number, number>(),
    shown = new Map<number, number>();
  for (let i = 0; i < map.n; i++) {
    const c = map.cluster[i],
      y = map.year[i];
    total.set(c, (total.get(c) ?? 0) + 1);
    const w = y === null ? 1 : Math.min(1, Math.max(0, head - y + 1));
    if (w > 0) shown.set(c, (shown.get(c) ?? 0) + w);
  }
  const out = new Map<number, number>();
  for (const [c, n] of total) out.set(c, (shown.get(c) ?? 0) / n);
  return out;
}
