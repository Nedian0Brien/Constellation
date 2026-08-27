import { useEffect, useMemo, useState } from "react";
import { fetchFlow, fetchFlowPapers, type FlowData, type FlowPaper } from "../api";
import { useStore } from "../store";

const COL_W = 260;      // 창 사이 간격
const NODE_W = 15;
const PAD_T = 54;
const PAD_L = 26;
const GAP = 5;          // 같은 창 안 노드 사이 간격
const MIN_H = 3;

type Signal = "all" | "citation" | "semantic" | "author";

const SIGNALS: { key: Signal; label: string }[] = [
  { key: "all", label: "결합" },
  { key: "citation", label: "인용만" },
  { key: "semantic", label: "의미만" },
  { key: "author", label: "저자만" },
];

function hsl(h: number, s: number, l: number) {
  return `hsl(${h} ${s}% ${l}%)`;
}

export default function FlowView() {
  const run = useStore((s) => s.map?.run_id);
  const [data, setData] = useState<FlowData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [signal, setSignal] = useState<Signal>("all");
  const [sel, setSel] = useState<{ w: number; c: number } | null>(null);
  const [papers, setPapers] = useState<FlowPaper[] | null>(null);
  const [hoverFlow, setHoverFlow] = useState<number | null>(null);

  useEffect(() => {
    if (!run) return;
    let alive = true;
    setErr(null);
    fetchFlow(run)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e.message ?? e)));
    return () => { alive = false; };
  }, [run]);

  useEffect(() => {
    if (!run || !sel) { setPapers(null); return; }
    let alive = true;
    fetchFlowPapers(run, sel.w, sel.c)
      .then((p) => alive && setPapers(p))
      .catch(() => alive && setPapers([]));
    return () => { alive = false; };
  }, [run, sel]);

  const layout = useMemo(() => {
    if (!data) return null;
    const H = 660;
    const nWin = data.windows.length;

    // 신호를 바꾸면 흐름 굵기가 달라진다. 대상 클러스터 기준으로 다시 정규화한다.
    const flows = data.flows.map((f, i) => ({
      ...f,
      idx: i,
      raw: signal === "all" ? f.weight
        : signal === "citation" ? f.citation
        : signal === "semantic" ? f.semantic : f.author,
    }));
    const inSum = new Map<string, number>();
    for (const f of flows) {
      const k = `${f.to_window}:${f.to_cluster}`;
      inSum.set(k, (inSum.get(k) ?? 0) + f.raw);
    }
    const shown = flows
      .map((f) => {
        const k = `${f.to_window}:${f.to_cluster}`;
        const tot = inSum.get(k) ?? 0;
        return { ...f, w: tot > 0 ? f.raw / tot : 0 };
      })
      .filter((f) => f.w > 0.02);

    // 창별 노드. 높이는 편수에 비례한다.
    const byWin: any[][] = data.windows.map((w) =>
      data.clusters.filter((c) => c.window === w.idx).slice(),
    );
    const scale = Math.min(
      ...byWin.map((ns) => {
        const tot = ns.reduce((a, n) => a + n.size, 0);
        return (H - PAD_T - GAP * Math.max(0, ns.length - 1)) / Math.max(tot, 1);
      }),
    );

    // 교차를 줄인다 — 뒤 창 노드를 출처들의 평균 y로, 앞 창을 대상들의 평균 y로
    // 몇 번 왕복하며 정렬한다(barycenter). 완벽하진 않지만 리본이 훨씬 덜 엉킨다.
    const yOf = new Map<string, number>();
    const place = () => {
      byWin.forEach((ns) => {
        let y = PAD_T;
        ns.forEach((n) => {
          n.h = Math.max(MIN_H, n.size * scale);
          n.y = y;
          yOf.set(`${n.window}:${n.id}`, y + n.h / 2);
          y += n.h + GAP;
        });
      });
    };
    place();
    for (let pass = 0; pass < 3; pass++) {
      for (let t = 1; t < nWin; t++) {
        byWin[t].sort((a, b) => bary(a, t, -1) - bary(b, t, -1));
        place();
      }
      for (let t = nWin - 2; t >= 0; t--) {
        byWin[t].sort((a, b) => bary(a, t, +1) - bary(b, t, +1));
        place();
      }
    }
    function bary(n: any, t: number, dir: number): number {
      const rel = shown.filter((f) =>
        dir < 0 ? f.to_window === t && f.to_cluster === n.id
                : f.from_window === t && f.from_cluster === n.id);
      if (!rel.length) return n.y ?? 0;
      let num = 0, den = 0;
      for (const f of rel) {
        const key = dir < 0 ? `${f.from_window}:${f.from_cluster}`
                            : `${f.to_window}:${f.to_cluster}`;
        const y = yOf.get(key);
        if (y == null) continue;
        num += y * f.w; den += f.w;
      }
      return den ? num / den : (n.y ?? 0);
    }

    const node = new Map<string, any>();
    byWin.forEach((ns) => ns.forEach((n) => node.set(`${n.window}:${n.id}`, n)));

    // 포트: 대상 쪽은 유입 비율 그대로, 출처 쪽은 노드 높이에 맞춰 비례 배분
    const inAt = new Map<string, number>();
    const outTot = new Map<string, number>();
    for (const f of shown) {
      const sk = `${f.from_window}:${f.from_cluster}`;
      outTot.set(sk, (outTot.get(sk) ?? 0) + f.w * (node.get(`${f.to_window}:${f.to_cluster}`)?.h ?? 0));
    }
    const outAt = new Map<string, number>();
    const ribbons = shown
      .slice()
      .sort((a, b) => (node.get(`${a.from_window}:${a.from_cluster}`)?.y ?? 0)
                    - (node.get(`${b.from_window}:${b.from_cluster}`)?.y ?? 0))
      .map((f) => {
        const s = node.get(`${f.from_window}:${f.from_cluster}`);
        const d = node.get(`${f.to_window}:${f.to_cluster}`);
        if (!s || !d) return null;
        const th = Math.max(1, f.w * d.h);
        const dk = `${f.to_window}:${f.to_cluster}`;
        const sk = `${f.from_window}:${f.from_cluster}`;
        const dy = inAt.get(dk) ?? 0;
        inAt.set(dk, dy + th);
        const sTot = outTot.get(sk) ?? 1;
        const sTh = th / sTot * s.h;
        const sy = outAt.get(sk) ?? 0;
        outAt.set(sk, sy + sTh);
        return {
          ...f,
          x0: PAD_L + f.from_window * COL_W + NODE_W,
          x1: PAD_L + f.to_window * COL_W,
          sy0: s.y + sy, sy1: s.y + sy + sTh,
          dy0: d.y + dy, dy1: d.y + dy + th,
          hue: (f.from_cluster * 47 + f.from_window * 91) % 360,
        };
      })
      .filter(Boolean) as any[];

    return { byWin, node, ribbons, H, width: PAD_L * 2 + (nWin - 1) * COL_W + NODE_W + 220 };
  }, [data, signal]);

  if (err) {
    return (
      <div className="tree-empty">
        <p>흐름을 불러오지 못했다.</p>
        <p className="dim"><code>constellation flow</code> 를 돌려라.</p>
        <p className="dim" style={{ fontSize: 11 }}>{err}</p>
      </div>
    );
  }
  if (!data || !layout) return <div className="map-empty">흐름을 불러오는 중…</div>;

  const { byWin, node, ribbons, H, width } = layout;
  const selKey = sel ? `${sel.w}:${sel.c}` : null;
  const lit = (k: string) => {
    if (!selKey) return true;
    if (k === selKey) return true;
    return ribbons.some((r) =>
      (`${r.from_window}:${r.from_cluster}` === selKey && `${r.to_window}:${r.to_cluster}` === k) ||
      (`${r.to_window}:${r.to_cluster}` === selKey && `${r.from_window}:${r.from_cluster}` === k));
  };

  return (
    <div className="flow-wrap">
      <div className="tree-head">
        <span>
          창 {data.windows.length}개 · 클러스터 {data.clusters.length}개 · 흐름 {ribbons.length}개
        </span>
        <div className="seg flow-seg">
          {SIGNALS.map((s) => (
            <button key={s.key} className={signal === s.key ? "on" : ""}
                    onClick={() => setSignal(s.key)}>{s.label}</button>
          ))}
        </div>
        <span className="dim">
          리본 굵기 = 뒤 클러스터로 들어온 몫. 노드를 누르면 그 갈래만 남는다.
        </span>
      </div>

      <div className="flow-scroll">
        <svg width={width} height={H} role="img"
             aria-label="시간 창별 연구 갈래 흐름도">
          {data.windows.map((w) => (
            <g key={w.idx}>
              <text x={PAD_L + w.idx * COL_W} y={24} className="fv-win">
                {w.year_from}–{w.year_to}
              </text>
              <text x={PAD_L + w.idx * COL_W} y={38} className="fv-winsub">
                {w.n_works.toLocaleString()}편 · {w.n_clusters}개
              </text>
            </g>
          ))}

          {ribbons.map((r, i) => {
            const k1 = `${r.from_window}:${r.from_cluster}`;
            const k2 = `${r.to_window}:${r.to_cluster}`;
            const on = !selKey || k1 === selKey || k2 === selKey;
            const mx = (r.x0 + r.x1) / 2;
            const d = `M${r.x0},${r.sy0} C${mx},${r.sy0} ${mx},${r.dy0} ${r.x1},${r.dy0}`
                    + ` L${r.x1},${r.dy1} C${mx},${r.dy1} ${mx},${r.sy1} ${r.x0},${r.sy1} Z`;
            return (
              <path key={i} d={d} fill={hsl(r.hue, 55, 58)}
                    opacity={hoverFlow === i ? 0.75 : on ? 0.3 : 0.05}
                    onMouseEnter={() => setHoverFlow(i)}
                    onMouseLeave={() => setHoverFlow(null)} />
            );
          })}

          {byWin.map((ns) =>
            ns.map((n: any) => {
              const k = `${n.window}:${n.id}`;
              const on = lit(k);
              return (
                <g key={k} opacity={on ? 1 : 0.22}
                   onClick={() => setSel(selKey === k ? null : { w: n.window, c: n.id })}
                   style={{ cursor: "pointer" }}>
                  <rect x={PAD_L + n.window * COL_W} y={n.y}
                        width={NODE_W} height={n.h} rx="2"
                        fill={k === selKey ? "var(--accent)" : hsl((n.id * 47 + n.window * 91) % 360, 50, 60)} />
                  {n.h >= 11 && (
                    <text x={PAD_L + n.window * COL_W + NODE_W + 5} y={n.y + n.h / 2 + 3.5}
                          className={k === selKey ? "fv-lab fv-lab--on" : "fv-lab"}>
                      {n.label.length > 30 ? n.label.slice(0, 29) + "…" : n.label}
                      <tspan className="fv-sz"> {n.size}</tspan>
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>

      {hoverFlow != null && ribbons[hoverFlow] && (() => {
        const r = ribbons[hoverFlow];
        const s = node.get(`${r.from_window}:${r.from_cluster}`);
        const d = node.get(`${r.to_window}:${r.to_cluster}`);
        return (
          <div className="flow-tip">
            <div className="ft-pair">{s?.label} <b>→</b> {d?.label}</div>
            <div className="ft-sig">
              <span>인용 <b>{(r.citation * 100).toFixed(0)}%</b> ({r.n_papers}건)</span>
              <span>의미 <b>{(r.semantic * 100).toFixed(0)}%</b></span>
              <span>저자 <b>{(r.author * 100).toFixed(0)}%</b></span>
              <span className="ft-tot">유입 몫 <b>{(r.w * 100).toFixed(0)}%</b></span>
            </div>
          </div>
        );
      })()}

      {sel && (
        <aside className="detail flow-detail">
          <button className="close" onClick={() => setSel(null)}>✕</button>
          <div className="cl-eyebrow">
            {data.windows[sel.w].year_from}–{data.windows[sel.w].year_to}
          </div>
          <h2>{node.get(`${sel.w}:${sel.c}`)?.label}</h2>
          <div className="meta-row">
            <span className="tag">{node.get(`${sel.w}:${sel.c}`)?.size.toLocaleString()}편</span>
          </div>
          <div className="topics">
            {(node.get(`${sel.w}:${sel.c}`)?.keywords ?? []).map((x: string) => (
              <span key={x} className="topic topic--facet">{x}</span>
            ))}
          </div>
          <div className="cl-sec">피인용 상위</div>
          <ol className="cl-works">
            {(papers ?? []).map((p) => (
              <li key={p.id}>
                <button onClick={() => useStore.getState().select(p.id)}>
                  <span className="ht">{p.title}</span>
                  <span className="hm">{p.year ?? "—"} · {p.cited.toLocaleString()}</span>
                </button>
              </li>
            ))}
            {papers && !papers.length && <li className="dim">불러오지 못했다.</li>}
          </ol>
        </aside>
      )}
    </div>
  );
}
