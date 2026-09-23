import type { Snapshot } from "../data";
import {
  descendants,
  homeCamera,
  regionLabels,
  regionRadii,
  revealZooms,
  type LabelBox,
} from "../../../frontend/src/views/map/labels";
import { regionBlobs } from "../../../frontend/src/views/map/regions";
import { citationIndex } from "../../../frontend/src/views/map/edges";
import {
  TITLE_HEIGHT,
  TOP_CITED_QUANTILE,
  ZOOM_RANGE,
  titleTypography,
} from "../../../frontend/src/views/map/style";
import {
  titleCharacterSet,
  titleMeasure,
  titleMetrics,
} from "../../../frontend/src/views/map/titles";

// 컴포지션 크기(CSS 픽셀). remotion.config.ts의 scale 1.5로 1920×1080이 된다.
export const WIDTH = 1280,
  HEIGHT = 720;

export type Point = {
  id: string;
  i: number;
  position: [number, number, number];
};
export type MapModel = ReturnType<typeof buildModel>;

// 지도 자료에서 프레임과 무관한 것을 한 번 계산한다. MapView가 useMemo로 드는 값과 같은
// 함수·같은 입력이다(연도·검색 필터가 없으므로 모든 논문이 대상).
export function buildModel(s: Snapshot) {
  const { map, clusters, tree } = s;
  const home = homeCamera(map, WIDTH, HEIGHT);
  const points: Point[] = map.id.map((id, i) => ({
    id,
    i,
    position: [map.x[i], map.y[i], 0],
  }));
  // 상위 피인용 논문(98분위 이상). 크게 그리고 흰 테두리를 두른다.
  const sorted = [...map.cited].sort((a, b) => a - b),
    cut = sorted[Math.floor(sorted.length * TOP_CITED_QUANTILE)] ?? Infinity;
  const topCited = map.cited.map((c) => c >= cut && c > 0);
  const typo = titleTypography();
  const characterSet = titleCharacterSet(map);
  const measure = titleMeasure(characterSet, typo);
  const metrics = titleMetrics(map, measure);
  const boxes: (LabelBox & { i: number })[] = points
    .filter((p) => Number.isFinite(map.x[p.i]) && Number.isFinite(map.y[p.i]))
    .map((p) => ({
      i: p.i,
      x: map.x[p.i],
      y: map.y[p.i],
      width: metrics.widths[p.i],
      priority: map.cited[p.i],
    }));
  const reveals = revealZooms(
    boxes,
    home.zoom,
    TITLE_HEIGHT,
    home.zoom + ZOOM_RANGE,
  );
  const regions = [0, 1, 2].map((level) =>
    regionLabels(tree, clusters, level as 0 | 1 | 2),
  );
  // 필터가 없으니 모든 영역에 그려지는 논문이 있다.
  const alive = new Set(regions.flat().map((n) => n.id));
  const index = citationIndex(map.n, s.edges.citing, s.edges.cited);
  if (!index || s.edges.n !== map.n)
    throw new Error("인용 관계 자료가 지도와 어긋난다. 스냅샷을 다시 받는다.");
  return {
    map,
    tree,
    home,
    points,
    topCited,
    typo,
    characterSet,
    metrics,
    boxes,
    reveals,
    regions,
    radii: regionRadii(map, tree, clusters),
    alive,
    blobs: regionBlobs(map, clusters),
    index,
  };
}

// 영상이 파고드는 대상: 상위 분야 → 하위 분야 → 논문. 논문 id를 주면 그 논문이 속한
// 상위·하위 분야를 거슬러 찾는다. 없으면 가장 큰 상위 분야, 그 안의 가장 큰 하위 분야,
// 그 하위 분야에서 피인용수가 가장 높은 논문.
export function pickTargets(model: MapModel, paperId?: string) {
  const { map, tree } = model;
  const [top, sub] = model.regions;
  const within = (items: typeof top, cluster: number) =>
    items.find((n) => descendants(tree, n.node!).has(cluster));
  if (paperId) {
    const paper = map.id.indexOf(paperId);
    if (paper < 0) throw new Error(`논문 ${paperId}이 지도에 없다.`);
    const field = within(top, map.cluster[paper]),
      subfield = within(sub, map.cluster[paper]);
    if (!field || !subfield)
      throw new Error(`논문 ${paperId}은 주제에 속하지 않는다(잡음 클러스터).`);
    return { field, subfield, paper };
  }
  const field = [...top].sort((a, b) => b.size - a.size)[0];
  const inField = descendants(tree, field.node!);
  const subfield = [...sub]
    .filter((n) => [...descendants(tree, n.node!)].every((c) => inField.has(c)))
    .sort((a, b) => b.size - a.size)[0];
  const inSub = descendants(tree, subfield.node!);
  let paper = -1;
  for (let i = 0; i < map.n; i++)
    if (
      inSub.has(map.cluster[i]) &&
      (paper < 0 || map.cited[i] > map.cited[paper])
    )
      paper = i;
  return { field, subfield, paper };
}
