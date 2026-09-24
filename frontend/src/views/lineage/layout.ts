import type { LineageData } from "../../api";

// 인용 계보(연도 세로축, 메인패스 기둥)의 배치. LineageView와 홍보 영상(video/)이 같이 쓴다.
export const ROW = 34; // 한 해 높이
export const PAD_T = 46;
export const PAD_L = 90; // 왼쪽 연도 칸
export const SPINE = 210; // 메인패스가 놓이는 x
export const SIDE = 150; // 곁가지가 퍼지는 폭

export type LineageLayout = NonNullable<ReturnType<typeof lineageLayout>>;

export function lineageLayout(data: LineageData | null | undefined) {
  if (!data) return null;
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const mainSet = new Set(data.main_path);
  const years = data.nodes
    .map((n) => n.year)
    .filter((y): y is number => y != null);
  if (!years.length) return null;
  const y0 = Math.min(...years),
    y1 = Math.max(...years);
  const yOf = (y: number | null) => PAD_T + ((y ?? y0) - y0) * ROW;

  // 메인패스는 가운데 기둥에 연도순으로 세운다. 곁가지는 같은 해 안에서
  // 좌우로 번갈아 흩어 놓는다 — 겹치지 않게 하는 게 목적이지 미학이 아니다.
  const pos = new Map<string, { x: number; y: number }>();
  data.main_path.forEach((id) => {
    const n = nodes.get(id);
    if (n) pos.set(id, { x: SPINE, y: yOf(n.year) });
  });
  const perYear = new Map<number, number>();
  data.nodes.forEach((n) => {
    if (pos.has(n.id)) return;
    const y = n.year ?? y0;
    const k = perYear.get(y) ?? 0;
    perYear.set(y, k + 1);
    const side = k % 2 === 0 ? -1 : 1;
    const step = Math.floor(k / 2) + 1;
    pos.set(n.id, {
      x: SPINE + side * Math.min(SIDE * step * 0.55, SIDE * 2.6),
      y: yOf(y) + ((k % 3) - 1) * 6,
    });
  });

  const xs = [...pos.values()].map((p) => p.x);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  return {
    nodes,
    pos,
    mainSet,
    y0,
    y1,
    // 라벨이 노드 오른쪽으로 최대 ~320px 뻗는다. 그만큼 더 잡아야 안 잘린다.
    width: PAD_L + (maxX - minX) + 420,
    height: PAD_T + (y1 - y0 + 1) * ROW + 30,
    shift: PAD_L - minX + 30,
  };
}
