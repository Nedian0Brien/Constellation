const BASE = "/api";

export interface MapData {
  run_id: string;
  n: number;
  id: string[];
  x: number[];
  y: number[];
  z: number[];
  year: (number | null)[];
  cited: number[];
  has_abstract: boolean[];
  title: string[];
  cluster: number[];
}

export interface ClusterInfo {
  cluster_id: number;
  label: string;
  keywords: string[];
  size: number;
  x: number;
  y: number;
  year_median: number | null;
  top_work_id: string | null;
  top_work_title: string | null;
}

export interface ClusterDetail extends Omit<
  ClusterInfo,
  "x" | "y" | "top_work_id" | "top_work_title"
> {
  top_works: {
    id: string;
    title: string;
    year: number | null;
    cited: number;
  }[];
  by_year: { year: number; n: number }[];
}

export interface TreeNode {
  id: number;
  parent: number | null;
  left: number | null;
  right: number | null;
  height: number;
  size: number;
  n_leaves: number;
  cluster_id: number | null;
  x: number;
  y: number;
  leaf_order: number | null;
  label: string;
  label_src: string;
  keywords: string[];
}

export interface TreeData {
  run_id: string;
  nodes: TreeNode[];
  levels: Record<string, number[]>;
}

export interface FlowData {
  run_id: string;
  windows: {
    idx: number;
    year_from: number;
    year_to: number;
    n_works: number;
    n_clusters: number;
  }[];
  clusters: {
    window: number;
    id: number;
    label: string;
    label_src: string;
    keywords: string[];
    size: number;
  }[];
  flows: {
    from_window: number;
    from_cluster: number;
    to_window: number;
    to_cluster: number;
    weight: number;
    citation: number;
    semantic: number;
    author: number;
    n_papers: number;
  }[];
}

export interface FlowPaper {
  id: string;
  title: string;
  year: number | null;
  cited: number;
}

export interface LineageData {
  run_id: string;
  seed: string | null;
  nodes: {
    id: string;
    title: string;
    year: number | null;
    cited: number;
    venue: string | null;
  }[];
  edges: { from: string; to: string; spc: number; main: boolean }[];
  main_path: string[];
}

export interface Work {
  id: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  cited_by_count: number | null;
  type: string | null;
  source: string;
  authors: string[];
  topics: { name: string; kind: string }[];
  refs_in_corpus: number;
  cited_by_in_corpus: number;
}

export interface SearchHit {
  id: string;
  title: string;
  year: number | null;
  cited_by_count: number | null;
}

export interface RunInfo {
  run_id: string;
  model: string | null;
  params: string | null;
  n_items: number;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(BASE + path, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new ApiError(
      response.status,
      typeof detail === "string" ? detail : `요청 실패 (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}
export function params(values: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== null && value !== "")
      p.set(key, String(value));
  return p.toString();
}
export const fetchRuns = (signal?: AbortSignal) =>
  get<RunInfo[]>("/runs", signal);
export const fetchMap = (run?: string, signal?: AbortSignal) =>
  get<MapData>("/map?" + params({ run }), signal);
export const fetchWork = (id: string, run?: string, signal?: AbortSignal) =>
  get<Work>("/works/" + encodeURIComponent(id) + "?" + params({ run }), signal);
export const fetchClusters = (run: string, signal?: AbortSignal) =>
  get<ClusterInfo[]>("/clusters?" + params({ run }), signal);
export const fetchClusterDetail = (
  run: string,
  id: number,
  signal?: AbortSignal,
) => get<ClusterDetail>(`/clusters/${id}?` + params({ run }), signal);
export const fetchTree = (run: string, signal?: AbortSignal) =>
  get<TreeData>("/tree?" + params({ run }), signal);
export const fetchFlow = (run: string, signal?: AbortSignal) =>
  get<FlowData>("/flow?" + params({ run }), signal);
export const fetchFlowPapers = (
  run: string,
  w: number,
  c: number,
  signal?: AbortSignal,
) =>
  get<FlowPaper[]>(
    "/flow/papers?" + params({ run, window: w, cluster: c }),
    signal,
  );
export const fetchLineage = (
  run: string,
  seed?: string,
  depth = 2,
  signal?: AbortSignal,
) => get<LineageData>("/lineage?" + params({ run, seed, depth }), signal);
export interface PaperRow {
  id: string;
  title: string;
  year: number | null;
  cited_by_count: number | null;
  has_abstract: boolean;
}
export interface PaperPage {
  items: PaperRow[];
  total: number;
  page: number;
  page_size: number;
}
export interface Matches {
  ids: string[];
  total: number;
}
export interface Filters {
  run: string;
  q?: string;
  year_from?: number;
  year_to?: number;
}
export const fetchMatches = (filters: Filters, signal?: AbortSignal) =>
  get<Matches>("/matches?" + params({ ...filters }), signal);
export const fetchPapers = (
  filters: Filters,
  sort: string,
  order: string,
  page: number,
  signal?: AbortSignal,
) =>
  get<PaperPage>(
    "/works?" + params({ ...filters, sort, order, page, page_size: 25 }),
    signal,
  );
