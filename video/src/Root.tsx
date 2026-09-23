import "./styles.css";
import { Composition } from "remotion";
import { WIDTH, HEIGHT } from "./map/model";
import { MapDive, type MapDiveProps } from "./scenes/MapDive";
import { Teaser } from "./scenes/Teaser";
import { DURATION, FOCUS_PAPER, FPS } from "./timeline";

export function Root() {
  return (
    <>
      {/* 30초 티저. 스냅샷은 피지컬 AI 코퍼스(README "홍보 영상"). */}
      <Composition
        id="Teaser"
        component={Teaser}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      {/* PoC 장면(렌더 검증용). 티저와 같은 초점 논문 RT-1. */}
      <Composition
        id="MapDive"
        component={MapDive}
        durationInFrames={150}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ paperId: FOCUS_PAPER } satisfies MapDiveProps}
      />
    </>
  );
}
