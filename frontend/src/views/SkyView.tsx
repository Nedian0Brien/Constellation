import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { PointCloudLayer, LineLayer } from "@deck.gl/layers";
import { OrbitView, COORDINATE_SYSTEM } from "@deck.gl/core";
import { fetchLineage, type LineageData } from "../api";
import { useStore } from "../store";

type RGB = [number, number, number];
const NOISE: RGB = [104, 116, 130];

function hsl(h: number, s: number, l: number): RGB {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) =>
    L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const clusterColor = (id: number): RGB =>
  id < 0 ? NOISE : hsl((id * 137.508) % 360, 52 + (id % 3) * 9, 55 + (id % 4) * 4);

export default function SkyView() {
  const map = useStore((s) => s.map);
  const clusters = useStore((s) => s.clusters);
  const select = useStore((s) => s.select);
  const run = map?.run_id;

  const [viewState, setViewState] = useState<any>(null);
  const [hover, setHover] = useState<any>(null);
  const [showLines, setShowLines] = useState(true);
  const [spin, setSpin] = useState(false);
  const [lin, setLin] = useState<LineageData | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!run) return;
    let alive = true;
    fetchLineage(run).then((d) => alive && setLin(d)).catch(() => alive && setLin(null));
    return () => { alive = false; };
  }, [run]);

  // 3D는 z가 있어야 의미가 있다. 데이터 범위에 맞춰 첫 시점을 잡는다.
  useEffect(() => {
    if (!map || viewState) return;
    const c = (a: number[]) => (Math.min(...a) + Math.max(...a)) / 2;
    const span = Math.max(
      Math.max(...map.x) - Math.min(...map.x),
      Math.max(...map.y) - Math.min(...map.y),
      Math.max(...map.z) - Math.min(...map.z),
    ) || 1;
    setViewState({
      target: [c(map.x), c(map.y), c(map.z)],
      zoom: Math.log2(520 / span),
      rotationX: 22, rotationOrbit: -25,
      minZoom: -4, maxZoom: 12,
    });
  }, [map, viewState]);

  useEffect(() => {
    if (!spin) {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    const tick = () => {
      setViewState((v: any) =>
        v ? { ...v, rotationOrbit: (v.rotationOrbit + 0.22) % 360 } : v);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [spin]);

  const points = useMemo(() => {
    if (!map) return null;
    const pos = new Float32Array(map.n * 3);
    const col = new Uint8Array(map.n * 3);
    for (let i = 0; i < map.n; i++) {
      pos[i * 3] = map.x[i];
      pos[i * 3 + 1] = map.y[i];
      pos[i * 3 + 2] = map.z[i];
      const c = clusterColor(map.cluster[i]);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    return { pos, col };
  }, [map]);

  // 별자리 선 — 메인패스 인용을 잇는다. 6만 개를 다 그리면 아무것도 안 보인다.
  const lines = useMemo(() => {
    if (!map || !lin) return [];
    const at = new Map<string, [number, number, number]>();
    for (let i = 0; i < map.n; i++) at.set(map.id[i], [map.x[i], map.y[i], map.z[i]]);
    return lin.edges
      .filter((e) => e.main)
      .map((e) => ({ s: at.get(e.from), t: at.get(e.to) }))
      .filter((e) => e.s && e.t) as { s: number[]; t: number[] }[];
  }, [map, lin]);

  if (!map || !points || !viewState) {
    return <div className="map-empty">3D를 불러오는 중…</div>;
  }

  const layers: any[] = [
    new PointCloudLayer({
      id: "sky",
      data: {
        length: map.n,
        attributes: {
          getPosition: { value: points.pos, size: 3 },
          getColor: { value: points.col, size: 3 },
        },
      } as any,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      pointSize: 2.6,
      opacity: 0.85,
      pickable: true,
      onHover: (i: any) => setHover(i?.index >= 0 ? i : null),
      onClick: (i: any) => { if (i?.index >= 0) select(map.id[i.index]); },
    }),
  ];

  if (showLines && lines.length) {
    layers.push(
      new LineLayer({
        id: "constellation",
        data: lines,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getSourcePosition: (d: any) => d.s,
        getTargetPosition: (d: any) => d.t,
        getColor: [70, 192, 200, 190],
        getWidth: 1.8,
        widthUnits: "pixels",
      }),
    );
  }

  return (
    <div className="map-wrap">
      <DeckGL
        views={new OrbitView({ id: "orbit", orbitAxis: "Y" })}
        viewState={viewState}
        onViewStateChange={({ viewState: v }: any) => setViewState(v)}
        controller={true}
        layers={layers}
        getCursor={({ isDragging }: any) => (isDragging ? "grabbing" : hover ? "pointer" : "grab")}
      />

      <div className="sky-ctl">
        <button className={showLines ? "on" : ""} onClick={() => setShowLines((v) => !v)}>
          별자리 선 {lines.length ? `(${lines.length})` : ""}
        </button>
        <button className={spin ? "on" : ""} onClick={() => setSpin((v) => !v)}>
          자동 회전
        </button>
      </div>

      <div className="legend">
        <div className="lg-title">3D 조망</div>
        <div className="lg-note">
          드래그로 회전, 휠로 확대. 색은 주제 덩어리({clusters.length}개).
          선은 인용 메인패스다.
          <br /><br />
          겹침 때문에 정밀 분석에는 2D 지도가 낫다. 여기는 전체 구조를 보는 자리다.
        </div>
      </div>

      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="tt-title">{map.title[hover.index]}</div>
          <div className="tt-meta">
            {map.year[hover.index] ?? "연도 미상"} · 피인용{" "}
            {map.cited[hover.index].toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
