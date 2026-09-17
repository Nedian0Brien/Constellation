import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildInstructions } from "./context";
import { resolveAnnotations, paperPosition, truncate } from "./resolve";
import { createToolExecutors, toolDefinitions, type ToolDeps } from "./tools";
import { newThread, readThread, writeThread, createHistoryAdapter } from "./history";
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

describe("history", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    clear: () => store.clear(),
  });
  beforeEach(() => store.clear());
  it("run 별로 저장하고, 날짜와 끊긴 상태를 되살린다", async () => {
    const thread = newThread();
    const adapter = createHistoryAdapter("r1", thread);
    const createdAt = new Date("2026-09-18T00:00:00Z");
    await adapter.append(item(null, { id: "u1", role: "user", createdAt, content: [{ type: "text", text: "안녕" }] }));
    await adapter.append(item("u1", { id: "a1", role: "assistant", createdAt, content: [{ type: "text", text: "…" }], status: { type: "running" } }));
    await adapter.update!(item("u1", { id: "a1", role: "assistant", createdAt, content: [{ type: "text", text: "완성" }], status: { type: "running" } }));
    const restored = readThread("r1")!;
    expect(restored.sessionId).toBe(thread.sessionId);
    expect(restored.repository.headId).toBe("a1");
    expect(restored.repository.messages).toHaveLength(2);
    const a1 = restored.repository.messages[1]!.message;
    expect(a1.createdAt).toBeInstanceOf(Date);
    expect(a1.status).toEqual({ type: "incomplete", reason: "unknown" });
    expect(readThread("r2")).toBeNull();
    writeThread("r2", newThread());
    expect(readThread("r2")!.repository.messages).toEqual([]);
  });
});
