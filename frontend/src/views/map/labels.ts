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

// ── 영역이 화면을 덮고 있는 동안 이름을 붙들어 두기 ─────────────────
// 영역의 반지름: 소속 논문이 중심에서 떨어진 거리의 90분위. 상위 노드는
// 하위 주제 전부를 합쳐 잰다. 지도 데이터가 바뀔 때 한 번만 계산한다.
export function regionRadii(
  map: MapData,
  tree: TreeData | null | undefined,
  clusters: ClusterInfo[],
): Map<string, number> {
  const byCluster = new Map<number, number[]>();
  for (let i = 0; i < map.n; i++) {
    const c = map.cluster[i];
    if (c < 0 || !Number.isFinite(map.x[i]) || !Number.isFinite(map.y[i]))
      continue;
    let arr = byCluster.get(c);
    if (!arr) byCluster.set(c, (arr = []));
    arr.push(i);
  }
  const radius = (ids: Iterable<number>, cx: number, cy: number) => {
    const d: number[] = [];
    for (const c of ids)
      for (const i of byCluster.get(c) ?? [])
        d.push(Math.hypot(map.x[i]! - cx, map.y[i]! - cy));
    if (!d.length) return 0;
    d.sort((a, b) => a - b);
    return d[Math.min(d.length - 1, Math.floor(d.length * 0.9))];
  };
  const out = new Map<string, number>();
  for (const c of clusters)
    if (c.x !== null && c.y !== null)
      out.set(`c${c.cluster_id}`, radius([c.cluster_id], c.x, c.y));
  for (const n of tree?.nodes ?? [])
    if (n.x !== null && n.y !== null)
      out.set(`n${n.id}`, radius(descendants(tree, n.id), n.x, n.y));
  return out;
}

// 논문 제목 불투명도. 문턱 반 단계 아래(2263%)에서 0, 반 단계 위(4525%)에서 1로
// 확대에 따라 서서히 진해진다. 영역 이름은 같은 곡선을 거꾸로 따라 옅어진다.
export function paperLabelOpacity(relativeZoom: number): number {
  const from = PAPER_LABEL_ZOOM - 0.5,
    to = PAPER_LABEL_ZOOM + 0.5;
  return Math.min(1, Math.max(0, (relativeZoom - from) / (to - from)));
}

// 영역 중심이 화면 밖이어도 화면 중앙이 영역 안(반지름 이내)이면 이름을 가장자리에
// 붙여 둔다. 돌려주는 좌표는 화면 안으로 조인 위치다.
export function clampRegionLabel(
  x: number,
  y: number,
  w: number,
  h: number,
  width: number,
  height: number,
): [number, number] {
  return [
    Math.min(Math.max(x, w / 2 + 16), width - w / 2 - 16),
    Math.min(Math.max(y, 55 + h / 2), height - 75 - h / 2),
  ];
}
