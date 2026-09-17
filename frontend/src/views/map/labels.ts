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
// 쌓기: 점 바로 아래(0줄)로는 최대 배율까지 완전히 켜지지 못하는 제목만 한 줄
// (h px)씩 아래로 내린다. 줄은 논문마다 한 번 정하므로 흔들리지 않는다. 최대
// 배율까지 켜지는 가장 가까운 줄을 고른다.
//
// 절차: 바닥 배율에서 피인용순으로 자리를 잡고, 막힌 라벨은 "켜진 이웃과 다
// 떨어지는 배율"을 열쇠로 힙에 넣는다. 배율 순으로 꺼내며 그사이 켜진 이웃이
// 있으면 열쇠를 올려 다시 넣고, 없으면 그 배율에 켠다. 이웃 j와 떨어지는 배율은
// 가로로 (w_i+w_j)/2 이상, 또는 세로로 h 이상 벌어지는 배율이다. 세로 간격은
// 점 사이 거리 × 배율에 줄 차이 × h를 더한 값이라, 줄을 내린 쪽이 아래 점이면
// 어떤 배율에서도 안 겹치고, 위 점이면 두 배로 벌어져야 한다.
export interface LabelBox {
  x: number;
  y: number;
  /** 라벨 상자 폭(px). 이웃과의 간격을 포함한다. */
  width: number;
  /** 클수록 같은 배율에서 먼저 자리를 잡는다. */
  priority: number;
}
export interface Reveals {
  /** 켜지는 절대 배율(log2 px/단위). 바닥 아래면 -Infinity, 영원히 안 켜지면 Infinity. */
  zoom: Float64Array;
  /** 점 아래로 내린 줄 수. 0이 점 바로 아래. */
  row: Uint8Array;
  /** 최대 줄까지 써도 최대 배율에서 완전히 켜지지 못하는 라벨 수. */
  unresolved: number;
}
export const MAX_ROWS = 4;
export function revealZooms(
  boxes: LabelBox[],
  floor: number,
  height: number,
  maxZoom = Infinity,
): Reveals {
  const n = boxes.length,
    out: Reveals = {
      zoom: new Float64Array(n).fill(-Infinity),
      row: new Uint8Array(n),
      unresolved: 0,
    },
    // 배율은 log2(px/단위)이므로 나눗셈만 쓰는 척도 공간에서 비교한다.
    floorScale = 2 ** floor,
    fullScale = 2 ** maxZoom,
    // 한 단계에 걸쳐 진해지므로 최대 배율 한 단계 아래까지는 켜져야 한다.
    maxScale = fullScale / 2;
  if (!n) return out;
  // 우선순위가 같으면 입력 순. 정렬은 안정적이고(ES2019) 지도는 work_id 순으로
  // 오므로 페이지를 다시 열어도 같은 결과다.
  const rank = new Int32Array(n);
  Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => boxes[b].priority - boxes[a].priority)
    .forEach((i, r) => (rank[i] = r));
  // 바닥 배율에서 라벨이 닿을 수 있는 거리(지도 단위)의 절반을 칸으로 격자를
  // 짠다. 이웃은 가로 ±2칸, 세로 ±2(1+줄 차이)칸 안에만 있다 — 그보다 멀면 어떤
  // 배율에서도 바닥 위에서 겹치지 않는다. 격자에는 켜진 라벨만, 줄마다 따로 든다.
  // 바닥 배율에서 지도가 화면 하나 크기라 칸이 몇백 개뿐이므로 촘촘한 배열로 둔다.
  let maxW = 0,
    minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const b of boxes) {
    if (b.width > maxW) maxW = b.width;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x > maxX) maxX = b.x;
    if (b.y > maxY) maxY = b.y;
  }
  // 줄을 내린 라벨(전체의 1~2할)은 세로로 더 멀리까지 닿으므로 따로 둔다.
  const cellW = maxW / floorScale / 2,
    cellH = height / floorScale / 2,
    ncx = Math.floor((maxX - minX) / cellW) + 1,
    ncy = Math.floor((maxY - minY) / cellH) + 1,
    grid0 = new Array<number[] | undefined>(ncx * ncy),
    gridS = new Array<number[] | undefined>(ncx * ncy),
    cxOf = (i: number) => Math.floor((boxes[i].x - minX) / cellW),
    cyOf = (i: number) => Math.floor((boxes[i].y - minY) / cellH);
  // i(dr줄 더 아래)와 j가 떨어지는 배율이 m보다 크면 그 값을, 아니면 m을 돌려준다.
  // 떨어지는 배율은 그 배율부터 최대 배율까지 안 겹치는 가장 낮은 배율이다.
  // 가로: (w_i+w_j)/2 / |dx|. 세로: 간격 f = dy·배율 + h·dr이 |f| < h인 배율 구간
  // (lo, hi)에서 겹치므로 hi. 구간이 바닥 아래거나 최대 배율 위면 범위 안에서는 안
  // 겹친다(0). 나눗셈은 둘 다 m을 넘을 때만 한다 — 대부분 곱셈 비교에서 끝난다.
  const raise = (i: number, j: number, dr: number, m: number) => {
    const b = boxes[i],
      o = boxes[j],
      wx = (b.width + o.width) / 2,
      adx = Math.abs(b.x - o.x);
    if (wx <= m * adx) return m;
    const dy = b.y - o.y;
    let sy: number;
    if (dy === 0) sy = dr === 0 ? Infinity : 0;
    else {
      // 줄을 내린 쪽이 아래 점이면 k = -dr(어떤 배율에서도 안 겹침), 위 점이면 dr.
      const ady = Math.abs(dy),
        k = dy > 0 ? -dr : dr,
        hiNum = height * (1 + k),
        loNum = height * (k - 1);
      sy =
        hiNum <= floorScale * ady ||
        loNum >= fullScale * ady ||
        hiNum <= m * ady
          ? 0
          : hiNum / ady;
    }
    if (sy <= m) return m;
    // 0으로 나누면 Infinity: 같은 자리는 영원히 안 떨어진다.
    return Math.min(wx / adx, sy);
  };
  // i를 r줄에 놓을 때 켜진 이웃과 다 떨어지는 배율. `seen` 이후에 켜진 이웃만
  // 새로 본다 — 칸은 켜진 순서로 쌓이므로 꼬리부터 거슬러 오르면 된다. m보다 높은
  // 배율에서 겹치는 이웃은 가로 maxW/m·세로 h(1+줄 차이)/m 안에만 있으므로 그만큼의
  // 칸만 본다 — m이 바닥의 몇 배만 돼도 제 칸 근처뿐이다. 줄을 내린 라벨은 아래쪽
  // 점의 0줄 라벨과만 겹칠 수 있다(위쪽 점의 라벨은 제 점 위에 있다).
  const stamp = new Int32Array(n);
  let admitted = 0;
  const need = (i: number, r: number, seen: number, m: number) => {
    const cx = cxOf(i),
      cy = cyOf(i),
      rx = Math.ceil((2 * floorScale) / m),
      x0 = Math.max(0, cx - rx),
      x1 = Math.min(ncx - 1, cx + rx),
      ry = Math.ceil((2 * (1 + r) * floorScale) / m),
      y0 = Math.max(0, r === 0 ? cy - ry : cy),
      y1 = Math.min(ncy - 1, cy + ry),
      ryS = Math.ceil((2 * (1 + MAX_ROWS) * floorScale) / m),
      yS0 = Math.max(0, cy - ryS),
      yS1 = Math.min(ncy - 1, cy + ryS);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const cell = grid0[x * ncy + y];
        if (!cell) continue;
        for (let t = cell.length - 1; t >= 0 && stamp[cell[t]] >= seen; t--)
          m = raise(i, cell[t], r, m);
      }
      for (let y = yS0; y <= yS1; y++) {
        const cell = gridS[x * ncy + y];
        if (!cell) continue;
        for (let t = cell.length - 1; t >= 0 && stamp[cell[t]] >= seen; t--)
          m = raise(i, cell[t], r - out.row[cell[t]], m);
      }
    }
    return m;
  };
  // 0줄로는 최대 배율까지 못 켜지면 `from`줄부터 내려가며 최대 배율까지 켜지는 첫
  // 줄을 고른다. 되는지는 최대 배율 기준의 좁은 창으로 먼저 보고, 되는 줄에서만
  // 켜지는 배율을 정확히 잰다. 되는 줄이 없으면 지금 줄까지 포함해 가장 일찍
  // 켜지는 줄.
  const chooseRow = (
    i: number,
    from: number,
    row: number,
    m: number,
  ): [number, number] => {
    for (let r = from; r <= MAX_ROWS; r++)
      if (need(i, r, 0, maxScale) <= maxScale)
        return [r, need(i, r, 0, floorScale)];
    for (let r = from; r <= MAX_ROWS; r++) {
      const mr = need(i, r, 0, floorScale);
      if (mr < m) [row, m] = [r, mr];
    }
    return [row, m];
  };
  const admit = (i: number, r: number, scale: number) => {
    if (scale > floorScale) out.zoom[i] = Math.log2(scale);
    out.row[i] = r;
    if (scale > maxScale || scale === Infinity) out.unresolved++;
    // 영원히 안 켜지는 라벨은 남을 막지 않는다.
    if (scale === Infinity) return;
    stamp[i] = admitted++;
    const grid = r === 0 ? grid0 : gridS,
      k = cxOf(i) * ncy + cyOf(i),
      cell = grid[k];
    if (cell) cell.push(i);
    else grid[k] = [i];
  };
  // 힙: 배율 오름차순, 같으면 우선순위 높은 쪽. 항목마다 줄과 마지막으로 본 시점.
  const hz: number[] = [],
    hi: number[] = [],
    hr: number[] = [],
    hs: number[] = [];
  const before = (a: number, b: number) =>
    hz[a] < hz[b] || (hz[a] === hz[b] && rank[hi[a]] < rank[hi[b]]);
  const swap = (a: number, b: number) => {
    [hz[a], hz[b]] = [hz[b], hz[a]];
    [hi[a], hi[b]] = [hi[b], hi[a]];
    [hr[a], hr[b]] = [hr[b], hr[a]];
    [hs[a], hs[b]] = [hs[b], hs[a]];
  };
  const push = (i: number, r: number, z: number) => {
    hz.push(z);
    hi.push(i);
    hr.push(r);
    hs.push(admitted);
    for (let c = hz.length - 1; c > 0;) {
      const p = (c - 1) >> 1;
      if (!before(c, p)) break;
      swap(c, p);
      c = p;
    }
  };
  const pop = (): [number, number, number, number] => {
    const top: [number, number, number, number] = [hz[0], hi[0], hr[0], hs[0]];
    const z = hz.pop()!,
      i = hi.pop()!,
      r = hr.pop()!,
      seen = hs.pop()!;
    if (hz.length) {
      hz[0] = z;
      hi[0] = i;
      hr[0] = r;
      hs[0] = seen;
      for (let c = 0; ;) {
        const l = 2 * c + 1,
          rr = l + 1;
        let m = c;
        if (l < hz.length && before(l, m)) m = l;
        if (rr < hz.length && before(rr, m)) m = rr;
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
    let r = 0,
      m = need(i, 0, 0, floorScale);
    if (m > maxScale) [r, m] = chooseRow(i, 1, 0, m);
    if (m <= floorScale) admit(i, r, floorScale);
    else push(i, r, m);
  }
  // 그다음은 떨어지는 순서. 그사이 켜진 이웃이 있으면 열쇠를 올려 다시 넣는다.
  // 그 줄로 최대 배율까지 못 켜지게 되면 더 아래 줄을 찾는다. 아래 줄의 열쇠가
  // 지금 배율보다 낮아도 된다 — 켜진 이웃 전부와 그 배율부터 떨어져 있다.
  while (hz.length) {
    let [z, i, r, seen] = pop();
    const m = need(i, r, seen, z);
    if (m <= z) {
      admit(i, r, z);
      continue;
    }
    if (m > maxScale && r < MAX_ROWS) [r, z] = chooseRow(i, r + 1, r, m);
    else z = m;
    push(i, r, z);
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
