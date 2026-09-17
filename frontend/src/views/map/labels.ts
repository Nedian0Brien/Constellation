import type { MapData, TreeData, ClusterInfo } from "../../api";
export type LabelLevel = "field" | "topic" | "paper";
// 논문 제목이 켜지는 배율(기준 배율 대비 log2). 5 = 3200%. 하위 분야 라벨은
// 이 배율에서 꺼지므로 라벨이 하나도 없는 구간이 생기지 않는다.
// 실측(SciNCL run, 지도 영역 1184×830): 800%에서 가장 빽빽한 화면에 980편,
// 3200%에서 188편, 6400%에서 79편이 들어온다. 겹침 억제 없이 전부 그리므로
// 이 값이 한 화면의 라벨 수를 정한다. 제목은 한 줄로 줄여 겹침을 줄인다.
export const PAPER_LABEL_ZOOM = 5;
export function labelLevel(relativeZoom: number): LabelLevel {
  return relativeZoom < 1
    ? "field"
    : relativeZoom < PAPER_LABEL_ZOOM
      ? "topic"
      : "paper";
}
export function descendants(
  tree: TreeData | null | undefined,
  id: number,
): Set<number> {
  const out = new Set<number>(),
    seen = new Set<number>(),
    byId = new Map(tree?.nodes.map((n) => [n.id, n]) ?? []),
    stack = [id];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen.has(i)) continue;
    seen.add(i);
    const n = byId.get(i);
    if (!n) continue;
    if (n.cluster_id !== null) out.add(n.cluster_id);
    if (n.left !== null) stack.push(n.left);
    if (n.right !== null) stack.push(n.right);
  }
  return out;
}
export function regionLabels(
  tree: TreeData | undefined,
  clusters: ClusterInfo[],
  level: 0 | 1 | 2,
) {
  if (!tree)
    return clusters.map((c) => ({
      id: `c${c.cluster_id}`,
      label: c.label,
      x: c.x,
      y: c.y,
      cluster: c.cluster_id,
      node: undefined as number | undefined,
      size: c.size,
    }));
  const ids = new Set(tree.levels[String(level)] ?? []);
  return tree.nodes
    .filter((n) => ids.has(n.id))
    .map((n) => ({
      id: `n${n.id}`,
      label: n.label,
      x: n.x,
      y: n.y,
      cluster: n.cluster_id ?? undefined,
      node: n.id,
      size: n.size,
    }));
}
export function homeCamera(map: MapData, width: number, height: number) {
  const xs = map.x.filter(Number.isFinite),
    ys = map.y.filter(Number.isFinite);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return {
    target: [(minX + maxX) / 2, (minY + maxY) / 2, 0] as [
      number,
      number,
      number,
    ],
    zoom: Math.log2(
      Math.min(
        Math.max(160, width - 120) / Math.max(1, maxX - minX),
        Math.max(160, height - 130) / Math.max(1, maxY - minY),
      ),
    ),
  };
}
export interface PositionedLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  selected?: boolean;
}
// 뷰포트 밖의 라벨만 뺀다. 정렬·개수 제한·겹침 판정을 두지 않아 같은 배율의
// 같은 화면이면 항상 같은 라벨이 보인다. 여백은 라벨 폭의 절반(130px)이다.
const margin = 130;
export function visibleTitles(
  labels: PositionedLabel[],
  width: number,
  height: number,
): PositionedLabel[] {
  return labels.filter(
    (l) =>
      l.x >= -margin &&
      l.x <= width + margin &&
      l.y >= -40 &&
      l.y <= height + 40,
  );
}
