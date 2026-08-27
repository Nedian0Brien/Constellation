import { useEffect, useMemo, useState } from "react";
import { fetchLineage, type LineageData } from "../api";
import { useStore } from "../store";

const ROW = 34;        // 한 해 높이
const PAD_T = 46;
const PAD_L = 90;      // 왼쪽 연도 칸
const SPINE = 210;     // 메인패스가 놓이는 x
const SIDE = 150;      // 곁가지가 퍼지는 폭

export default function LineageView() {
  const run = useStore((s) => s.map?.run_id);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const [data, setData] = useState<LineageData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!run) return;
    let alive = true;
    setErr(null);
    fetchLineage(run, selected ?? undefined, 2)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e.message ?? e)));
    return () => { alive = false; };
  }, [run, selected]);

  const layout = useMemo(() => {
    if (!data) return null;
    const nodes = new Map(data.nodes.map((n) => [n.id, n]));
    const mainSet = new Set(data.main_path);
    const years = data.nodes.map((n) => n.year).filter((y): y is number => y != null);
    if (!years.length) return null;
    const y0 = Math.min(...years), y1 = Math.max(...years);
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
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    return {
      nodes, pos, mainSet, y0, y1,
      // 라벨이 노드 오른쪽으로 최대 ~320px 뻗는다. 그만큼 더 잡아야 안 잘린다.
      width: PAD_L + (maxX - minX) + 420,
      height: PAD_T + (y1 - y0 + 1) * ROW + 30,
      shift: PAD_L - minX + 30,
    };
  }, [data]);

  if (err) {
    return (
      <div className="tree-empty">
        <p>계보를 불러오지 못했다.</p>
        <p className="dim"><code>constellation lineage</code> 를 돌려라.</p>
      </div>
    );
  }
  if (!data || !layout) return <div className="map-empty">계보를 불러오는 중…</div>;

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
          위가 과거, 아래가 현재. 굵은 선이 SPC 메인패스 —
          인용만으로 뽑은 이 분야의 척추다. 지도에서 논문을 고르면 그 주변이 함께 뜬다.
        </span>
        {data.seed && (
          <button className="ghost-btn" onClick={() => select(null)}>
            메인패스만 보기
          </button>
        )}
      </div>

      <div className="flow-scroll">
        <svg width={width} height={height} role="img"
             aria-label="인용 계보 그래프. 세로축은 연도, 굵은 선은 SPC 메인패스.">
          {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map((y) => (
            <g key={y}>
              <line x1={PAD_L} y1={PAD_T + (y - y0) * ROW} x2={width - 20}
                    y2={PAD_T + (y - y0) * ROW}
                    stroke="var(--rule)" strokeWidth="1" opacity="0.45" />
              <text x={PAD_L - 10} y={PAD_T + (y - y0) * ROW + 4}
                    className="lv-year">{y}</text>
            </g>
          ))}

          {data.edges.map((e, i) => {
            const a = P(e.from), b = P(e.to);
            if (!a || !b) return null;
            const on = !hover || hover === e.from || hover === e.to;
            const mx = (a.x + b.x) / 2;
            return (
              <path key={i}
                    d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`}
                    fill="none"
                    stroke={e.main ? "var(--accent)" : "currentColor"}
                    strokeWidth={e.main ? 2.6 : 1}
                    opacity={e.main ? (on ? 0.95 : 0.35) : (on ? 0.22 : 0.06)} />
            );
          })}

          {data.nodes.map((n) => {
            const p = P(n.id);
            if (!p) return null;
            const isMain = mainSet.has(n.id);
            const isSel = n.id === selected;
            const r = isMain ? 5.5 : 3.2;
            return (
              <g key={n.id}
                 onMouseEnter={() => setHover(n.id)}
                 onMouseLeave={() => setHover(null)}
                 onClick={() => select(n.id)}
                 style={{ cursor: "pointer" }}>
                <circle cx={p.x} cy={p.y} r={isSel ? r + 2.5 : r}
                        fill={isSel ? "#fff" : isMain ? "var(--accent)" : "var(--ink-faint)"} />
                {(isMain || isSel || hover === n.id) && (
                  <text x={p.x + 10} y={p.y + 3.5}
                        className={isMain ? "lv-lab lv-lab--main" : "lv-lab"}>
                    {(n.title ?? "").slice(0, 52)}
                    {(n.title ?? "").length > 52 ? "…" : ""}
                    <tspan className="lv-cite"> {n.cited.toLocaleString()}</tspan>
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
