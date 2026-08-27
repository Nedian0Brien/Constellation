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

export interface ClusterDetail extends Omit<ClusterInfo, "x" | "y" | "top_work_id" | "top_work_title"> {
  top_works: { id: string; title: string; year: number | null; cited: number }[];
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
  windows: { idx: number; year_from: number; year_to: number; n_works: number; n_clusters: number }[];
  clusters: { window: number; id: number; label: string; label_src: string; keywords: string[]; size: number }[];
  flows: {
    from_window: number; from_cluster: number; to_window: number; to_cluster: number;
    weight: number; citation: number; semantic: number; author: number; n_papers: number;
  }[];
}

export interface FlowPaper { id: string; title: string; year: number | null; cited: number }

export interface LineageData {
  run_id: string;
  seed: string | null;
  nodes: { id: string; title: string; year: number | null; cited: number; venue: string | null }[];
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

async function get<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  return r.json() as Promise<T>;
}

export const fetchRuns = () => get<RunInfo[]>("/runs");
export const fetchMap = (run?: string) =>
  get<MapData>("/map" + (run ? `?run=${encodeURIComponent(run)}` : ""));
export const fetchWork = (id: string) => get<Work>(`/works/${id}`);
export const fetchClusters = (run: string) =>
  get<ClusterInfo[]>(`/clusters?run=${encodeURIComponent(run)}`);
export const fetchClusterDetail = (run: string, id: number) =>
  get<ClusterDetail>(`/clusters/${id}?run=${encodeURIComponent(run)}`);
export const fetchTree = (run: string) =>
  get<TreeData>(`/tree?run=${encodeURIComponent(run)}`);
export const fetchFlow = (run: string) =>
  get<FlowData>(`/flow?run=${encodeURIComponent(run)}`);
export const fetchFlowPapers = (run: string, w: number, c: number) =>
  get<FlowPaper[]>(`/flow/papers?run=${encodeURIComponent(run)}&window=${w}&cluster=${c}`);
export const fetchLineage = (run: string, seed?: string, depth = 2) =>
  get<LineageData>(
    `/lineage?run=${encodeURIComponent(run)}` +
    (seed ? `&seed=${encodeURIComponent(seed)}&depth=${depth}` : ""));
export const searchWorks = (q: string) =>
  get<SearchHit[]>(`/search?q=${encodeURIComponent(q)}&limit=50`);
