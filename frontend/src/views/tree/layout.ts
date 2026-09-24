import type { TreeData, TreeNode } from "../../api";

// 계층 트리(덴드로그램)의 배치. TreeView와 홍보 영상(video/)이 같이 쓴다.
export const ROW = 21; // 잎 한 줄 높이
export const PAD_T = 28;
export const PAD_B = 20;
export const LABEL_W = 350; // 오른쪽 라벨 칸
export const BAR_W = 92; // 편수 막대 칸
export const PAD_L = 16;

export function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

/** 레벨 0 그룹마다 색을 준다. 자손은 조상의 색을 물려받는다. */
export function groupColors(nodes: Map<number, TreeNode>, tops: number[]) {
  const color = new Map<number, string>();
  tops.forEach((top, i) => {
    const c = hsl((i * 137.508) % 360, 58, 62);
    const stack = [top];
    while (stack.length) {
      const id = stack.pop()!;
      color.set(id, c);
      const n = nodes.get(id);
      if (n?.left != null) stack.push(n.left);
      if (n?.right != null) stack.push(n.right);
    }
  });
  return color;
}

export type TreeLayout = NonNullable<ReturnType<typeof treeLayout>>;

export function treeLayout(tree: TreeData | null | undefined) {
  if (!tree) return null;
  const nodes = new Map(tree.nodes.map((n) => [n.id, n]));
  const leaves = tree.nodes
    .filter((n) => n.leaf_order != null)
    .sort((a, b) => a.leaf_order! - b.leaf_order!);
  const maxH = Math.max(...tree.nodes.map((n) => n.height), 1);
  const totalW = 1140;
  const treeW = totalW - LABEL_W - BAR_W - PAD_L;

  // 병합 높이가 클수록 왼쪽(= 일찍 갈라진 것). 잎은 오른쪽 끝.
  const xOf = (h: number) => PAD_L + treeW * (1 - h / maxH);
  const yOf = new Map<number, number>();
  leaves.forEach((n, i) => yOf.set(n.id, PAD_T + i * ROW + ROW / 2));

  // 내부 노드의 y는 두 자식의 중간. 잎에서 위로 올라가며 채운다.
  const order = [...tree.nodes].sort((a, b) => a.height - b.height);
  for (const n of order) {
    if (yOf.has(n.id)) continue;
    const a = n.left != null ? yOf.get(n.left) : undefined;
    const b = n.right != null ? yOf.get(n.right) : undefined;
    if (a != null && b != null) yOf.set(n.id, (a + b) / 2);
  }

  const tops = (tree.levels["0"] ?? []).slice();
  const color = groupColors(nodes, tops);
  const maxSize = Math.max(...leaves.map((n) => n.size), 1);

  // 레벨 절단선 — 어느 높이에서 자른 것인지 보여준다
  const cuts = Object.entries(tree.levels)
    .filter(([lv]) => lv !== String(Object.keys(tree.levels).length - 1))
    .map(([lv, ids]) => {
      const hs = ids
        .map((id) => nodes.get(id)?.parent)
        .filter((p): p is number => p != null)
        .map((p) => nodes.get(p)!.height);
      return {
        level: Number(lv),
        k: ids.length,
        h: hs.length ? Math.min(...hs) : 0,
      };
    })
    .filter((c) => c.h > 0);

  return {
    nodes,
    leaves,
    xOf,
    yOf,
    color,
    tops,
    maxSize,
    cuts,
    topSet: new Set(tops),
    width: totalW,
    height: PAD_T + leaves.length * ROW + PAD_B,
  };
}
