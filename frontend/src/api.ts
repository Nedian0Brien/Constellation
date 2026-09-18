import { invoke, isTauri } from "@tauri-apps/api/core";
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

export interface CitedWork {
  id: string;
  title: string;
  year: number | null;
  cited: number;
  /** 현재 run 의 주제. run 밖 논문이면 null */
  cluster: number | null;
}

export interface Citations {
  id: string;
  references: CitedWork[];
  cited_by: CitedWork[];
  ref_total: number;
  cited_by_total: number;
}

export type CitationDirection = "references" | "cited_by" | "both";

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
// 전송 계층. 데스크톱 앱에서는 Rust 명령을 직접 부르고(invoke), 브라우저에서는
// 같은 질의를 노출하는 개발 서버를 /api로 부른다. 명령 이름과 인자 이름은
// src-tauri/src/commands.rs와 같아야 한다.
export const desktop = isTauri();
async function call<T>(
  command: string,
  path: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (!desktop) return get<T>(path, signal);
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    throw new ApiError(
      typeof err?.status === "number" ? err.status : 500,
      typeof err?.message === "string" ? err.message : "요청 실패",
    );
  }
}
export const fetchRuns = (signal?: AbortSignal) =>
  call<RunInfo[]>("runs", "/runs", {}, signal);
export const fetchMap = (run?: string, signal?: AbortSignal) =>
  call<MapData>("map", "/map?" + params({ run }), { run }, signal);
export const fetchWork = (id: string, run?: string, signal?: AbortSignal) =>
  call<Work>(
    "work",
    "/works/" + encodeURIComponent(id) + "?" + params({ run }),
    { id, run },
    signal,
  );
export const fetchClusters = (run: string, signal?: AbortSignal) =>
  call<ClusterInfo[]>("clusters", "/clusters?" + params({ run }), { run }, signal);
export const fetchClusterDetail = (
  run: string,
  id: number,
  signal?: AbortSignal,
) =>
  call<ClusterDetail>(
    "cluster_detail",
    `/clusters/${id}?` + params({ run }),
    { run, clusterId: id },
    signal,
  );
export const fetchTree = (run: string, signal?: AbortSignal) =>
  call<TreeData>("tree", "/tree?" + params({ run }), { run }, signal);
export const fetchFlow = (run: string, signal?: AbortSignal) =>
  call<FlowData>("flow", "/flow?" + params({ run }), { run }, signal);
export const fetchFlowPapers = (
  run: string,
  w: number,
  c: number,
  signal?: AbortSignal,
) =>
  call<FlowPaper[]>(
    "flow_papers",
    "/flow/papers?" + params({ run, window: w, cluster: c }),
    { run, window: w, cluster: c },
    signal,
  );
// 논문 id 에 `/` 가 올 수 있어 `/works/{id}/…` 대신 쿼리로 보낸다.
export const fetchCitations = (
  run: string,
  id: string,
  direction: CitationDirection = "both",
  limit = 20,
  signal?: AbortSignal,
) =>
  call<Citations>(
    "citations",
    "/citations?" + params({ run, id, direction, limit }),
    { run, id, direction, limit },
    signal,
  );
export const fetchLineage = (
  run: string,
  seed?: string,
  depth = 2,
  signal?: AbortSignal,
) =>
  call<LineageData>(
    "lineage",
    "/lineage?" + params({ run, seed, depth }),
    { run, seed, depth },
    signal,
  );
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
  call<Matches>(
    "matches",
    "/matches?" + params({ ...filters }),
    { filter: filters },
    signal,
  );
export const fetchPapers = (
  filters: Filters,
  sort: string,
  order: string,
  page: number,
  signal?: AbortSignal,
) =>
  call<PaperPage>(
    "works",
    "/works?" + params({ ...filters, sort, order, page, page_size: 25 }),
    { filter: filters, sort, order, page, pageSize: 25 },
    signal,
  );
// 데스크톱 앱 전용. 브라우저에서는 부르지 않는다.
export interface DbStatus {
  path: string;
  exists: boolean;
}
export const fetchDbStatus = () => invoke<DbStatus>("db_status");
export const chooseDatabase = () => invoke<DbStatus>("choose_database");
