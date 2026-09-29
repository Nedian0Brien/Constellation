import { Easing } from "remotion";
import {
  LABEL_FADE_MS,
  LINK_FADE_PX,
  LINK_SPEED,
} from "../../../frontend/src/views/map/style";
import type { Camera, Focus } from "./MapScene";

// 카메라 열쇠 프레임. `rel`은 기준 배율 대비 확대 단계(log2), `at`은 화면 중앙에 올
// 지도 좌표. 구간 사이는 `ease`(기본 ease-in-out cubic)로 잇는다.
export interface Key {
  frame: number;
  at: [number, number];
  rel: number;
  /** 이 열쇠로 들어오는 구간의 곡선. 없으면 ease-in-out cubic. */
  ease?: (t: number) => number;
}
const inOut = Easing.inOut(Easing.cubic);

// 한 구간의 카메라. 배율은 열쇠 사이를 보간하고, 목적지 P의 화면 오프셋은 처음 오프셋에서
// (1 − e)배로 줄어든다: target = P − offset₀·(1 − e) / 2^zoom. 배율이 몇 단계씩 커져도
// P가 화면에서 곧게, 속도 곡선 그대로 중앙에 온다.
export function cameraAt(frame: number, keys: Key[], homeZoom: number): Camera {
  let k = keys.findIndex((key) => frame < key.frame) - 1;
  if (k < 0) k = frame < keys[0].frame ? 0 : keys.length - 2;
  const a = keys[k],
    b = keys[k + 1];
  const e = (b.ease ?? inOut)(
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

// 앱 호버의 곡선(MapView `hoverT`·`useFront`)을 프레임으로. hoverT는 240ms ease-out으로
// 켜지고(`off` 이후 같은 곡선으로 꺼진다), 앞머리는 화면에서 초당 LINK_SPEED px — 지도
// 단위로는 그 프레임 배율로 나눈 속도로 프레임마다 더한다. 이웃이 켜지는 거리는 강조가
// 켜진 순간의 배율로 굳힌다(fadeWorld).
export function focusAt(
  frame: number,
  index: number,
  on: number,
  off: number,
  zoomAt: (f: number) => number,
  fps: number,
): Focus | undefined {
  if (frame < on) return undefined;
  const fadeFrames = (LABEL_FADE_MS / 1000) * fps;
  const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
  const t =
    frame < off
      ? easeOut((frame - on) / fadeFrames)
      : 1 - easeOut((frame - off) / fadeFrames);
  if (t <= 0) return undefined;
  let front = 0;
  for (let f = on; f < Math.min(frame, off); f++)
    front += LINK_SPEED / fps / 2 ** zoomAt(f);
  return {
    index,
    t,
    front,
    fadeWorld: LINK_FADE_PX / 2 ** zoomAt(on),
  };
}
