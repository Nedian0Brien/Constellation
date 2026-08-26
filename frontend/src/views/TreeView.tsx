import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { TreeNode } from "../api";

const ROW = 21;          // 잎 한 줄 높이
const PAD_T = 28;
const PAD_B = 20;
const LABEL_W = 350;     // 오른쪽 라벨 칸
const BAR_W = 92;        // 편수 막대 칸
const PAD_L = 16;

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

/** 레벨 0 그룹마다 색을 준다. 자손은 조상의 색을 물려받는다. */
function groupColors(nodes: Map<number, TreeNode>, tops: number[]) {
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

export default function TreeView() {
  const tree = useStore((s) => s.tree);
  const selectedNode = useStore((s) => s.selectedNode);
  const selectNode = useStore((s) => s.selectNode);
  const setView = useStore((s) => s.setView);
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(() => {
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
        return { level: Number(lv), k: ids.length, h: hs.length ? Math.min(...hs) : 0 };
      })
      .filter((c) => c.h > 0);

    return {
      nodes, leaves, xOf, yOf, color, tops, maxSize, cuts,
      topSet: new Set(tops),
      width: totalW,
      height: PAD_T + leaves.length * ROW + PAD_B,
    };
  }, [tree]);

  // 선택/호버한 노드의 자손을 전부 모은다 (강조용)
  const active = useMemo(() => {
    if (!layout) return null;
    const root = hover ?? selectedNode;
    if (root == null) return null;
    const set = new Set<number>();
    const stack = [root];
    while (stack.length) {
      const id = stack.pop()!;
      set.add(id);
      const n = layout.nodes.get(id);
      if (n?.left != null) stack.push(n.left);
      if (n?.right != null) stack.push(n.right);
    }
    return set;
  }, [hover, selectedNode, layout]);

  if (!tree || !layout) {
    return (
      <div className="tree-empty">
        <p>계층 트리가 없다.</p>
        <p className="dim">
          <code>constellation hierarchy</code> 를 돌려라.
        </p>
      </div>
    );
  }

  const { nodes, leaves, xOf, yOf, color, maxSize, cuts, topSet, width, height } = layout;
  const dim = (id: number) => (active && !active.has(id) ? 0.22 : 1);

  return (
    <div className="tree-wrap">
      <div className="tree-head">
        <span>
          클러스터 {leaves.length}개 · 노드 {tree.nodes.length}개 · ward · 2D 좌표
        </span>
        <span className="dim">
          왼쪽일수록 일찍 갈라진 갈래다. 가지를 누르면 지도에서 그 부분만 남는다.
        </span>
      </div>

      <div className="tree-scroll">
        <svg width={width} height={height} role="img"
             aria-label="클러스터 계층 덴드로그램">
          {/* 레벨 절단선 */}
          {cuts.map((c) => (
            <g key={c.level}>
              <line x1={xOf(c.h)} y1={PAD_T - 14} x2={xOf(c.h)} y2={height - PAD_B}
                    stroke="var(--rule-strong, #37444f)" strokeWidth="1"
                    strokeDasharray="3 4" />
              <text x={xOf(c.h) + 4} y={PAD_T - 16} className="tv-cut">
                레벨 {c.level} · {c.k}개
              </text>
            </g>
          ))}

          {/* 가지 */}
          {tree.nodes.map((n) => {
            if (n.left == null || n.right == null) return null;
            const x = xOf(n.height);
            const yl = yOf.get(n.left)!, yr = yOf.get(n.right)!;
            const xl = xOf(nodes.get(n.left)!.height);
            const xr = xOf(nodes.get(n.right)!.height);
            const c = color.get(n.id) ?? "#7b8794";
            return (
              <g key={n.id} opacity={dim(n.id)}
                 onMouseEnter={() => setHover(n.id)}
                 onMouseLeave={() => setHover(null)}
                 onClick={() => selectNode(selectedNode === n.id ? null : n.id)}
                 style={{ cursor: "pointer" }}>
                <line x1={x} y1={yl} x2={x} y2={yr} stroke={c} strokeWidth="1.6" />
                <line x1={x} y1={yl} x2={xl} y2={yl} stroke={c} strokeWidth="1.6" />
                <line x1={x} y1={yr} x2={xr} y2={yr} stroke={c} strokeWidth="1.6" />
                {/* 클릭 판정을 넓히는 투명 띠 */}
                <rect x={x - 5} y={Math.min(yl, yr)} width="10"
                      height={Math.abs(yr - yl)} fill="transparent" />
                {(() => {
                  // 27개를 다 띄우면 가지 위에서 겹쳐 읽을 수 없다.
                  // 레벨 0(지도의 큰 영역)만 상시로 두고 나머지는 짚었을 때만.
                  const show = topSet.has(n.id) || hover === n.id || selectedNode === n.id;
                  if (!show || n.n_leaves < 2) return null;
                  // 루트 쪽 노드는 x가 왼쪽 끝이라 오른쪽으로 붙여 쓴다
                  const flip = x < 120;
                  return (
                    <text x={flip ? x + 6 : x - 6} y={(yl + yr) / 2 - 5}
                          textAnchor={flip ? "start" : "end"}
                          className={
                            n.id === selectedNode ? "tv-node tv-node--on"
                            : topSet.has(n.id) ? "tv-node tv-node--top" : "tv-node"
                          }>
                      {n.label}
                    </text>
                  );
                })()}
              </g>
            );
          })}

          {/* 잎: 이름 + 편수 막대 */}
          {leaves.map((n) => {
            const y = yOf.get(n.id)!;
            const x = xOf(0);
            const c = color.get(n.id) ?? "#7b8794";
            return (
              <g key={n.id} opacity={dim(n.id)}
                 onMouseEnter={() => setHover(n.id)}
                 onMouseLeave={() => setHover(null)}
                 onClick={() => selectNode(selectedNode === n.id ? null : n.id)}
                 style={{ cursor: "pointer" }}>
                <circle cx={x} cy={y} r="3" fill={c} />
                <text x={x + 9} y={y + 3.5} className="tv-leaf" fill={c}>
                  {n.label}
                </text>
                <rect x={width - BAR_W} y={y - 4.5}
                      width={Math.max(1.5, (n.size / maxSize) * (BAR_W - 42))}
                      height="9" fill={c} opacity="0.5" rx="1" />
                <text x={width - 2} y={y + 3.5} className="tv-size">
                  {n.size.toLocaleString()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selectedNode != null && (
        <div className="tree-sel">
          <b>{nodes.get(selectedNode)?.label}</b>
          <span>
            {nodes.get(selectedNode)?.size.toLocaleString()}편 ·
            클러스터 {nodes.get(selectedNode)?.n_leaves}개
          </span>
          <button onClick={() => setView("map")}>지도에서 보기 →</button>
          <button className="ghost" onClick={() => selectNode(null)}>해제</button>
        </div>
      )}
    </div>
  );
}
