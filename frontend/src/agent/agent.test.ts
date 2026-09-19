import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildInstructions } from "./context";
import { resolveAnnotations, paperPosition, truncate } from "./resolve";
import { createToolExecutors, paperId, toolDefinitions, type ToolDeps } from "./tools";
import { newThread, readThread, writeThread, createHistoryAdapter } from "./history";
import { providerOf, readModelSelection, writeModelSelection } from "./settings";
import { parseSearch } from "../app/navigation";
import type { ClusterInfo, MapData } from "../api";
import type { ExportedMessageRepositoryItem } from "@assistant-ui/react";

// 런타임 메시지 타입은 메타데이터 필드가 많다. 어댑터가 읽는 것만 채운다.
const item = (
  parentId: string | null,
  message: Record<string, unknown>,
): ExportedMessageRepositoryItem =>
  ({ parentId, message }) as unknown as ExportedMessageRepositoryItem;

const map: MapData = {
  run_id: "r1",
  n: 3,
  id: ["p1", "p2", "p3"],
  x: [1, 2, 3],
  y: [10, 20, 30],
  z: [0, 0, 0],
  year: [2023, 2024, null],
  cited: [5, 50, 0],
  has_abstract: [true, true, false],
  title: ["첫 논문", "둘째 논문", "셋째 논문"],
  cluster: [0, 0, 1],
};
const clusters: ClusterInfo[] = [
  { cluster_id: 0, label: "RAG 평가", keywords: ["rag", "eval", "a", "b", "c", "d"], size: 2, x: 1.5, y: 15, year_median: 2024, top_work_id: "p2", top_work_title: "둘째 논문" },
  { cluster_id: 1, label: "기타", keywords: [], size: 1, x: 3, y: 30, year_median: null, top_work_id: null, top_work_title: null },
];

describe("buildInstructions", () => {
  it("현재 맥락을 시스템 프롬프트에 담고 줌 수치는 넣지 않는다", () => {
    const text = buildInstructions({
      runId: "r1", model: "scincl", paperCount: 10604, topicCount: 45, view: "map", level: "topic",
      query: "rag", yearFrom: 2023, yearTo: undefined,
      selectedPaper: { id: "p1", title: "첫 논문", year: 2023 }, annotationCount: 2,
    });
    expect(text).toContain("10,604편");
    expect(text).toContain('검색어 "rag", 연도 2023–…');
    expect(text).toContain("선택한 논문: 첫 논문 (2023, id p1)");
    expect(text).toContain("하위 분야가 보이는 중간 확대");
    expect(text).toContain("지도 주석: 2개");
    expect(text).not.toMatch(/zoom/i);
  });
  it("선택·필터가 없으면 없음으로 적는다", () => {
    const text = buildInstructions({
      runId: "r1", model: null, paperCount: 0, topicCount: 0, view: "tree", level: "field", query: "", annotationCount: 0,
    });
    expect(text).toContain("필터: 없음");
    expect(text).toContain("선택: 없음");
    expect(text).toContain("화면: 계층 트리");
  });
});

describe("resolve", () => {
  it("논문·주제·좌표를 주석으로 바꾸고 못 찾은 것은 보고한다", () => {
    const { annotations, missing } = resolveAnnotations(
      [{ paper_id: "p2" }, { cluster_id: 1, label: "여기" }, { x: 0, y: 0 }, { paper_id: "nope" }, {}],
      map, clusters,
    );
    expect(annotations.map((a) => [a.kind, a.x, a.y, a.label])).toEqual([
      ["paper", 2, 20, "둘째 논문"],
      ["cluster", 3, 30, "여기"],
      ["point", 0, 0, "(0.0, 0.0)"],
    ]);
    expect(missing).toHaveLength(2);
    expect(paperPosition(map, "p3")).toEqual({ x: 3, y: 30, title: "셋째 논문" });
    expect(truncate("가나다라", 2)).toBe("가나…");
  });
});

describe("tool executors", () => {
  const deps = () => {
    let state = parseSearch({ run: "r1", view: "tree" });
    const calls: unknown[] = [];
    const d: ToolDeps = {
      run: "r1",
      map: async () => map,
      clusters: async () => clusters,
      state: () => state,
      update: (patch) => {
        state = { ...state, ...patch };
        calls.push(["update", patch]);
      },
      requestCamera: (r) => calls.push(["camera", r]),
      annotations: () => [],
      setAnnotations: (a) => calls.push(["annotations", a.map((x) => x.id)]),
      api: {
        fetchClusterDetail: vi.fn(async () => ({ cluster_id: 0, label: "RAG 평가", keywords: ["rag"], size: 2, year_median: 2024, top_works: [], by_year: [] })),
        fetchPapers: vi.fn(async () => ({ items: [{ id: "p2", title: "둘째 논문", year: 2024, cited_by_count: 50, has_abstract: true }], total: 1, page: 1, page_size: 25 })),
        fetchWork: vi.fn(async () => ({ id: "p1", doi: null, title: "첫 논문", abstract: "가".repeat(2000), year: 2023, venue: null, cited_by_count: 5, type: null, source: "openalex", authors: [], topics: [], refs_in_corpus: 0, cited_by_in_corpus: 1 })),
        fetchMatches: vi.fn(async () => ({ ids: ["p2"], total: 1 })),
        // p2 → p1, p3 → p1 인용. 피인용 목록은 요청한 논문 기준으로 만든다.
        fetchCitations: vi.fn(async (_run: string, id: string, direction = "both") => {
          const refs = id === "p2" || id === "p3" ? [{ id: "p1", title: "첫 논문", year: 2023, cited: 5, cluster: 0 }] : [];
          const by = id === "p1" ? [{ id: "p2", title: "둘째 논문", year: 2024, cited: 50, cluster: 0 }, { id: "p3", title: "셋째 논문", year: null, cited: 0, cluster: 1 }] : [];
          return {
            id,
            references: direction === "cited_by" ? [] : refs,
            cited_by: direction === "references" ? [] : by,
            ref_total: refs.length,
            cited_by_total: by.length,
          };
        }),
        fetchLineage: vi.fn(async (_run: string, seed?: string) => ({
          run_id: "r1",
          seed: seed ?? null,
          nodes: [
            { id: "p1", title: "첫 논문", year: 2023, cited: 5, venue: null },
            { id: "p2", title: "둘째 논문", year: 2024, cited: 50, venue: null },
            { id: "p3", title: "셋째 논문", year: null, cited: 0, venue: null },
          ],
          edges: [
            { from: "p1", to: "p2", spc: 2, main: true },
            { from: "p1", to: "p3", spc: 1.234, main: false },
          ],
          main_path: ["p1", "p2"],
        })),
      },
    };
    return { d, calls, state: () => state };
  };
  it("모든 정의에 실행기가 있다", () => {
    const { d } = deps();
    const ex = createToolExecutors(d);
    for (const name of Object.keys(toolDefinitions)) expect(ex).toHaveProperty(name);
  });
  it("fly_to 는 논문 좌표와 paper 단계로 카메라를 요청하고 지도 화면으로 바꾼다", async () => {
    const { d, calls } = deps();
    const out = await createToolExecutors(d).fly_to({ paper_id: "p2" });
    expect(out).toMatchObject({ moved_to: "둘째 논문", x: 2, y: 20, level: "paper" });
    expect(calls).toContainEqual(["update", { view: "map" }]);
    expect(calls).toContainEqual(["camera", { run: "r1", target: [2, 20, 0], level: "paper" }]);
    expect(await createToolExecutors(d).fly_to({ paper_id: "zzz" })).toHaveProperty("error");
  });
  it("set_filter 는 준 값만 바꾸고 일치 수를 돌려준다", async () => {
    const { d, state } = deps();
    const ex = createToolExecutors(d);
    expect(await ex.set_filter({ query: "rag", year_from: 2023 })).toEqual({ query: "rag", year_from: 2023, year_to: undefined, total: 1 });
    expect(state().q).toBe("rag");
    await ex.set_filter({ year_from: 0 });
    expect(state().from).toBeUndefined();
    expect(state().q).toBe("rag");
    await ex.set_filter({ clear: true });
    expect(state().q).toBe("");
  });
  it("select 는 존재하는 것만 열고, 빈 인자는 해제한다", async () => {
    const { d, state } = deps();
    const ex = createToolExecutors(d);
    expect(await ex.select({ cluster_id: 1 })).toMatchObject({ opened: "cluster", label: "기타" });
    expect(state().cluster).toBe(1);
    expect(await ex.select({ paper_id: "nope" })).toHaveProperty("error");
    expect(await ex.select({})).toEqual({ opened: null });
    expect(state().cluster).toBeUndefined();
  });
  it("annotate 는 해석한 주석을 넣고 get_paper 는 초록을 1,500자로 자른다", async () => {
    const { d, calls } = deps();
    const ex = createToolExecutors(d);
    const out = (await ex.annotate({ items: [{ paper_id: "p1" }, { cluster_id: 9 }] })) as { total: number; missing?: string[] };
    expect(out.total).toBe(1);
    expect(out.missing).toEqual(["cluster 9"]);
    expect(calls).toContainEqual(["annotations", ["paper:p1"]]);
    const paper = (await ex.get_paper({ id: "p1" })) as { abstract: string };
    expect(paper.abstract.length).toBe(1501);
    expect(await ex.search_papers({ query: "r" })).toHaveProperty("error");
    expect(await ex.search_papers({ query: "rag" })).toMatchObject({ total: 1, shown: 1 });
  });
});

describe("citation tools", () => {
  const { d } = (() => {
    // 위 deps() 는 describe 안에 있어 여기서 다시 만든다.
    let state = parseSearch({ run: "r1", view: "map" });
    const d: ToolDeps = {
      run: "r1",
      map: async () => map,
      clusters: async () => clusters,
      state: () => state,
      update: (patch) => void (state = { ...state, ...patch }),
      requestCamera: () => {},
      annotations: () => [],
      setAnnotations: () => {},
      api: {
        fetchClusterDetail: vi.fn(),
        fetchPapers: vi.fn(),
        fetchMatches: vi.fn(),
        fetchWork: vi.fn(async (id: string) => ({
          id, doi: null, title: map.title[map.id.indexOf(id)]!, abstract: "초록 ".repeat(200), year: map.year[map.id.indexOf(id)] ?? null,
          venue: id === "p2" ? "NeurIPS" : null, cited_by_count: map.cited[map.id.indexOf(id)]!, type: null, source: "openalex",
          authors: ["가", "나", "다", "라"], topics: [{ name: "RAG", kind: "topic" }], refs_in_corpus: id === "p1" ? 0 : 1, cited_by_in_corpus: id === "p1" ? 2 : 0,
        })),
        fetchCitations: vi.fn(async (_run: string, id: string, direction = "both") => {
          const refs = id === "p2" || id === "p3" ? [{ id: "p1", title: "첫 논문", year: 2023, cited: 5, cluster: 0 }] : [];
          const by = id === "p1" ? [{ id: "p2", title: "둘째 논문", year: 2024, cited: 50, cluster: 0 }, { id: "p3", title: "셋째 논문", year: null, cited: 0, cluster: 1 }] : [];
          return { id, references: direction === "cited_by" ? [] : refs, cited_by: direction === "references" ? [] : by, ref_total: refs.length, cited_by_total: by.length };
        }),
        fetchLineage: vi.fn(async (_run: string, seed?: string) => ({
          run_id: "r1", seed: seed ?? null,
          nodes: [
            { id: "p1", title: "첫 논문", year: 2023, cited: 5, venue: null },
            { id: "p2", title: "둘째 논문", year: 2024, cited: 50, venue: null },
            { id: "p3", title: "셋째 논문", year: null, cited: 0, venue: null },
          ],
          edges: [{ from: "p1", to: "p2", spc: 2, main: true }, { from: "p1", to: "p3", spc: 1.234, main: false }],
          main_path: ["p1", "p2"],
        })),
      },
    };
    return { d };
  })();
  const ex = createToolExecutors(d);
  it("get_citations 는 주제 라벨을 붙이고 W 표기를 코퍼스 id 로 맞춘다", async () => {
    const out = (await ex.get_citations({ id: "p1", limit: 9999 })) as { cited_by: { id: string; cluster_label: string | null }[]; cited_by_total: number };
    expect(out.cited_by.map((w) => [w.id, w.cluster_label])).toEqual([["p2", "RAG 평가"], ["p3", "기타"]]);
    expect(out.cited_by_total).toBe(2);
    expect(d.api.fetchCitations).toHaveBeenLastCalledWith("r1", "p1", "both", 500);
    expect(paperId("W12")).toBe("openalex:W12");
    expect(paperId("openalex:W12")).toBe("openalex:W12");
    expect(await ex.get_citations({})).toHaveProperty("error");
  });
  it("get_lineage 는 씨앗 기준으로 인용 방향을 판정한다", async () => {
    const plain = (await ex.get_lineage({})) as { main_path: { id: string; title: string }[]; neighbors?: unknown };
    expect(plain.main_path.map((n) => n.title)).toEqual(["첫 논문", "둘째 논문"]);
    expect(plain.neighbors).toBeUndefined();
    const seeded = (await ex.get_lineage({ paper_id: "p1", depth: 9 })) as { neighbors: { id: string; relation: string; spc: number }[] };
    expect(d.api.fetchLineage).toHaveBeenLastCalledWith("r1", "p1", 4);
    expect(seeded.neighbors).toEqual([
      { id: "p2", title: "둘째 논문", year: 2024, cited: 50, relation: "cited_by", spc: 2 },
      { id: "p3", title: "셋째 논문", year: null, cited: 0, relation: "cited_by", spc: 1.23 },
    ]);
    const from3 = (await ex.get_lineage({ paper_id: "p3" })) as { neighbors: { id: string; relation: string }[] };
    expect(from3.neighbors).toEqual([expect.objectContaining({ id: "p1", relation: "cites" })]);
    expect(await ex.get_lineage({ paper_id: "zzz" })).toHaveProperty("error");
  });
  it("compare_papers 는 인용 쌍·거리·같은 주제를 표로 만들고 없는 id 는 보고한다", async () => {
    const out = (await ex.compare_papers({ ids: ["p1", "p2", "p3", "nope"] })) as {
      papers: { id: string; abstract: string; venue: string | null; x: number }[];
      cites: [string, string][];
      pairs: { a: string; b: string; distance: number; same_topic: boolean }[];
      map_span: number;
      missing: string[];
    };
    expect(out.papers.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(out.papers[0]!.abstract.length).toBe(401);
    expect(out.papers[1]!.venue).toBe("NeurIPS");
    expect(out.papers[1]!.x).toBe(2);
    expect(out.cites).toEqual([["p2", "p1"], ["p3", "p1"]]);
    expect(out.pairs).toEqual([
      { a: "p1", b: "p2", distance: 10.05, same_topic: true },
      { a: "p1", b: "p3", distance: 20.1, same_topic: false },
      { a: "p2", b: "p3", distance: 10.05, same_topic: false },
    ]);
    expect(out.map_span).toBe(20.1);
    expect(out.missing).toEqual(["nope"]);
    expect(await ex.compare_papers({ ids: ["p1"] })).toHaveProperty("error");
    expect(await ex.compare_papers({ ids: ["p1", "p1"] })).toHaveProperty("error");
  });
});

describe("history", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    clear: () => store.clear(),
  });
  beforeEach(() => store.clear());
  it("run·프로바이더 별로 저장하고, 날짜와 끊긴 상태를 되살린다", async () => {
    const thread = newThread("claude");
    const adapter = createHistoryAdapter("r1", thread);
    const createdAt = new Date("2026-09-18T00:00:00Z");
    await adapter.append(item(null, { id: "u1", role: "user", createdAt, content: [{ type: "text", text: "안녕" }] }));
    await adapter.append(item("u1", { id: "a1", role: "assistant", createdAt, content: [{ type: "text", text: "…" }], status: { type: "running" } }));
    await adapter.update!(item("u1", { id: "a1", role: "assistant", createdAt, content: [{ type: "text", text: "완성" }], status: { type: "running" } }));
    const restored = readThread("r1", "claude")!;
    expect(restored.sessionId).toBe(thread.sessionId);
    expect(restored.provider).toBe("claude");
    expect(restored.repository.headId).toBe("a1");
    expect(restored.repository.messages).toHaveLength(2);
    const a1 = restored.repository.messages[1]!.message;
    expect(a1.createdAt).toBeInstanceOf(Date);
    expect(a1.status).toEqual({ type: "incomplete", reason: "unknown" });
    expect(readThread("r2", "claude")).toBeNull();
    writeThread("r2", newThread("claude"));
    expect(readThread("r2", "claude")!.repository.messages).toEqual([]);
    // 프로바이더가 다르면 다른 대화다.
    expect(readThread("r1", "codex")).toBeNull();
  });
  it("Codex 스레드 id 를 저장본에 덧쓰고 요청 본문이 읽는다", () => {
    const thread = newThread("codex");
    const adapter = createHistoryAdapter("r1", thread);
    expect(adapter.current().codexThreadId).toBeUndefined();
    adapter.patch({ codexThreadId: "01a0b822-7b72-7991-8485-eb5e26d02549" });
    expect(readThread("r1", "codex")!.codexThreadId).toBe(
      "01a0b822-7b72-7991-8485-eb5e26d02549",
    );
    expect(adapter.current().sessionId).toBe(thread.sessionId);
  });
  it("v1 저장본은 Claude 대화로 읽는다", () => {
    store.set(
      "constellation.agent.v1:r1",
      JSON.stringify({ version: 1, sessionId: "old", repository: { headId: null, messages: [] } }),
    );
    expect(readThread("r1", "claude")).toMatchObject({ version: 2, provider: "claude", sessionId: "old" });
    expect(readThread("r1", "codex")).toBeNull();
  });
});

describe("settings", () => {
  // history 블록이 세운 localStorage 스텁을 그대로 쓴다.
  beforeEach(() => localStorage.clear());
  it("모델·effort·speed 를 저장하고 프로바이더를 접두사로 가른다", () => {
    expect(readModelSelection()).toEqual({ modelName: undefined, effort: undefined, speed: undefined });
    writeModelSelection({ modelName: "codex/gpt-5.5", effort: "low", speed: undefined });
    expect(readModelSelection()).toEqual({ modelName: "codex/gpt-5.5", effort: "low", speed: undefined });
    expect(providerOf("codex/gpt-5.5")).toBe("codex");
    expect(providerOf("claude/opus[1m]")).toBe("claude");
    expect(providerOf(undefined)).toBe("claude");
  });
});
