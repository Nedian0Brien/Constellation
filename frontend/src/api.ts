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
  /** 사용자가 지도에 추가한 논문인지. 수집으로 들어온 논문은 false. */
  added: boolean[];
}

// run 안에서 닫힌 인용 관계 전부. `citing[k]`·`cited[k]`는 `MapData` 배열의 인덱스다.
export interface EdgesData {
  run_id: string;
  n: number;
  citing: number[];
  cited: number[];
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
  /** 지도가 속한 코퍼스. 코퍼스 도입 전 DB면 null. */
  corpus_id: string | null;
  corpus_name: string | null;
  /** 표시 이름. 서버가 "코퍼스 이름 · 모델"로 채운다. */
  name: string;
  /** 클러스터 등 분석 산출물이 있는지. */
  analyzed: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function get<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  // body가 있으면 POST(JSON). 작업 제출·예상 편수·취소가 쓴다.
  const response = await fetch(
    BASE + path,
    body === undefined
      ? { signal }
      : {
          signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
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
  body?: unknown,
): Promise<T> {
  if (!desktop) return get<T>(path, signal, body);
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
export const fetchEdges = (run: string, signal?: AbortSignal) =>
  call<EdgesData>("edges", "/edges?" + params({ run }), { run }, signal);
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
  /** true: 추가한 논문만, false: 수집으로 들어온 논문만 */
  added?: boolean;
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

// ── 새 지도 만들기 ─────────────────────────────────────────
// 앱이 Python 파이프라인을 실행해 수집부터 인용 계보까지 만든다. 작업 동안 다른
// 조회는 503("새 지도를 만드는 중")이고, 작업 API는 계속 응답한다.
// 명령·경로는 src-tauri/src/commands.rs, crates/constellation-serve/src/main.rs와 같다.

interface MapDefinitionBase {
  /** 코퍼스 이름. 지도 이름은 `<이름> · <모델>`이 된다. */
  name: string;
  /** 임베딩 모델 키. 기본 scincl. */
  model?: string;
}
/** 검색어(OR 결합, 구절 검색) + 연도 범위 + 연도별 편수(피인용순). */
export interface TermsDefinition extends MapDefinitionBase {
  kind: "terms";
  terms: string[];
  year_from: number;
  year_to: number;
  per_year: number;
}
/** OpenAlex 대표 토픽. 한 수준(토픽·서브필드·필드)만 고른다. */
export interface TopicsDefinition extends MapDefinitionBase {
  kind: "topics";
  /** `T10181`, `subfields/1702`, `fields/17` */
  topics: string[];
  year_from: number;
  year_to: number;
  per_year: number;
}
/** 시드 DOI의 참고문헌·피인용 논문으로 한 단계 넓힌다. */
export interface SeedsDefinition extends MapDefinitionBase {
  kind: "seeds";
  dois: string[];
  /** 시드 밖에서 받을 편수(100–10000, 기본 3000). */
  limit?: number;
}
export type MapDefinition =
  | TermsDefinition
  | TopicsDefinition
  | SeedsDefinition;

export interface MapEstimate {
  expected: number;
  per_year?: Record<string, number>;
  seeds_found?: number;
  seeds_missing?: number;
  api_calls: number;
  warning?: string;
}
export interface TopicMatch {
  id: string;
  name: string;
  level: "field" | "subfield" | "topic";
  /** 도메인 → 필드 → 서브필드 중 상위 이름들. */
  path: string[];
  works_count: number | null;
}
export type JobKind = "build" | "add" | "remove";
export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  /** build: 지도 정의, add·remove: `{map_id, ids}` */
  definition: MapDefinition | { map_id: string; ids: string[] };
  stage: string | null;
  stage_index: number | null;
  stage_count: number;
  /** collect·backfill·embed 단계에서만 온다. */
  progress: { done: number; total: number } | null;
  /** UNIX 밀리초 */
  started_at: number;
  ended_at: number | null;
  error: { stage: string | null; message: string } | null;
  corpus_id: string | null;
  map_id: string | null;
  /** llm: 이름 짓기 성공, ctfidf: 건너뛰고 키워드 라벨 */
  naming: "llm" | "ctfidf" | null;
  pid: number | null;
  /** add: `AddResult`, remove: `{map_id, removed}` */
  result: AddResult | { map_id: string; removed: string[] } | null;
}
export interface AddResult {
  map_id: string;
  added: {
    id: string;
    title: string | null;
    /** -1 = 미분류 */
    cluster: number;
    label: string | null;
    title_only: boolean;
    /** 가장 가까운 지도 안 논문과의 코사인 유사도 */
    similarity: number;
    source: PaperSource;
  }[];
  skipped: { id: string; reason: string }[];
  not_found: string[];
  /** 추가는 했지만 S2 참고문헌·피인용을 받지 못해 인용선이 빠진 논문 등 */
  warnings: string[];
  /** 추가한 논문이 수집 논문의 10%를 넘으면 true */
  recompute_suggested: boolean;
}
export interface JobLog {
  id: string;
  lines: string[];
}
export const estimateMap = (definition: MapDefinition) =>
  call<MapEstimate>("estimate_map", "/maps/estimate", { definition }, undefined, definition);
export const searchTopics = (q: string, signal?: AbortSignal) =>
  call<TopicMatch[]>("search_topics", "/openalex/topics?" + params({ q }), { q }, signal);
export const createMap = (definition: MapDefinition) =>
  call<Job>("create_map", "/jobs", { definition }, undefined, definition);
export const fetchJobs = (signal?: AbortSignal) =>
  call<Job[]>("jobs", "/jobs", {}, signal);
export const fetchJob = (id: string, signal?: AbortSignal) =>
  call<Job>("job", "/jobs/" + encodeURIComponent(id), { id }, signal);
export const fetchJobLog = (id: string, signal?: AbortSignal) =>
  call<JobLog>("job_log", `/jobs/${encodeURIComponent(id)}/log`, { id }, signal);
export const cancelJob = (id: string) =>
  call<Job>("cancel_job", `/jobs/${encodeURIComponent(id)}/cancel`, { id }, undefined, {});

// ── 외부 논문 검색과 지도에 추가 ──────────────────────────────
// 검색은 OpenAlex 전문 검색(1,000회에 $1)이므로 화면에서 입력을 debounce한다.
// DOI·arXiv ID·OpenAlex ID는 그 논문 하나를 무료 단건 조회로 찾는다.

export type PaperSource = "openalex" | "s2";
export interface ExternalPaper {
  /** `openalex:W…` 또는 `s2:<paperId>`. addPapers에 그대로 넘긴다. */
  id: string;
  /** 기록을 가져온 곳. OpenAlex에 없는 논문은 Semantic Scholar(s2). */
  source: PaperSource;
  title: string;
  year: number | null;
  authors: string[];
  venue: string | null;
  cited_by_count: number | null;
  doi: string | null;
  has_abstract: boolean;
  /** run을 넘겼을 때만. 다른 출처 id라도 DOI·제목+연도가 같으면 true. 작업 중이면 null */
  in_map: boolean | null;
  added: boolean | null;
}
export interface ExternalSearch {
  query: string;
  kind: "search" | "doi" | "arxiv" | "openalex" | "s2";
  /** 검색어를 찾은 곳. 식별자는 OpenAlex를 먼저 보고 없으면 Semantic Scholar다. */
  source: PaperSource;
  total: number;
  page: number;
  items: ExternalPaper[];
}
/** source: 검색어를 찾을 곳. Semantic Scholar 검색은 1,000건까지다. */
export const searchPapers = (
  q: string,
  page = 1,
  run?: string,
  source: PaperSource = "openalex",
  signal?: AbortSignal,
) =>
  call<ExternalSearch>(
    "search_papers",
    "/papers/search?" + params({ q, page, run, source }),
    { q, page, run, source },
    signal,
  );
/** 1–200편. 결과는 작업(`kind: "add"`)으로 돌아오고 `fetchJob`으로 확인한다. */
export const addPapers = (run: string, ids: string[]) =>
  call<Job>(
    "add_papers",
    `/maps/${encodeURIComponent(run)}/papers`,
    { run, ids },
    undefined,
    { ids },
  );
/** 추가한 논문만 뺄 수 있다. 수집으로 들어온 논문이 섞이면 작업이 실패한다. */
export const removePapers = (run: string, ids: string[]) =>
  call<Job>(
    "remove_papers",
    `/maps/${encodeURIComponent(run)}/papers/remove`,
    { run, ids },
    undefined,
    { ids },
  );
