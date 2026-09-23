import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useSnapshot } from "../data";
import { buildModel, pickTargets, type MapModel } from "../map/model";
import { MapScene } from "../map/MapScene";
import { cameraAt, focusAt, type Key } from "../map/camera";

export interface MapDiveProps {
  /** 멈출 논문 id(`openalex:W…`). 그 논문의 상위·하위 분야를 거쳐 들어간다. */
  paperId?: string;
}

// 강조(인용선)가 켜지는 프레임.
const FOCUS_FRAME = 100;

export function MapDive({ paperId }: MapDiveProps) {
  const data = useSnapshot();
  const model = useMemo(() => (data ? buildModel(data) : null), [data]);
  if (!model) return null;
  return <Dive model={model} paperId={paperId} />;
}

function Dive({ model, paperId }: { model: MapModel } & MapDiveProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { field, paper } = useMemo(
    () => pickTargets(model, paperId),
    [model, paperId],
  );
  const home = model.home;
  const P: [number, number] = [model.map.x[paper], model.map.y[paper]];
  const keys: Key[] = useMemo(
    () => [
      // 1. 전체 지도와 상위 분야 이름. 천천히 밀고 들어간다.
      { frame: 0, at: [home.target[0], home.target[1]], rel: 0 },
      { frame: 18, at: [home.target[0], home.target[1]], rel: 0.15 },
      // 2. 가장 큰 상위 분야로 — 하위 분야 이름이 나타난다.
      { frame: 54, at: [field.x, field.y], rel: 1.5 },
      // 3. 하위 분야를 지나 논문으로 — 주제 이름 뒤로 논문 제목이 켜진다.
      { frame: 96, at: P, rel: 5.6 },
      // 4. 논문에 머무는 동안 인용선이 뻗고, 끝에 조금 물러나 인용망을 보인다.
      { frame: 118, at: P, rel: 5.6 },
      { frame: durationInFrames - 1, at: P, rel: 4.4 },
    ],
    [home, field, P[0], P[1], durationInFrames],
  );
  const camera = cameraAt(frame, keys, home.zoom);

  const focus = focusAt(
    frame,
    paper,
    FOCUS_FRAME,
    Infinity,
    (f) => cameraAt(f, keys, home.zoom).zoom,
    fps,
  );
  return (
    <AbsoluteFill>
      <MapScene model={model} camera={camera} focus={focus} />
    </AbsoluteFill>
  );
}
