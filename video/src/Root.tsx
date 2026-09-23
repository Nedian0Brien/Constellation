import "./styles.css";
import { Composition } from "remotion";
import { WIDTH, HEIGHT } from "./map/model";
import { MapDive, type MapDiveProps } from "./scenes/MapDive";

export function Root() {
  return (
    <Composition
      id="MapDive"
      component={MapDive}
      durationInFrames={150}
      fps={30}
      width={WIDTH}
      height={HEIGHT}
      // 현재 코퍼스(RAG·정보검색)에서 체화 AI에 가장 가까운 논문. 피지컬 AI 코퍼스를
      // 만들면 스냅샷과 이 id만 바꾼다.
      defaultProps={{ paperId: "openalex:W4389523655" } satisfies MapDiveProps}
    />
  );
}
