import { useQuery } from "@tanstack/react-query";
import { DataState } from "../components/DataState";
import { useMemo, useState } from "react";
import { fetchLineage } from "../api";
import { lineageLayout, ROW, PAD_T, PAD_L } from "./lineage/layout";
import { useWorkspace } from "../hooks/use-workspace";

export default function LineageView() {
  const workspace = useWorkspace();
  const run = workspace.map?.run_id;
  const selected = workspace.selected;
  const select = workspace.select;
  const result = useQuery({
    queryKey: ["lineage", run, selected],
    queryFn: ({ signal }) =>
      fetchLineage(run!, selected ?? undefined, 2, signal),
    enabled: !!run,
  });
  const data = result.data;
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => lineageLayout(data), [data]);

  if (result.isError || !data || !layout)
    return (
      <DataState
        error={result.error}
        loading={result.isPending}
        retry={() => result.refetch()}
        title="인용 계보 결과가 없습니다"
      />
    );

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
        {data.seed && (
          <button className="ghost-btn" onClick={() => select(null)}>
            메인패스만 보기
          </button>
        )}
      </div>

      <div className="flow-scroll">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="인용 계보 그래프. 세로축은 연도, 굵은 선은 SPC 메인패스."
        >
          {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map((y) => (
            <g key={y}>
              <line
                x1={PAD_L}
                y1={PAD_T + (y - y0) * ROW}
                x2={width - 20}
                y2={PAD_T + (y - y0) * ROW}
                stroke="var(--rule)"
                strokeWidth="1"
                opacity="0.45"
              />
              <text
                x={PAD_L - 10}
                y={PAD_T + (y - y0) * ROW + 4}
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
            const on = !hover || hover === e.from || hover === e.to;
            const mx = (a.x + b.x) / 2;
            return (
              <path
                key={i}
                d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`}
                fill="none"
                stroke={e.main ? "var(--accent)" : "currentColor"}
                strokeWidth={e.main ? 2.6 : 1}
                opacity={e.main ? (on ? 0.95 : 0.35) : on ? 0.22 : 0.06}
              />
            );
          })}

          {data.nodes.map((n) => {
            const p = P(n.id);
            if (!p) return null;
            const isMain = mainSet.has(n.id);
            const isSel = n.id === selected;
            const r = isMain ? 5.5 : 3.2;
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => select(n.id)}
                style={{ cursor: "pointer" }}
              >
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
                {(isMain || isSel || hover === n.id) && (
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
      </div>
    </div>
  );
}
