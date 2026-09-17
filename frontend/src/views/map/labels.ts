import type { MapData, TreeData, ClusterInfo } from "../../api";
export type LabelLevel = "field" | "topic" | "paper";
// 논문 제목이 켜지기 시작하는 배율(기준 배율 대비 log2). 5 = 3200%. 하위 분야 라벨은
// 이 배율에서 꺼지므로 라벨이 하나도 없는 구간이 생기지 않는다.
// 실측(SciNCL run, 지도 영역 1184×830): 800%에서 가장 빽빽한 화면에 980편,
// 3200%에서 188편, 6400%에서 79편이 들어온다. 이웃과 겹치는 제목은 `revealZooms`가
// 정한 더 높은 배율에서 켜진다.
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
// 뷰포트 밖의 라벨만 뺀다. 화면에 따른 정렬·개수 제한·겹침 판정을 두지 않아 같은
// 배율의 같은 화면이면 항상 같은 라벨이 보인다. 여백은 라벨 폭의 절반(130px)이다.
const margin = 130;
export function visibleTitles<T extends PositionedLabel>(
  labels: T[],
  width: number,
  height: number,
): T[] {
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

// 라벨 불투명도. 켜지는 배율(`reveal`)과 바닥 배율 중 높은 쪽에서 0, 한 단계(2배)
// 위에서 1로 확대에 따라 서서히 진해진다.
export function labelOpacity(
  zoom: number,
  reveal: number,
  floor: number,
): number {
  return Math.min(1, Math.max(0, zoom - Math.max(reveal, floor)));
}

// 겹치지 않는 논문 제목의 불투명도. 문턱 반 단계 아래(2263%)에서 0, 반 단계 위
// (4525%)에서 1이다. 영역 이름은 같은 곡선을 거꾸로 따라 옅어진다.
export function paperLabelOpacity(relativeZoom: number): number {
  return labelOpacity(relativeZoom, -Infinity, PAPER_LABEL_ZOOM - 0.5);
}

// ── 논문마다 제목이 켜지는 배율 ────────────────────────────────────
// UMAP은 비슷한 논문을 라벨 폭보다 가깝게 놓으므로 어떤 배율에서도 "전부 켜고
// 겹치지 않기"는 안 된다. 대신 논문마다 켜지는 배율을 좌표·제목 폭·피인용수만으로
// 한 번 정한다. 화면(뷰포트)이 끼어들지 않으므로 이동해도 라벨이 바뀌지 않고,
// 확대하면 더해지기만, 축소하면 빠지기만 한다.
//
// 규칙: 켜진 라벨과 겹치지 않는 자리가 생기면 바로 켠다. 그래서 어떤 배율에서든
// 안 보이는 제목은 그 배율에서 켜진 제목과 겹치는 것뿐이다. 켜진 제목은 확대해도
// 꺼지지 않으므로 먼저 자리를 잡은 쪽이 남고, 뒤에 떨어져 나온 쪽이 기다린다.
// 피인용수는 같은 배율에서 함께 자리를 다툴 때만 순서를 정한다(주로 바닥 배율).
//
// 절차: 바닥 배율에서 피인용순으로 자리를 잡고, 막힌 라벨은 "켜진 이웃과 다
// 떨어지는 배율"을 열쇠로 힙에 넣는다. 배율 순으로 꺼내며 그사이 켜진 이웃이
// 있으면 열쇠를 올려 다시 넣고, 없으면 그 배율에 켠다. 이웃 j와 떨어지는 배율은
// 가로로 (w_i+w_j)/2 이상 또는 세로로 h 이상 벌어지는 배율이다.
export interface LabelBox {
  x: number;
  y: number;
  /** 라벨 상자 폭(px). 이웃과의 간격을 포함한다. */
  width: number;
  /** 클수록 같은 배율에서 먼저 자리를 잡는다. */
  priority: number;
}
export function revealZooms(
  boxes: LabelBox[],
  floor: number,
  height: number,
): Float64Array {
  const n = boxes.length,
    out = new Float64Array(n).fill(-Infinity),
    // 배율은 log2(px/단위)이므로 나눗셈만 쓰는 척도 공간에서 비교한다.
    floorScale = 2 ** floor;
  if (!n) return out;
  // 우선순위가 같으면 입력 순. 정렬은 안정적이고(ES2019) 지도는 work_id 순으로
  // 오므로 페이지를 다시 열어도 같은 결과다.
  const rank = new Int32Array(n);
  Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => boxes[b].priority - boxes[a].priority)
    .forEach((i, r) => (rank[i] = r));
  // 바닥 배율에서 라벨이 닿을 수 있는 거리(지도 단위)로 격자를 짠다. 그보다 먼
  // 이웃과는 어떤 배율에서도 바닥 위에서 겹치지 않는다. 격자에는 켜진 라벨만 든다.
  let maxW = 0,
    minX = Infinity,
    minY = Infinity;
  for (const b of boxes) {
    if (b.width > maxW) maxW = b.width;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
  }
  const cellW = maxW / floorScale,
    cellH = height / floorScale,
    cols = new Map<number, number[]>(),
    key = (cx: number, cy: number) => cx * 4_194_304 + cy,
    cellOf = (i: number) =>
      key(
        Math.floor((boxes[i].x - minX) / cellW),
        Math.floor((boxes[i].y - minY) / cellH),
      );
  // 켜진 이웃과 다 떨어지는 배율. `seen` 이후에 켜진 이웃만 새로 본다 — 칸은
  // 켜진 순서로 쌓이므로 꼬리부터 거슬러 오르면 된다. 겹치는 이웃이 없으면 `m`.
  const stamp = new Int32Array(n);
  let admitted = 0;
  const need = (i: number, seen: number, m: number) => {
    const b = boxes[i],
      cx = Math.floor((b.x - minX) / cellW),
      cy = Math.floor((b.y - minY) / cellH);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const cell = cols.get(key(cx + dx, cy + dy));
        if (!cell) continue;
        for (let t = cell.length - 1; t >= 0 && stamp[cell[t]] >= seen; t--) {
          const o = boxes[cell[t]],
            sx = (b.width + o.width) / 2 / Math.abs(b.x - o.x),
            sy = height / Math.abs(b.y - o.y),
            s = Math.min(sx, sy);
          // 0으로 나누면 Infinity: 같은 자리는 영원히 안 떨어진다.
          if (s > m) m = s;
        }
      }
    return m;
  };
  const admit = (i: number, scale: number) => {
    if (scale > floorScale) out[i] = Math.log2(scale);
    // 영원히 안 켜지는 라벨은 남을 막지 않는다.
    if (scale === Infinity) return;
    stamp[i] = admitted++;
    const k = cellOf(i),
      cell = cols.get(k);
    if (cell) cell.push(i);
    else cols.set(k, [i]);
  };
  // 힙: 배율 오름차순, 같으면 우선순위 높은 쪽. 항목마다 마지막으로 본 시점을 든다.
  const hz: number[] = [],
    hi: number[] = [],
    hs: number[] = [];
  const before = (a: number, b: number) =>
    hz[a] < hz[b] || (hz[a] === hz[b] && rank[hi[a]] < rank[hi[b]]);
  const swap = (a: number, b: number) => {
    [hz[a], hz[b]] = [hz[b], hz[a]];
    [hi[a], hi[b]] = [hi[b], hi[a]];
    [hs[a], hs[b]] = [hs[b], hs[a]];
  };
  const push = (i: number, z: number, seen: number) => {
    hz.push(z);
    hi.push(i);
    hs.push(seen);
    for (let c = hz.length - 1; c > 0;) {
      const p = (c - 1) >> 1;
      if (!before(c, p)) break;
      swap(c, p);
      c = p;
    }
  };
  const pop = (): [number, number, number] => {
    const top: [number, number, number] = [hz[0], hi[0], hs[0]];
    const z = hz.pop()!,
      i = hi.pop()!,
      seen = hs.pop()!;
    if (hz.length) {
      hz[0] = z;
      hi[0] = i;
      hs[0] = seen;
      for (let c = 0; ;) {
        const l = 2 * c + 1,
          r = l + 1;
        let m = c;
        if (l < hz.length && before(l, m)) m = l;
        if (r < hz.length && before(r, m)) m = r;
        if (m === c) break;
        swap(c, m);
        c = m;
      }
    }
    return top;
  };
  // 바닥 배율: 피인용순으로 자리를 잡는다.
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => rank[a] - rank[b],
  );
  for (const i of order) {
    const m = need(i, 0, floorScale);
    if (m <= floorScale) admit(i, floorScale);
    else push(i, m, admitted);
  }
  // 그다음은 떨어지는 순서. 그사이 켜진 이웃이 있으면 열쇠를 올려 다시 넣는다.
  while (hz.length) {
    const [z, i, seen] = pop(),
      m = need(i, seen, z);
    if (m > z) push(i, m, admitted);
    else admit(i, z);
  }
  return out;
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
