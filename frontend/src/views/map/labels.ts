import type { MapData, TreeData, ClusterInfo } from "../../api";
export type LabelLevel = "field" | "topic" | "paper";
export function labelLevel(relativeZoom: number): LabelLevel {
  return relativeZoom < 1 ? "field" : relativeZoom < 3 ? "topic" : "paper";
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
export function avoidCollisions(
  labels: PositionedLabel[],
  width: number,
  height: number,
): PositionedLabel[] {
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  return [...labels]
    .sort((a, b) => Number(!!b.selected) - Number(!!a.selected))
    .filter((l) => {
      const w = Math.min(260, l.text.length * 6.4),
        h = l.text.length > 40 ? 36 : 20;
      if (l.x < 14 || l.x > width - 14 || l.y < 45 || l.y > height - 60)
        return false;
      const box = {
        x: Math.min(l.x + 12, width - w - 8),
        y: l.y - h / 2,
        w,
        h,
      };
      if (
        !l.selected &&
        boxes.some(
          (b) =>
            box.x < b.x + b.w + 8 &&
            box.x + box.w + 8 > b.x &&
            box.y < b.y + b.h + 5 &&
            box.y + box.h + 5 > b.y,
        )
      )
        return false;
      boxes.push(box);
      return true;
    })
    .slice(0, 100);
}
