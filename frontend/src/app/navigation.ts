export const views = ["map", "tree", "flow", "lineage", "sky"] as const;
export type View = (typeof views)[number];
export type ColorBy = "cluster" | "year" | "cited" | "abstract";
export interface Exploration {
  view: View;
  run?: string;
  q: string;
  from?: number;
  to?: number;
  selected?: string;
  cluster?: number;
  node?: number;
  list: boolean;
  sort: "title" | "year" | "cited";
  order: "asc" | "desc";
  page: number;
  color: ColorBy;
}
const number = (v: unknown, min: number, max: number) => {
  if (v === undefined || v === "" || v === null || typeof v === "boolean")
    return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};
const string = (v: unknown, max = 200) =>
  typeof v === "string" && v.length ? v.slice(0, max) : undefined;
export function parseSearch(s: Record<string, unknown>): Exploration {
  let from = number(s.from, 0, 9999),
    to = number(s.to, 0, 9999);
  if (from !== undefined && to !== undefined && from > to) {
    from = undefined;
    to = undefined;
  }
  return {
    view: views.includes(s.view as View) ? (s.view as View) : "map",
    run: string(s.run),
    q: (string(s.q, 500) ?? "").trim(),
    from,
    to,
    selected: string(s.selected),
    cluster: number(s.cluster, 0, 1000000),
    node: number(s.node, 0, 1000000),
    list: s.list === true || s.list === "true",
    sort: ["title", "year", "cited"].includes(String(s.sort))
      ? (s.sort as Exploration["sort"])
      : "cited",
    order: s.order === "asc" ? "asc" : "desc",
    page: number(s.page, 1, 1000000) ?? 1,
    color: ["cluster", "year", "cited", "abstract"].includes(String(s.color))
      ? (s.color as ColorBy)
      : "cluster",
  };
}
export function changeSearch(
  previous: Exploration,
  patch: Partial<Exploration>,
): Exploration {
  const next = { ...previous, ...patch };
  if (
    "run" in patch &&
    previous.run !== undefined &&
    patch.run !== previous.run
  ) {
    next.cluster = undefined;
    next.node = undefined;
    next.selected = undefined;
    next.from = undefined;
    next.to = undefined;
    next.page = 1;
  }
  if (["q", "from", "to", "sort", "order"].some((k) => k in patch))
    next.page = 1;
  return parseSearch(next);
}
