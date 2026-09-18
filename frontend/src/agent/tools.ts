import type { JSONSchema7 } from "json-schema";
import type { ClusterInfo, MapData } from "../api";
import * as api from "../api";
import type { Exploration } from "../app/navigation";
import type { Annotation, CameraRequest } from "../store";
import type { LabelLevel } from "../views/map/labels";
import {
  clusterPosition,
  paperPosition,
  resolveAnnotations,
  truncate,
  type AnnotateItem,
} from "./resolve";

/**
 * 에이전트 도구. 정의(JSON 스키마)는 요청 본문으로 서버에 가고, 실행은
 * 여기서 — 사용자의 웹뷰 안에서 — 한다. 서버는 이름과 스키마만 안다.
 *
 * 스키마는 서버의 `relay.ts`가 받는 부분집합(object·string·number·integer·
 * boolean·enum·array, required, description)만 쓴다.
 */

type JsonSchema = {
  type: "object";
  properties: Record<string, JSONSchema7>;
  required?: string[];
};

export interface ToolDefinition {
  description: string;
  parameters: JsonSchema;
}

const str = (description: string): JSONSchema7 => ({ type: "string", description });
const int = (description: string): JSONSchema7 => ({ type: "integer", description });
const num = (description: string): JSONSchema7 => ({ type: "number", description });
const bool = (description: string): JSONSchema7 => ({ type: "boolean", description });
const oneOf = (values: string[], description: string): JSONSchema7 => ({
  type: "string",
  enum: values,
  description,
});

export const toolDefinitions = {
  list_topics: {
    description:
      "현재 분석의 연구 주제(클러스터) 목록. cluster_id·라벨·크기·키워드·중앙 연도를 돌려준다.",
    parameters: { type: "object", properties: {} },
  },
  get_topic: {
    description:
      "연구 주제 하나의 상세. 키워드, 연도 분포, 피인용 상위 논문 10편(id 포함)을 돌려준다.",
    parameters: {
      type: "object",
      properties: { cluster_id: int("list_topics 가 준 cluster_id") },
      required: ["cluster_id"],
    },
  },
  search_papers: {
    description:
      "제목·초록 부분 문자열 검색과 연도 범위로 논문을 찾는다. 첫 페이지 25편과 전체 수를 돌려준다.",
    parameters: {
      type: "object",
      properties: {
        query: str("검색어. 두 글자 이상. 비우면 전체"),
        year_from: int("시작 연도(포함)"),
        year_to: int("끝 연도(포함)"),
        sort: oneOf(["cited", "year", "title"], "정렬 기준. 기본 cited"),
        order: oneOf(["desc", "asc"], "정렬 방향. 기본 desc"),
      },
    },
  },
  get_paper: {
    description:
      "논문 하나의 상세. 초록(1,500자까지), 저자, 학술지, 피인용, 코퍼스 안 인용 수를 돌려준다.",
    parameters: {
      type: "object",
      properties: { id: str("논문 id (search_papers·get_topic 이 준 값)") },
      required: ["id"],
    },
  },
  get_citations: {
    description:
      "논문 하나가 코퍼스 안에서 인용한 논문(references)과 이 논문을 인용한 논문(cited_by)을 피인용 순으로 돌려준다. 총계는 limit 과 무관하다. 여러 홉을 따라가려면 결과의 id 로 다시 부른다.",
    parameters: {
      type: "object",
      properties: {
        id: str("논문 id"),
        direction: oneOf(
          ["references", "cited_by", "both"],
          "방향. 기본 both",
        ),
        limit: int("방향마다 최대 개수. 기본 20, 최대 500"),
      },
      required: ["id"],
    },
  },
  get_lineage: {
    description:
      "현재 분석의 인용 계보. 메인패스(가장 굵은 인용 흐름을 연도순으로)와, paper_id 를 주면 그 논문과 직접 이어진 논문(cites=그 논문이 인용, cited_by=그 논문을 인용)을 돌려준다.",
    parameters: {
      type: "object",
      properties: {
        paper_id: str("씨앗 논문 id. 비우면 메인패스만"),
        depth: int("씨앗 주변을 따라갈 홉 수 1–4. 기본 2"),
      },
    },
  },
  compare_papers: {
    description:
      "논문 2–6편을 한 표로 비교한다. 논문마다 메타데이터·주제·초록 앞부분·코퍼스 안 인용 수를, 쌍마다 서로 인용 여부·같은 주제 여부·지도 거리를 돌려준다.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", description: "논문 id 2–6개", items: str("논문 id") },
      },
      required: ["ids"],
    },
  },
  set_filter: {
    description:
      "지도와 논문 목록의 필터를 바꾼다. 준 값만 바뀌고, clear 를 주면 먼저 전부 지운다. 적용 뒤 일치하는 논문 수를 돌려준다.",
    parameters: {
      type: "object",
      properties: {
        query: str("검색어. 빈 문자열이면 검색어를 지운다"),
        year_from: int("시작 연도. 0 이면 지운다"),
        year_to: int("끝 연도. 0 이면 지운다"),
        clear: bool("true 면 검색어·연도를 전부 지운 뒤 적용한다"),
      },
    },
  },
  select: {
    description:
      "논문 또는 주제를 선택해 상세 창을 연다. 사용자가 열어 달라고 할 때만 쓴다. 인자가 없으면 선택을 지우고 창을 닫는다.",
    parameters: {
      type: "object",
      properties: {
        paper_id: str("열 논문 id"),
        cluster_id: int("열 주제 cluster_id"),
      },
    },
  },
  fly_to: {
    description:
      "지도 카메라를 논문·주제·좌표로 옮긴다. level 을 안 주면 논문은 paper, 주제는 topic 단계로 확대한다.",
    parameters: {
      type: "object",
      properties: {
        paper_id: str("논문 id"),
        cluster_id: int("주제 cluster_id"),
        x: num("지도 x 좌표"),
        y: num("지도 y 좌표"),
        level: oneOf(
          ["field", "topic", "paper"],
          "확대 단계. field=상위 분야 전체, topic=하위 분야, paper=논문 제목",
        ),
      },
    },
  },
  zoom: {
    description: "지도를 확대(양수)·축소(음수)한다. 한 단계가 컨트롤의 +/− 버튼 한 번이다.",
    parameters: {
      type: "object",
      properties: { steps: num("단계 수. 예: 2, -1") },
      required: ["steps"],
    },
  },
  annotate: {
    description:
      "지도에 라벨과 지시선을 얹는다. 항목마다 paper_id·cluster_id·좌표 중 하나와 선택적 label. 기본은 이전 주석을 지우고 새로 그린다.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "주석 목록",
          items: {
            type: "object",
            properties: {
              paper_id: str("논문 id"),
              cluster_id: int("주제 cluster_id"),
              x: num("지도 x 좌표"),
              y: num("지도 y 좌표"),
              label: str("라벨. 비우면 제목·주제 이름"),
            },
          },
        },
        keep: bool("true 면 이전 주석을 남기고 덧붙인다"),
      },
      required: ["items"],
    },
  },
  clear_annotations: {
    description: "지도의 주석을 전부 지운다.",
    parameters: { type: "object", properties: {} },
  },
  set_view: {
    description: "화면을 바꾼다. map=연구 지도, tree=계층 트리, flow=갈래 흐름, lineage=인용 계보, sky=3D.",
    parameters: {
      type: "object",
      properties: {
        view: oneOf(["map", "tree", "flow", "lineage", "sky"], "화면"),
      },
      required: ["view"],
    },
  },
  set_color_by: {
    description: "지도 점의 색 기준을 바꾼다. cluster=주제, year=연도, cited=피인용, abstract=초록 유무.",
    parameters: {
      type: "object",
      properties: {
        color: oneOf(["cluster", "year", "cited", "abstract"], "색 기준"),
      },
      required: ["color"],
    },
  },
} satisfies Record<string, ToolDefinition>;

export type ToolName = keyof typeof toolDefinitions;

/** 실행기가 화면과 데이터에 닿는 통로. 테스트에서 가짜로 바꾼다. */
export interface ToolDeps {
  run: string;
  map: () => Promise<MapData>;
  clusters: () => Promise<ClusterInfo[]>;
  state: () => Exploration;
  update: (patch: Partial<Exploration>) => void;
  requestCamera: (request: Omit<CameraRequest, "nonce">) => void;
  annotations: () => Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  api: Pick<
    typeof api,
    | "fetchClusterDetail"
    | "fetchPapers"
    | "fetchWork"
    | "fetchMatches"
    | "fetchCitations"
    | "fetchLineage"
  >;
}

type Args = Record<string, unknown>;
export type ToolExecutor = (args: Args) => Promise<unknown>;

const asInt = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : undefined;
const asNum = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const asStr = (v: unknown) => (typeof v === "string" ? v : undefined);
/** 모델이 OpenAlex 쪽 표기(`W123`)로 부르면 코퍼스 id(`openalex:W123`)로 맞춘다. */
export const paperId = (v: unknown) => {
  const s = asStr(v)?.trim();
  if (!s) return undefined;
  return /^W\d+$/.test(s) ? `openalex:${s}` : s;
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100;

export function createToolExecutors(
  deps: ToolDeps,
): Record<ToolName, ToolExecutor> {
  const { run } = deps;
  const years = (a: Args) => ({
    year_from: asInt(a.year_from),
    year_to: asInt(a.year_to),
  });
  return {
    async list_topics() {
      const clusters = await deps.clusters();
      return {
        count: clusters.length,
        topics: clusters.map((c) => ({
          cluster_id: c.cluster_id,
          label: c.label,
          size: c.size,
          keywords: c.keywords.slice(0, 5),
          year_median: c.year_median,
        })),
      };
    },
    async get_topic(a) {
      const id = asInt(a.cluster_id);
      if (id === undefined) return { error: "cluster_id 가 필요합니다." };
      const d = await deps.api.fetchClusterDetail(run, id);
      return {
        cluster_id: d.cluster_id,
        label: d.label,
        size: d.size,
        keywords: d.keywords,
        year_median: d.year_median,
        top_works: d.top_works.slice(0, 10),
        by_year: d.by_year,
      };
    },
    async search_papers(a) {
      const q = asStr(a.query)?.trim() ?? "";
      if (q.length === 1) return { error: "검색어는 두 글자 이상이어야 합니다." };
      const page = await deps.api.fetchPapers(
        { run, q: q || undefined, ...years(a) },
        asStr(a.sort) ?? "cited",
        asStr(a.order) ?? "desc",
        1,
      );
      return {
        total: page.total,
        shown: page.items.length,
        items: page.items.map((p) => ({
          id: p.id,
          title: p.title,
          year: p.year,
          cited: p.cited_by_count ?? 0,
        })),
      };
    },
    async get_paper(a) {
      const id = paperId(a.id);
      if (!id) return { error: "id 가 필요합니다." };
      const w = await deps.api.fetchWork(id, run);
      return {
        id: w.id,
        title: w.title,
        year: w.year,
        venue: w.venue,
        type: w.type,
        doi: w.doi,
        authors: w.authors.slice(0, 8),
        author_count: w.authors.length,
        cited_by_count: w.cited_by_count ?? 0,
        refs_in_corpus: w.refs_in_corpus,
        cited_by_in_corpus: w.cited_by_in_corpus,
        topics: w.topics.slice(0, 8).map((t) => t.name),
        abstract: w.abstract ? truncate(w.abstract, 1500) : null,
      };
    },
    async get_citations(a) {
      const id = paperId(a.id);
      if (!id) return { error: "id 가 필요합니다." };
      const direction = (asStr(a.direction) ?? "both") as api.CitationDirection;
      const limit = Math.min(Math.max(asInt(a.limit) ?? 20, 1), 500);
      const [c, clusters] = await Promise.all([
        deps.api.fetchCitations(run, id, direction, limit),
        deps.clusters(),
      ]);
      const label = (k: number | null) =>
        k === null ? null : (clusters.find((x) => x.cluster_id === k)?.label ?? null);
      const rows = (list: api.CitedWork[]) =>
        list.map((w) => ({ ...w, cluster_label: label(w.cluster) }));
      return {
        id: c.id,
        ref_total: c.ref_total,
        cited_by_total: c.cited_by_total,
        references: rows(c.references),
        cited_by: rows(c.cited_by),
      };
    },
    async get_lineage(a) {
      const seed = paperId(a.paper_id);
      const depth = Math.min(Math.max(asInt(a.depth) ?? 2, 1), 4);
      if (seed && !paperPosition(await deps.map(), seed))
        return { error: `논문 ${seed} 을 찾지 못했습니다.` };
      const d = await deps.api.fetchLineage(run, seed, depth);
      const nodes = new Map(d.nodes.map((n) => [n.id, n]));
      const brief = (id: string) => {
        const n = nodes.get(id);
        return n ? { id, title: n.title, year: n.year, cited: n.cited } : { id };
      };
      // 엣지는 from=피인용, to=인용. 씨앗이 to 면 씨앗이 인용한 것이다.
      const neighbors = seed
        ? d.edges
            .filter((e) => e.from === seed || e.to === seed)
            .map((e) => ({
              ...brief(e.to === seed ? e.from : e.to),
              relation: e.to === seed ? "cites" : "cited_by",
              spc: Math.round(e.spc * 100) / 100,
            }))
        : undefined;
      return {
        main_path: d.main_path.map(brief),
        ...(seed ? { seed: brief(seed), neighbors } : {}),
        node_count: d.nodes.length,
        edge_count: d.edges.length,
      };
    },
    async compare_papers(a) {
      const ids = Array.isArray(a.ids)
        ? [...new Set(a.ids.map(paperId).filter((x): x is string => !!x))]
        : [];
      if (ids.length < 2) return { error: "ids 에 논문 id 가 2개 이상 필요합니다." };
      if (ids.length > 6) return { error: "한 번에 6편까지 비교합니다." };
      const [map, clusters] = await Promise.all([deps.map(), deps.clusters()]);
      const missing: string[] = [];
      const papers = (
        await Promise.all(
          ids.map(async (id) => {
            const pos = paperPosition(map, id);
            if (!pos) {
              missing.push(id);
              return null;
            }
            const [w, c] = await Promise.all([
              deps.api.fetchWork(id, run),
              deps.api.fetchCitations(run, id, "references", 500),
            ]);
            const k = map.cluster[map.id.indexOf(id)] ?? null;
            return {
              id,
              title: w.title,
              year: w.year,
              venue: w.venue,
              cited_by_count: w.cited_by_count ?? 0,
              authors: w.authors.slice(0, 3),
              topics: w.topics.slice(0, 3).map((t) => t.name),
              cluster_id: k,
              cluster_label: clusters.find((x) => x.cluster_id === k)?.label ?? null,
              refs_in_corpus: w.refs_in_corpus,
              cited_by_in_corpus: w.cited_by_in_corpus,
              abstract: w.abstract ? truncate(w.abstract, 400) : null,
              pos,
              refs: new Set(c.references.map((r) => r.id)),
            };
          }),
        )
      ).filter((p): p is NonNullable<typeof p> => p !== null);
      if (papers.length < 2)
        return { error: "비교할 논문이 2편 미만입니다.", missing };
      const cites: [string, string][] = [];
      const pairs: {
        a: string;
        b: string;
        distance: number;
        same_topic: boolean;
      }[] = [];
      for (let i = 0; i < papers.length; i++)
        for (let j = 0; j < papers.length; j++) {
          const p = papers[i]!,
            q = papers[j]!;
          if (i !== j && p.refs.has(q.id)) cites.push([p.id, q.id]);
          if (i < j)
            pairs.push({
              a: p.id,
              b: q.id,
              distance: dist(p.pos, q.pos),
              same_topic: p.cluster_id !== null && p.cluster_id === q.cluster_id,
            });
        }
      // 지도 전체 대각선. 거리를 가늠하는 기준으로 함께 준다.
      const lo = { x: Infinity, y: Infinity },
        hi = { x: -Infinity, y: -Infinity };
      for (let i = 0; i < map.n; i++) {
        lo.x = Math.min(lo.x, map.x[i]!);
        lo.y = Math.min(lo.y, map.y[i]!);
        hi.x = Math.max(hi.x, map.x[i]!);
        hi.y = Math.max(hi.y, map.y[i]!);
      }
      const span = dist(lo, hi);
      return {
        papers: papers.map(({ pos, refs: _refs, ...rest }) => ({
          ...rest,
          x: pos.x,
          y: pos.y,
        })),
        cites,
        pairs,
        map_span: span,
        ...(missing.length ? { missing } : {}),
      };
    },
    async set_filter(a) {
      const prev = deps.state();
      const next = a.clear
        ? { q: "", from: undefined, to: undefined }
        : { q: prev.q, from: prev.from, to: prev.to };
      const q = asStr(a.query);
      if (q !== undefined) next.q = q.trim();
      const from = asInt(a.year_from),
        to = asInt(a.year_to);
      if (from !== undefined) next.from = from > 0 ? from : undefined;
      if (to !== undefined) next.to = to > 0 ? to : undefined;
      deps.update(next);
      const matches = await deps.api.fetchMatches({
        run,
        q: next.q || undefined,
        year_from: next.from,
        year_to: next.to,
      });
      return { query: next.q, year_from: next.from, year_to: next.to, total: matches.total };
    },
    async select(a) {
      const paper = paperId(a.paper_id),
        cluster = asInt(a.cluster_id);
      if (paper) {
        const map = await deps.map();
        const p = paperPosition(map, paper);
        if (!p) return { error: `논문 ${paper} 을 찾지 못했습니다.` };
        deps.update({ selected: paper, cluster: undefined, node: undefined });
        return { opened: "paper", id: paper, title: p.title };
      }
      if (cluster !== undefined) {
        const c = clusterPosition(await deps.clusters(), cluster);
        if (!c) return { error: `주제 ${cluster} 를 찾지 못했습니다.` };
        deps.update({ cluster, selected: undefined, node: undefined });
        return { opened: "cluster", cluster_id: cluster, label: c.label };
      }
      deps.update({ selected: undefined, cluster: undefined, node: undefined });
      return { opened: null };
    },
    async fly_to(a) {
      const paper = paperId(a.paper_id),
        cluster = asInt(a.cluster_id),
        level = asStr(a.level) as LabelLevel | undefined;
      let target: [number, number, number] | undefined, name = "";
      if (paper) {
        const p = paperPosition(await deps.map(), paper);
        if (!p) return { error: `논문 ${paper} 을 찾지 못했습니다.` };
        target = [p.x, p.y, 0];
        name = p.title;
      } else if (cluster !== undefined) {
        const c = clusterPosition(await deps.clusters(), cluster);
        if (!c) return { error: `주제 ${cluster} 를 찾지 못했습니다.` };
        target = [c.x, c.y, 0];
        name = c.label;
      } else {
        const x = asNum(a.x),
          y = asNum(a.y);
        if (x === undefined || y === undefined)
          return { error: "paper_id, cluster_id, 또는 x·y 가 필요합니다." };
        target = [x, y, 0];
        name = `(${x}, ${y})`;
      }
      const resolved: LabelLevel =
        level ?? (paper ? "paper" : cluster !== undefined ? "topic" : "topic");
      if (deps.state().view !== "map") deps.update({ view: "map" });
      deps.requestCamera({ run, target, level: resolved });
      return { moved_to: name, x: target[0], y: target[1], level: resolved };
    },
    async zoom(a) {
      const steps = asNum(a.steps);
      if (!steps) return { error: "steps 가 필요합니다." };
      if (deps.state().view !== "map") deps.update({ view: "map" });
      deps.requestCamera({ run, steps });
      return { steps };
    },
    async annotate(a) {
      const items = Array.isArray(a.items)
        ? (a.items as AnnotateItem[]).map((it) =>
            it.paper_id === undefined ? it : { ...it, paper_id: paperId(it.paper_id) },
          )
        : [];
      if (!items.length) return { error: "items 가 비어 있습니다." };
      const [map, clusters] = await Promise.all([deps.map(), deps.clusters()]);
      const { annotations, missing } = resolveAnnotations(items, map, clusters);
      const kept = a.keep ? deps.annotations() : [];
      const merged = [
        ...kept.filter((k) => !annotations.some((n) => n.id === k.id)),
        ...annotations,
      ];
      deps.setAnnotations(merged);
      if (deps.state().view !== "map") deps.update({ view: "map" });
      return {
        drawn: annotations.map((n) => ({ id: n.id, label: n.label, x: n.x, y: n.y })),
        total: merged.length,
        ...(missing.length ? { missing } : {}),
      };
    },
    async clear_annotations() {
      const n = deps.annotations().length;
      deps.setAnnotations([]);
      return { cleared: n };
    },
    async set_view(a) {
      const view = asStr(a.view) as Exploration["view"] | undefined;
      if (!view) return { error: "view 가 필요합니다." };
      deps.update({ view });
      return { view };
    },
    async set_color_by(a) {
      const color = asStr(a.color) as Exploration["color"] | undefined;
      if (!color) return { error: "color 가 필요합니다." };
      deps.update({ color });
      return { color };
    },
  };
}
