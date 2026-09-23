// 렌더 검증용 임시 장면(plan 1단계). MapDive가 대신하면 지운다.
import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { OrthographicView } from "@deck.gl/core";
import { homeCamera } from "../../../frontend/src/views/map/labels";
import { clusterColor } from "../../../frontend/src/views/map/regions";
import { useSnapshot } from "../data";
import { useDeckFrameSync } from "../map/frame-sync";

const view = new OrthographicView({ id: "research-map" });

export function Spike() {
  const data = useSnapshot();
  const frame = useCurrentFrame();
  const { deck, onAfterRender } = useDeckFrameSync();
  const points = useMemo(() => {
    if (!data) return [];
    const m = data.map;
    return m.id.map((_, i) => ({ i, position: [m.x[i], m.y[i]] as [number, number] }));
  }, [data]);
  if (!data) return null;
  const home = homeCamera(data.map, 1280, 720);
  const zoom = home.zoom + interpolate(frame, [0, 29], [0, 2]);
  return (
    <AbsoluteFill style={{ background: "#101113" }}>
      <DeckGL
        ref={deck}
        views={view}
        viewState={{ target: home.target, zoom }}
        onAfterRender={onAfterRender}
        layers={[
          new ScatterplotLayer<{ i: number; position: [number, number] }>({
            id: "papers",
            data: points,
            getPosition: (p) => p.position,
            getFillColor: (p) => [...clusterColor(data.map.cluster[p.i]), 205],
            getRadius: 1.5,
            radiusUnits: "pixels",
            radiusMinPixels: 1.3,
          }),
        ]}
      />
    </AbsoluteFill>
  );
}
