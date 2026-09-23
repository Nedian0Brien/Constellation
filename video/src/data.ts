import { useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import type {
  ClusterInfo,
  EdgesData,
  MapData,
  TreeData,
} from "../../frontend/src/api";

// `npm run snapshot`이 constellation-serve에서 받아 둔 지도 자료. 앱의 fetchMap·
// fetchClusters·fetchTree·fetchEdges 응답과 같은 모양이다.
export interface Snapshot {
  map: MapData;
  clusters: ClusterInfo[];
  tree: TreeData;
  edges: EdgesData;
}

async function load(name: string) {
  const response = await fetch(staticFile(`data/${name}.json`));
  if (!response.ok)
    throw new Error(
      `data/${name}.json이 없다(${response.status}). npm run snapshot을 먼저 돌린다.`,
    );
  return response.json();
}

// 자료가 다 올 때까지 프레임 캡처를 붙잡는다. 렌더 탭마다 한 번 받는다.
export function useSnapshot(): Snapshot | null {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("snapshot"));
  const [data, setData] = useState<Snapshot | null>(null);
  useEffect(() => {
    Promise.all(["map", "clusters", "tree", "edges"].map(load))
      .then(([map, clusters, tree, edges]) => {
        setData({ map, clusters, tree, edges });
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [handle, continueRender, cancelRender]);
  return data;
}
