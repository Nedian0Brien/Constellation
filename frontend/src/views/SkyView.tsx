import { clusterColor } from "./map/regions";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useQuery } from "@tanstack/react-query";
import { DataState } from "../components/DataState";
import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { PointCloudLayer, LineLayer } from "@deck.gl/layers";
import { OrbitView, COORDINATE_SYSTEM } from "@deck.gl/core";
import { fetchLineage } from "../api";
import { useWorkspace } from "../hooks/use-workspace";

export default function SkyView() {
  const workspace = useWorkspace();
  const reduced = useReducedMotion();
  const map = workspace.map;
  const clusters = workspace.clusters;
  const select = workspace.select;
  const run = map?.run_id;

  const [viewState, setViewState] = useState<any>(() => {
    if (!map) return null;
    const c = (a: number[]) => (Math.min(...a) + Math.max(...a)) / 2;
    const span =
      Math.max(
        Math.max(...map.x) - Math.min(...map.x),
        Math.max(...map.y) - Math.min(...map.y),
        Math.max(...map.z) - Math.min(...map.z),
      ) || 1;
    return {
      target: [c(map.x), c(map.y), c(map.z)],
      zoom: Math.log2(520 / span),
      rotationX: 22,
      rotationOrbit: -25,
      minZoom: -4,
      maxZoom: 12,
    };
  });
  const [hover, setHover] = useState<any>(null);
  const [showLines, setShowLines] = useState(true);
  const [spin, setSpin] = useState(false);
  const lineage = useQuery({
    queryKey: ["lineage", run, null],
    queryFn: ({ signal }) => fetchLineage(run!, undefined, 2, signal),
    enabled: !!run,
  });
  const lin = lineage.data;
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!spin || reduced) {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    const tick = () => {
      setViewState((v: any) =>
        v ? { ...v, rotationOrbit: (v.rotationOrbit + 0.22) % 360 } : v,
      );
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [spin, reduced]);

  const points = useMemo(() => {
    if (!map) return null;
    const pos = new Float32Array(map.n * 3);
    const col = new Uint8Array(map.n * 3);
    for (let i = 0; i < map.n; i++) {
      pos[i * 3] = map.x[i];
      pos[i * 3 + 1] = map.y[i];
      pos[i * 3 + 2] = map.z[i];
      const c =
        map.id[i] === workspace.selected
          ? [255, 255, 255]
          : clusterColor(map.cluster[i]);
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
    return { pos, col };
  }, [map, workspace.selected]);

  // 별자리 선 — 메인패스 인용을 잇는다. 6만 개를 다 그리면 아무것도 안 보인다.
  const lines = useMemo(() => {
    if (!map || !lin) return [];
    const at = new Map<string, [number, number, number]>();
    for (let i = 0; i < map.n; i++)
      at.set(map.id[i], [map.x[i], map.y[i], map.z[i]]);
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
      onClick: (i: any) => {
        if (i?.index >= 0) select(map.id[i.index]);
      },
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
      {showLines && lineage.isError && (
        <div className="sky-status">
          <DataState
            error={lineage.error}
            retry={() => lineage.refetch()}
            title="인용선이 없습니다"
          />
        </div>
      )}
      <DeckGL
        views={new OrbitView({ id: "orbit", orbitAxis: "Y" })}
        viewState={viewState}
        onViewStateChange={({ viewState: v }: any) => setViewState(v)}
        controller={true}
        layers={layers}
        getCursor={({ isDragging }: any) =>
          isDragging ? "grabbing" : hover ? "pointer" : "grab"
        }
      />

      <div className="sky-ctl">
        <button
          className={showLines ? "on" : ""}
          onClick={() => setShowLines((v) => !v)}
        >
          별자리 선 {lines.length ? `(${lines.length})` : ""}
        </button>
        <button className={spin ? "on" : ""} onClick={() => setSpin((v) => !v)}>
          자동 회전
        </button>
      </div>

      <div className="legend">
        <div className="lg-title">3D 조망</div>
        <div className="lg-note">
          드래그로 회전, 휠로 확대. 색은 주제 덩어리({clusters.length}개). 선은
          인용 메인패스다.
          <br />
          <br />
          겹침 때문에 정밀 분석에는 2D 지도가 낫다. 여기는 전체 구조를 보는
          자리다.
        </div>
      </div>

      {hover && (
        <div
          className="tooltip"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
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
