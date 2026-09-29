import type { FlowData } from "../../api";

// 갈래 흐름(시간 창별 리본)의 배치. FlowView와 홍보 영상(video/)이 같이 쓴다.
export const COL_W = 260; // 창 사이 간격
export const NODE_W = 15;
export const PAD_T = 54;
export const PAD_L = 26;
export const GAP = 5; // 같은 창 안 노드 사이 간격
export const MIN_H = 3;

export type Signal = "all" | "citation" | "semantic" | "author";

export const SIGNALS: { key: Signal; label: string }[] = [
  { key: "all", label: "결합" },
  { key: "citation", label: "인용만" },
  { key: "semantic", label: "의미만" },
  { key: "author", label: "저자만" },
];

export function hsl(h: number, s: number, l: number) {
  return `hsl(${h} ${s}% ${l}%)`;
}

export type FlowLayout = NonNullable<ReturnType<typeof flowLayout>>;

export function flowLayout(data: FlowData | null | undefined, signal: Signal) {
  if (!data) return null;
  const H = 660;
  const nWin = data.windows.length;

  // 신호를 바꾸면 흐름 굵기가 달라진다. 대상 클러스터 기준으로 다시 정규화한다.
  const flows = data.flows.map((f, i) => ({
    ...f,
    idx: i,
    raw:
      signal === "all"
        ? f.weight
        : signal === "citation"
          ? f.citation
          : signal === "semantic"
            ? f.semantic
            : f.author,
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
      dir < 0
        ? f.to_window === t && f.to_cluster === n.id
        : f.from_window === t && f.from_cluster === n.id,
    );
    if (!rel.length) return n.y ?? 0;
    let num = 0,
      den = 0;
    for (const f of rel) {
      const key =
        dir < 0
          ? `${f.from_window}:${f.from_cluster}`
          : `${f.to_window}:${f.to_cluster}`;
      const y = yOf.get(key);
      if (y == null) continue;
      num += y * f.w;
      den += f.w;
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
    outTot.set(
      sk,
      (outTot.get(sk) ?? 0) +
        f.w * (node.get(`${f.to_window}:${f.to_cluster}`)?.h ?? 0),
    );
  }
  const outAt = new Map<string, number>();
  const ribbons = shown
    .slice()
    .sort(
      (a, b) =>
        (node.get(`${a.from_window}:${a.from_cluster}`)?.y ?? 0) -
        (node.get(`${b.from_window}:${b.from_cluster}`)?.y ?? 0),
    )
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
      const sTh = (th / sTot) * s.h;
      const sy = outAt.get(sk) ?? 0;
      outAt.set(sk, sy + sTh);
      return {
        ...f,
        x0: PAD_L + f.from_window * COL_W + NODE_W,
        x1: PAD_L + f.to_window * COL_W,
        sy0: s.y + sy,
        sy1: s.y + sy + sTh,
        dy0: d.y + dy,
        dy1: d.y + dy + th,
        hue: (f.from_cluster * 47 + f.from_window * 91) % 360,
      };
    })
    .filter(Boolean) as any[];

  return {
    byWin,
    node,
    ribbons,
    H,
    width: PAD_L * 2 + (nWin - 1) * COL_W + NODE_W + 220,
  };
}
