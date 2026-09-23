import { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  LABEL_FADE_MS,
  LINK_FADE_PX,
  LINK_SPEED,
} from "../../../frontend/src/views/map/style";
import { useSnapshot } from "../data";
import { buildModel, pickTargets, type MapModel } from "../map/model";
import { MapScene, type Camera, type Focus } from "../map/MapScene";

export interface MapDiveProps {
  /** 멈출 논문 id(`openalex:W…`). 그 논문의 상위·하위 분야를 거쳐 들어간다. */
  paperId?: string;
}

// 카메라 열쇠 프레임. `rel`은 기준 배율 대비 확대 단계(log2), `at`은 화면 중앙에 올
// 지도 좌표. 구간 사이는 ease-in-out으로 잇는다.
interface Key {
  frame: number;
  at: [number, number];
  rel: number;
}
// 강조(인용선)가 켜지는 프레임.
const FOCUS_FRAME = 100;
const ease = Easing.inOut(Easing.cubic);

// 한 구간의 카메라. 배율은 열쇠 사이를 보간하고, 목적지 P의 화면 오프셋은 처음 오프셋에서
// (1 − e)배로 줄어든다: target = P − offset₀·(1 − e) / 2^zoom. 배율이 몇 단계씩 커져도
// P가 화면에서 곧게, 속도 곡선 그대로 중앙에 온다.
function cameraAt(frame: number, keys: Key[], homeZoom: number): Camera {
  let k = keys.findIndex((key) => frame < key.frame) - 1;
  if (k < 0) k = frame < keys[0].frame ? 0 : keys.length - 2;
  const a = keys[k],
    b = keys[k + 1];
  const e = ease(
    Math.min(1, Math.max(0, (frame - a.frame) / (b.frame - a.frame))),
  );
  const za = homeZoom + a.rel,
    zoom = za + (b.rel - a.rel) * e;
  const shrink = (2 ** za * (1 - e)) / 2 ** zoom;
  return {
    target: [
      b.at[0] - (b.at[0] - a.at[0]) * shrink,
      b.at[1] - (b.at[1] - a.at[1]) * shrink,
      0,
    ],
    zoom,
  };
}

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

  // 강조: 앱의 호버와 같은 곡선. hoverT는 240ms ease-out(useTween), 앞머리는 화면에서
  // 초당 LINK_SPEED px — 지도 단위로는 그 프레임 배율로 나눈 속도로 프레임마다 더한다
  // (useFront). 이웃이 켜지는 거리는 강조가 켜진 순간의 배율로 굳힌다(fadeWorld).
  let focus: Focus | undefined;
  if (frame >= FOCUS_FRAME) {
    const t = Math.min(
      1,
      ((frame - FOCUS_FRAME) / fps) * (1000 / LABEL_FADE_MS),
    );
    let front = 0;
    for (let f = FOCUS_FRAME; f < frame; f++)
      front += LINK_SPEED / fps / 2 ** cameraAt(f, keys, home.zoom).zoom;
    focus = {
      index: paper,
      t: 1 - (1 - t) ** 3,
      front,
      fadeWorld:
        LINK_FADE_PX / 2 ** cameraAt(FOCUS_FRAME, keys, home.zoom).zoom,
    };
  }
  return (
    <AbsoluteFill>
      <MapScene model={model} camera={camera} focus={focus} />
    </AbsoluteFill>
  );
}
