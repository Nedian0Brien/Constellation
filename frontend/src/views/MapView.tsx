import { useMemo, useState, useEffect, useRef } from "react";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { OrthographicView } from "@deck.gl/core";
import { useStore } from "../store";

const YEAR_RAMP: [number, number, number][] = [
  [ 31,  74, 106], [ 27, 110, 133], [ 42, 145, 140],
  [ 92, 176, 122], [175, 199,  84], [246, 213,  53],
];
const CITED_RAMP: [number, number, number][] = [
  [ 60,  72,  88], [ 71, 105, 145], [ 74, 145, 168],
  [110, 182, 160], [200, 200, 110], [232, 154,  70],
];
const HAS_ABS: [number, number, number] = [42, 145, 140];
const NO_ABS: [number, number, number] = [206, 106, 96];
const NOISE: [number, number, number] = [104, 116, 130];

type RGB = [number, number, number];

function ramp(t: number, stops: RGB[]): RGB {
  const c = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(Math.floor(c), stops.length - 2);
  const f = c - i;
  const a = stops[i], b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function hsl(h: number, s: number, l: number): RGB {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) =>
    L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// 45개 덩어리를 구분하려면 색상환을 황금각으로 돌아야 인접 색이 안 겹친다.
function clusterColor(id: number): RGB {
  if (id < 0) return NOISE;
  return hsl((id * 137.508) % 360, 52 + (id % 3) * 9, 55 + (id % 4) * 4);
}

const rgbStr = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** 연도 → 0..1. 선형 min-max가 아니라 분위 척도다.
 *
 *  코퍼스는 2014–2026에 92%가 몰려 있고 backfill로 들어온 1945–2013이
 *  꼬리를 만든다. 선형으로 칠하면 실제로 보고 싶은 13년이 색상 범위의
 *  16%에 압축되어 전부 노란색이 된다. 논문 수 기준으로 나누면 색이
 *  고르게 퍼지고, 대신 색 간격이 시간 간격과 비례하지 않는다 —
 *  그래서 범례 눈금도 분위 위치에 찍는다.
 */
function useYearScale(years: (number | null)[] | undefined) {
  return useMemo(() => {
    if (!years) return null;
    const ys = years.filter((y): y is number => y != null).sort((a, b) => a - b);
    if (!ys.length) return null;
    const n = ys.length;
    const pos = new Map<number, number>();
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && ys[j] === ys[i]) j++;
      pos.set(ys[i], (i + j) / 2 / n);   // 동률 구간의 중앙
      i = j;
    }
    const quantile = (q: number) => ys[Math.min(n - 1, Math.floor(q * n))];
    return { pos, quantile, min: ys[0], max: ys[n - 1] };
  }, [years]);
}

function Legend() {
  const map = useStore((s) => s.map);
  const colorBy = useStore((s) => s.colorBy);
  const clusters = useStore((s) => s.clusters);
  const scale = useYearScale(map?.year);
  if (!map) return null;

  if (colorBy === "cluster") {
    const noise = map.cluster.filter((c) => c < 0).length;
    return (
      <div className="legend">
        <div className="lg-title">주제 덩어리</div>
        <div className="lg-swatches">
          {clusters.slice(0, 12).map((c) => (
            <i key={c.cluster_id}
               style={{ background: rgbStr(clusterColor(c.cluster_id)) }}
               title={`${c.label} (${c.size.toLocaleString()}편)`} />
          ))}
        </div>
        <div className="lg-note">
          {clusters.length}개 덩어리 · 미분류 {noise.toLocaleString()}편 (
          {Math.round((noise / map.n) * 100)}%). 라벨을 클릭하면 그 덩어리만 남는다.
        </div>
      </div>
    );
  }

  if (colorBy === "abstract") {
    const nNo = map.has_abstract.filter((h) => !h).length;
    return (
      <div className="legend">
        <div className="lg-title">초록 유무</div>
        <div className="lg-cats">
          <span><i style={{ background: rgbStr(HAS_ABS) }} />있음 {(map.n - nNo).toLocaleString()}</span>
          <span><i style={{ background: rgbStr(NO_ABS) }} />없음 {nNo.toLocaleString()}</span>
        </div>
        <div className="lg-note">초록이 없으면 제목만으로 임베딩된다 — 위치 신뢰도가 낮다.</div>
      </div>
    );
  }

  if (colorBy === "year") {
    const grad = `linear-gradient(to right, ${YEAR_RAMP.map(rgbStr).join(",")})`;
    const ticks = scale ? [0, 0.25, 0.5, 0.75, 0.999].map(scale.quantile) : [];
    return (
      <div className="legend">
        <div className="lg-title">발행연도</div>
        <div className="lg-bar" style={{ background: grad }} />
        <div className="lg-ticks">
          {ticks.map((y, i) => <span key={i}>{y}</span>)}
        </div>
        <div className="lg-note">
          논문 수 기준 분위 척도 — 눈금은 균등하지만 연도 간격은 다르다.
          코퍼스의 92%가 2014년 이후라 선형으로 칠하면 전부 같은 색이 된다.
        </div>
      </div>
    );
  }

  const grad = `linear-gradient(to right, ${CITED_RAMP.map(rgbStr).join(",")})`;
  return (
    <div className="legend">
      <div className="lg-title">피인용수</div>
      <div className="lg-bar" style={{ background: grad }} />
      <div className="lg-ends">
        <span>0</span>
        <span>{Math.max(...map.cited).toLocaleString()}</span>
      </div>
      <div className="lg-note">로그 척도. 점 크기도 피인용수를 따른다.</div>
    </div>
  );
}

export default function MapView() {
  const map = useStore((s) => s.map);
  const colorBy = useStore((s) => s.colorBy);
  const yearRange = useStore((s) => s.yearRange);
  const selected = useStore((s) => s.selected);
  const highlighted = useStore((s) => s.highlighted);
  const select = useStore((s) => s.select);
  const clusters = useStore((s) => s.clusters);
  const selectedCluster = useStore((s) => s.selectedCluster);
  const selectCluster = useStore((s) => s.selectCluster);
  const tree = useStore((s) => s.tree);
  const selectedNode = useStore((s) => s.selectedNode);

  const [viewState, setViewState] = useState<any>(null);
  const [hoverInfo, setHoverInfo] = useState<any>(null);
  const home = useRef<any>(null);
  const scale = useYearScale(map?.year);

  const positions = useMemo(() => {
    if (!map) return null;
    const a = new Float32Array(map.n * 2);
    for (let i = 0; i < map.n; i++) {
      a[i * 2] = map.x[i];
      a[i * 2 + 1] = map.y[i];
    }
    return a;
  }, [map]);

  // run이 바뀌면 좌표계 자체가 달라진다. 홈 뷰를 다시 잡아야 한다.
  useEffect(() => {
    if (!map || home.current?.run === map.run_id) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < map.n; i++) {
      if (map.x[i] < minX) minX = map.x[i];
      if (map.x[i] > maxX) maxX = map.x[i];
      if (map.y[i] < minY) minY = map.y[i];
      if (map.y[i] > maxY) maxY = map.y[i];
    }
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const vs = {
      target: [(minX + maxX) / 2, (minY + maxY) / 2, 0],
      zoom: Math.log2(620 / span),
      minZoom: -4,
      maxZoom: 12,
    };
    home.current = { ...vs, run: map.run_id };
    setViewState(vs);
  }, [map]);

  // 트리에서 가지를 고르면 그 아래 잎 클러스터들만 지도에 남긴다.
  const nodeClusters = useMemo(() => {
    if (!tree || selectedNode == null) return null;
    const byId = new Map(tree.nodes.map((n) => [n.id, n]));
    const out = new Set<number>();
    const stack = [selectedNode];
    while (stack.length) {
      const n = byId.get(stack.pop()!);
      if (!n) continue;
      if (n.cluster_id != null) out.add(n.cluster_id);
      if (n.left != null) stack.push(n.left);
      if (n.right != null) stack.push(n.right);
    }
    return out;
  }, [tree, selectedNode]);

  const colors = useMemo(() => {
    if (!map) return null;
    const out = new Uint8Array(map.n * 4);
    const maxLog = Math.log1p(Math.max(1, ...map.cited));

    for (let i = 0; i < map.n; i++) {
      let c: RGB;
      if (colorBy === "cluster") {
        c = clusterColor(map.cluster[i]);
      } else if (colorBy === "year") {
        const y = map.year[i];
        c = y == null ? NOISE : ramp(scale?.pos.get(y) ?? 0.5, YEAR_RAMP);
      } else if (colorBy === "cited") {
        c = ramp(Math.log1p(map.cited[i]) / maxLog, CITED_RAMP);
      } else {
        c = map.has_abstract[i] ? HAS_ABS : NO_ABS;
      }

      const y = map.year[i];
      const inRange = y == null || (y >= yearRange[0] && y <= yearRange[1]);
      const isSel = map.id[i] === selected;
      const inCluster = selectedCluster == null || map.cluster[i] === selectedCluster;
      const isHi = highlighted.size > 0 && highlighted.has(map.id[i]);

      let alpha = inRange ? 190 : 16;
      if (nodeClusters && inRange)
        alpha = nodeClusters.has(map.cluster[i]) ? 235 : 20;
      if (selectedCluster != null && inRange) alpha = inCluster ? 235 : 22;
      if (highlighted.size > 0 && inRange) alpha = isHi ? 240 : 26;
      if (isSel) alpha = 255;

      out[i * 4] = isSel ? 255 : c[0];
      out[i * 4 + 1] = isSel ? 255 : c[1];
      out[i * 4 + 2] = isSel ? 255 : c[2];
      out[i * 4 + 3] = alpha;
    }
    return out;
  }, [map, colorBy, yearRange, selected, highlighted, selectedCluster, scale, nodeClusters]);

  const radii = useMemo(() => {
    if (!map) return null;
    const a = new Float32Array(map.n);
    const maxLog = Math.log1p(Math.max(1, ...map.cited));
    for (let i = 0; i < map.n; i++) {
      a[i] = 1.4 + 3.4 * (Math.log1p(map.cited[i]) / maxLog);
    }
    return a;
  }, [map]);

  // 45개 라벨을 한꺼번에 띄우면 읽을 수 없다. 줌에 따라 늘린다.
  const visibleLabels = useMemo(() => {
    if (!clusters.length || !viewState || !home.current) return [];
    const step = viewState.zoom - home.current.zoom;
    const k = Math.round(Math.max(6, Math.min(clusters.length, 6 * Math.pow(1.9, step))));
    return clusters.slice(0, k);
  }, [clusters, viewState]);

  if (!map || !positions || !colors || !radii || !viewState) {
    return <div className="map-empty">지도를 불러오는 중…</div>;
  }

  const layers: any[] = [
    new ScatterplotLayer({
      id: "works",
      data: {
        length: map.n,
        attributes: {
          getPosition: { value: positions, size: 2 },
          getFillColor: { value: colors, size: 4 },
          getRadius: { value: radii, size: 1 },
        },
      } as any,
      radiusUnits: "pixels",
      radiusMinPixels: 1.4,
      radiusMaxPixels: 16,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 255],
      updateTriggers: {
        getFillColor: [colorBy, yearRange, selected, highlighted, selectedCluster, selectedNode],
      },
      onHover: (info: any) => setHoverInfo(info?.index >= 0 ? info : null),
      onClick: (info: any) => {
        if (info?.index >= 0) select(map.id[info.index]);
      },
    }),
  ];

  if (visibleLabels.length) {
    layers.push(
      new TextLayer({
        id: "cluster-labels",
        data: visibleLabels,
        getPosition: (d: any) => [d.x, d.y],
        getText: (d: any) => d.label,
        getSize: 11.5,
        sizeUnits: "pixels",
        getColor: (d: any) =>
          selectedCluster == null || d.cluster_id === selectedCluster
            ? [232, 238, 245, 255]
            : [232, 238, 245, 70],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        background: true,
        getBackgroundColor: (d: any) =>
          d.cluster_id === selectedCluster ? [16, 51, 58, 235] : [12, 17, 23, 195],
        backgroundPadding: [5, 3, 5, 3],
        fontFamily: '"IBM Plex Sans KR", system-ui, sans-serif',
        characterSet: "auto",
        maxWidth: 220,
        pickable: true,
        updateTriggers: {
          getColor: [selectedCluster],
          getBackgroundColor: [selectedCluster],
        },
        onClick: (info: any) => {
          const d = info?.object;
          if (d) selectCluster(selectedCluster === d.cluster_id ? null : d.cluster_id);
        },
      }),
    );
  }

  const atHome =
    home.current &&
    Math.abs(viewState.zoom - home.current.zoom) < 0.01 &&
    Math.abs(viewState.target[0] - home.current.target[0]) < 0.01 &&
    Math.abs(viewState.target[1] - home.current.target[1]) < 0.01;

  return (
    <div className="map-wrap">
      <DeckGL
        views={new OrthographicView({ id: "ortho" })}
        viewState={viewState}
        onViewStateChange={({ viewState: vs }: any) => setViewState(vs)}
        controller={{ dragRotate: false }}
        layers={layers}
        getCursor={({ isDragging }: any) =>
          isDragging ? "grabbing" : hoverInfo ? "pointer" : "grab"
        }
      />

      <Legend />

      {!atHome && (
        <button className="reset" onClick={() => setViewState({ ...home.current })}>
          전체 보기로
        </button>
      )}

      {selectedCluster != null && (
        <button className="clearcl" onClick={() => selectCluster(null)}>
          덩어리 선택 해제
        </button>
      )}

      {!hoverInfo && selectedCluster == null && (
        <div className="hint">
          점 위에 올리면 논문, 클릭하면 상세. 라벨을 누르면 그 덩어리만 남는다.
        </div>
      )}

      {hoverInfo && (
        <div className="tooltip" style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 14 }}>
          <div className="tt-title">{map.title[hoverInfo.index]}</div>
          <div className="tt-meta">
            {map.year[hoverInfo.index] ?? "연도 미상"} · 피인용{" "}
            {map.cited[hoverInfo.index].toLocaleString()}
            {map.cluster[hoverInfo.index] >= 0 &&
              " · " +
                (clusters.find((c) => c.cluster_id === map.cluster[hoverInfo.index])
                  ?.label ?? `덩어리 ${map.cluster[hoverInfo.index]}`)}
            {!map.has_abstract[hoverInfo.index] && " · 초록 없음"}
          </div>
        </div>
      )}
    </div>
  );
}
