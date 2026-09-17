import type { LabelLevel } from "../views/map/labels";
import type { View } from "../app/navigation";

/** 매 턴 시스템 프롬프트에 넣는 현재 화면의 상태 */
export interface AgentContext {
  runId: string;
  model: string | null;
  paperCount: number;
  topicCount: number;
  view: View;
  level: LabelLevel;
  query: string;
  yearFrom?: number;
  yearTo?: number;
  selectedPaper?: { id: string; title: string; year: number | null };
  selectedCluster?: { id: number; label: string };
  selectedNode?: { id: number; label: string };
  annotationCount: number;
}

export const viewLabels: Record<View, string> = {
  map: "연구 지도",
  tree: "계층 트리",
  flow: "갈래 흐름",
  lineage: "인용 계보",
  sky: "3D",
};

const levelLabels: Record<LabelLevel, string> = {
  field: "상위 분야가 보이는 전체 보기",
  topic: "하위 분야가 보이는 중간 확대",
  paper: "논문 제목이 보이는 근접 확대",
};

/**
 * 시스템 프롬프트. 역할과 도구 사용 규칙은 고정이고, 그 아래에 현재 맥락을
 * 붙인다. 카메라는 줌 수치가 아니라 라벨 단계만 넣어 팬 중에 매번 바뀌지
 * 않게 한다.
 */
export function buildInstructions(ctx: AgentContext): string {
  const lines = [
    "당신은 Constellation 의 에이전트다. Constellation 은 논문 초록의 임베딩과 인용 관계로 연구 분야의 구조와 변화를 탐색하는 연구 지도 앱이다. 사용자는 연구자이며 한국어로 묻는다. 도구를 부르기 전후의 짧은 진행 문장까지 모두 한국어로 쓰고, 간결하게 답하며, 근거가 되는 논문·주제는 제목이나 라벨로 언급한다.",
    "",
    "도구는 전부 사용자의 화면 안에서 실행된다.",
    "- 코퍼스를 볼 때는 search_papers, get_paper, list_topics, get_topic 을 쓴다. 기억이 아니라 도구 결과에 근거해 답한다.",
    "- 인용 관계는 get_citations(한 논문의 참고문헌·피인용)와 get_lineage(분석 전체의 메인패스, 씨앗 논문 주변)로 본다. 여러 홉은 결과 id 로 다시 부른다.",
    "- 논문 여러 편을 견주는 질문에는 compare_papers 를 먼저 부르고, 그 표(서로 인용, 같은 주제, 지도 거리 — map_span 은 지도 전체 대각선)와 초록으로 차이를 설명한다.",
    "- 코퍼스 밖 정보(후속 연구, 저자, 코퍼스 밖 피인용, 최신 동향)는 WebSearch 와 WebFetch 로 찾는다. 코퍼스 논문 id `openalex:W…` 는 `openalex:` 를 뗀 `https://api.openalex.org/works/W…` 로 열 수 있고, WebFetch 의 prompt 에 원하는 필드(예: referenced_works, cited_by_api_url, cited_by_count)를 적어 달라고 한다. DOI 는 `https://doi.org/…` 인데 WebFetch 는 다른 호스트로 넘어가는 리다이렉트를 따라가지 않고 목적지 URL 을 돌려주므로 그 URL 을 다시 연다.",
    "- 웹에서 얻은 사실은 출처 URL 을 답에 적고, 코퍼스 도구의 결과와 구분해 말한다.",
    "- 무언가를 보여 줄 때는 fly_to 와 annotate 를 쓴다. 지도를 움직이고 라벨·지시선을 얹는 것이 기본 동작이다.",
    "- select 는 사용자가 어떤 논문·주제를 '열어 달라'고 할 때만 쓴다. 상세 창이 열려 화면을 덮는다.",
    "- set_filter 는 지도와 논문 목록에 함께 적용된다. 사용자가 필터를 원할 때만 바꾸고, 바꿨으면 말해 준다.",
    "- annotate 는 이전 주석을 지우고 새로 그린다. 덧붙이려면 keep 을 true 로 준다.",
    "- 좌표(x, y)는 지도의 투영 좌표다. 논문·주제는 id 로 가리키는 편이 정확하다.",
    "- 지도 거리는 차원 축소 결과라 의미 거리와 정확히 같지 않다. 인용 관계와 함께 말한다.",
    "",
    "## 현재 화면",
    `- 분석(run): ${ctx.runId}${ctx.model ? ` · 모델 ${ctx.model}` : ""} · 논문 ${ctx.paperCount.toLocaleString()}편 · 주제 ${ctx.topicCount}개`,
    `- 화면: ${viewLabels[ctx.view]}`,
    `- 지도 확대 단계: ${levelLabels[ctx.level]}`,
  ];
  const filters: string[] = [];
  if (ctx.query) filters.push(`검색어 "${ctx.query}"`);
  if (ctx.yearFrom !== undefined || ctx.yearTo !== undefined)
    filters.push(`연도 ${ctx.yearFrom ?? "…"}–${ctx.yearTo ?? "…"}`);
  lines.push(`- 필터: ${filters.length ? filters.join(", ") : "없음"}`);
  if (ctx.selectedPaper)
    lines.push(
      `- 선택한 논문: ${ctx.selectedPaper.title} (${ctx.selectedPaper.year ?? "연도 미상"}, id ${ctx.selectedPaper.id})`,
    );
  else if (ctx.selectedCluster)
    lines.push(
      `- 선택한 주제: ${ctx.selectedCluster.label} (cluster_id ${ctx.selectedCluster.id})`,
    );
  else if (ctx.selectedNode)
    lines.push(`- 선택한 분야: ${ctx.selectedNode.label} (node ${ctx.selectedNode.id})`);
  else lines.push("- 선택: 없음");
  lines.push(
    `- 지도 주석: ${ctx.annotationCount ? `${ctx.annotationCount}개` : "없음"}`,
  );
  return lines.join("\n");
}
