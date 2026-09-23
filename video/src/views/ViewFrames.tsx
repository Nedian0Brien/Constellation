import { useMemo } from "react";
import type {
  FlowData,
  LineageData,
  TreeData,
} from "../../../frontend/src/api";
import {
  BAR_W,
  PAD_B as TREE_PAD_B,
  PAD_T as TREE_PAD_T,
  treeLayout,
} from "../../../frontend/src/views/tree/layout";
import {
  COL_W,
  NODE_W,
  PAD_L as FLOW_PAD_L,
  flowLayout,
  hsl,
} from "../../../frontend/src/views/flow/layout";
import {
  PAD_L as LIN_PAD_L,
  PAD_T as LIN_PAD_T,
  ROW as LIN_ROW,
  lineageLayout,
} from "../../../frontend/src/views/lineage/layout";

// 계층 트리·갈래 흐름·인용 계보를 앱과 같은 배치(views/*/layout.ts)와 마크업으로 그린다.
// 앱 뷰에서 호버·클릭 핸들러와 선택 카드만 뺐다. `pan`(0~1)으로 세로로 훑는다.

export function TreeFrame({ tree, pan }: { tree: TreeData; pan: number }) {
  const layout = useMemo(() => treeLayout(tree)!, [tree]);
  const {
    nodes,
    leaves,
    xOf,
    yOf,
    color,
    maxSize,
    cuts,
    topSet,
    width,
    height,
  } = layout;
  return (
    <div className="tree-wrap">
      <div className="tree-head">
        <span>
          클러스터 {leaves.length}개 · 노드 {tree.nodes.length}개 · ward · 2D
          좌표
        </span>
        <span className="dim">
          왼쪽일수록 일찍 갈라진 갈래다. 가지를 누르면 지도에서 그 부분만
          남는다.
        </span>
      </div>
      <Pan height={height} pan={pan}>
        <svg width={width} height={height}>
          {cuts.map((c) => (
            <g key={c.level}>
              <line
                x1={xOf(c.h)}
                y1={TREE_PAD_T - 14}
                x2={xOf(c.h)}
                y2={height - TREE_PAD_B}
                stroke="var(--rule-strong, #37444f)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              <text x={xOf(c.h) + 4} y={TREE_PAD_T - 16} className="tv-cut">
                레벨 {c.level} · {c.k}개
              </text>
            </g>
          ))}
          {tree.nodes.map((n) => {
            if (n.left == null || n.right == null) return null;
            const x = xOf(n.height);
            const yl = yOf.get(n.left)!,
              yr = yOf.get(n.right)!;
            const xl = xOf(nodes.get(n.left)!.height);
            const xr = xOf(nodes.get(n.right)!.height);
            const c = color.get(n.id) ?? "#7b8794";
            const flip = x < 120;
            return (
              <g key={n.id}>
                <line
                  x1={x}
                  y1={yl}
                  x2={x}
                  y2={yr}
                  stroke={c}
                  strokeWidth="1.6"
                />
                <line
                  x1={x}
                  y1={yl}
                  x2={xl}
                  y2={yl}
                  stroke={c}
                  strokeWidth="1.6"
                />
                <line
                  x1={x}
                  y1={yr}
                  x2={xr}
                  y2={yr}
                  stroke={c}
                  strokeWidth="1.6"
                />
                {topSet.has(n.id) && n.n_leaves >= 2 && (
                  <text
                    x={flip ? x + 6 : x - 6}
                    y={(yl + yr) / 2 - 5}
                    textAnchor={flip ? "start" : "end"}
                    className="tv-node tv-node--top"
                  >
                    {n.label}
                  </text>
                )}
              </g>
            );
          })}
          {leaves.map((n) => {
            const y = yOf.get(n.id)!;
            const x = xOf(0);
            const c = color.get(n.id) ?? "#7b8794";
            return (
              <g key={n.id}>
                <circle cx={x} cy={y} r="3" fill={c} />
                <text x={x + 9} y={y + 3.5} className="tv-leaf" fill={c}>
                  {n.label}
                </text>
                <rect
                  x={width - BAR_W}
                  y={y - 4.5}
                  width={Math.max(1.5, (n.size / maxSize) * (BAR_W - 42))}
                  height="9"
                  fill={c}
                  opacity="0.5"
                  rx="1"
                />
                <text x={width - 2} y={y + 3.5} className="tv-size">
                  {n.size.toLocaleString()}
                </text>
              </g>
            );
          })}
        </svg>
      </Pan>
    </div>
  );
}

export function FlowFrame({ data, pan }: { data: FlowData; pan: number }) {
  const layout = useMemo(() => flowLayout(data, "all")!, [data]);
  const { byWin, ribbons, H, width } = layout;
  return (
    <div className="flow-wrap">
      <div className="tree-head">
        <span>
          창 {data.windows.length}개 · 클러스터 {data.clusters.length}개 · 흐름{" "}
          {ribbons.length}개
        </span>
        <span className="dim">
          리본 굵기 = 뒤 클러스터로 들어온 몫. 노드를 누르면 그 갈래만 남는다.
        </span>
      </div>
      <Pan height={H} pan={pan}>
        <svg width={width} height={H}>
          {data.windows.map((w) => (
            <g key={w.idx}>
              <text x={FLOW_PAD_L + w.idx * COL_W} y={24} className="fv-win">
                {w.year_from}–{w.year_to}
              </text>
              <text x={FLOW_PAD_L + w.idx * COL_W} y={38} className="fv-winsub">
                {w.n_works.toLocaleString()}편 · {w.n_clusters}개
              </text>
            </g>
          ))}
          {ribbons.map((r, i) => {
            const mx = (r.x0 + r.x1) / 2;
            const d =
              `M${r.x0},${r.sy0} C${mx},${r.sy0} ${mx},${r.dy0} ${r.x1},${r.dy0}` +
              ` L${r.x1},${r.dy1} C${mx},${r.dy1} ${mx},${r.sy1} ${r.x0},${r.sy1} Z`;
            return (
              <path key={i} d={d} fill={hsl(r.hue, 55, 58)} opacity={0.3} />
            );
          })}
          {byWin.map((ns) =>
            ns.map(
              (n: {
                window: number;
                id: number;
                y: number;
                h: number;
                label: string;
                size: number;
              }) => (
                <g key={`${n.window}:${n.id}`}>
                  <rect
                    x={FLOW_PAD_L + n.window * COL_W}
                    y={n.y}
                    width={NODE_W}
                    height={n.h}
                    rx="2"
                    fill={hsl((n.id * 47 + n.window * 91) % 360, 50, 60)}
                  />
                  {n.h >= 11 && (
                    <text
                      x={FLOW_PAD_L + n.window * COL_W + NODE_W + 5}
                      y={n.y + n.h / 2 + 3.5}
                      className="fv-lab"
                    >
                      {n.label.length > 30
                        ? n.label.slice(0, 29) + "…"
                        : n.label}
                      <tspan className="fv-sz"> {n.size}</tspan>
                    </text>
                  )}
                </g>
              ),
            ),
          )}
        </svg>
      </Pan>
    </div>
  );
}

export function LineageFrame({
  data,
  pan,
}: {
  data: LineageData;
  pan: number;
}) {
  const layout = useMemo(() => lineageLayout(data)!, [data]);
  const { pos, mainSet, y0, y1, width, height, shift } = layout;
  const P = (id: string) => {
    const p = pos.get(id);
    return p ? { x: p.x + shift, y: p.y } : null;
  };
  return (
    <div className="flow-wrap">
      <div className="tree-head">
        <span>
          메인패스 {data.main_path.length}편
          {data.seed ? ` · 선택 논문 주변 ${data.nodes.length}편` : ""}
        </span>
        <span className="dim">
          위가 과거, 아래가 현재. 굵은 선이 SPC 메인패스 — 인용만으로 뽑은 이
          분야의 척추다. 지도에서 논문을 고르면 그 주변이 함께 뜬다.
        </span>
      </div>
      <Pan height={height} pan={pan}>
        <svg width={width} height={height}>
          {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map((y) => (
            <g key={y}>
              <line
                x1={LIN_PAD_L}
                y1={LIN_PAD_T + (y - y0) * LIN_ROW}
                x2={width - 20}
                y2={LIN_PAD_T + (y - y0) * LIN_ROW}
                stroke="var(--rule)"
                strokeWidth="1"
                opacity="0.45"
              />
              <text
                x={LIN_PAD_L - 10}
                y={LIN_PAD_T + (y - y0) * LIN_ROW + 4}
                className="lv-year"
              >
                {y}
              </text>
            </g>
          ))}
          {data.edges.map((e, i) => {
            const a = P(e.from),
              b = P(e.to);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            return (
              <path
                key={i}
                d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`}
                fill="none"
                stroke={e.main ? "var(--accent)" : "currentColor"}
                strokeWidth={e.main ? 2.6 : 1}
                opacity={e.main ? 0.95 : 0.22}
              />
            );
          })}
          {data.nodes.map((n) => {
            const p = P(n.id);
            if (!p) return null;
            const isMain = mainSet.has(n.id);
            const isSel = n.id === data.seed;
            const r = isMain ? 5.5 : 3.2;
            return (
              <g key={n.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSel ? r + 2.5 : r}
                  fill={
                    isSel
                      ? "#fff"
                      : isMain
                        ? "var(--accent)"
                        : "var(--ink-faint)"
                  }
                />
                {(isMain || isSel) && (
                  <text
                    x={p.x + 10}
                    y={p.y + 3.5}
                    className={isMain ? "lv-lab lv-lab--main" : "lv-lab"}
                  >
                    {(n.title ?? "").slice(0, 52)}
                    {(n.title ?? "").length > 52 ? "…" : ""}
                    <tspan className="lv-cite">
                      {" "}
                      {n.cited.toLocaleString()}
                    </tspan>
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </Pan>
    </div>
  );
}

// 앱의 스크롤 영역(`.tree-scroll`·`.flow-scroll`)을 프레임 기반 세로 이동으로 바꾼다.
function Pan({
  height,
  pan,
  children,
}: {
  height: number;
  pan: number;
  children: React.ReactNode;
}) {
  const visible = 720 - 40; // 컴포지션 높이 − 머리줄
  const travel = Math.max(0, height + 40 - visible);
  return (
    <div className="flow-scroll" style={{ overflow: "hidden" }}>
      <div style={{ transform: `translateY(${-travel * pan}px)` }}>
        {children}
      </div>
    </div>
  );
}
