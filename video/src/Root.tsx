import { Composition } from "remotion";
import { Spike } from "./scenes/Spike";

export function Root() {
  return (
    <Composition
      id="Spike"
      component={Spike}
      durationInFrames={30}
      fps={30}
      width={1280}
      height={720}
    />
  );
}
