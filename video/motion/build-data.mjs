// 모션 티저가 쓰는 실제 데이터를 data.js(window.DATA)로 압축한다.
// 입력: video/public/data/*.json(피지컬 AI 코퍼스 스냅샷, `npm run snapshot`)과
//       video/src/recording/agent-thread.json(실제 에이전트 대화 기록).
// 영상에 나오는 수치와 이름은 모두 이 파일에서 온다 — 영상 코드에 숫자를 적지 않는다.
import { readFile, writeFile } from "node:fs/promises";

const here = new URL(".", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, here), "utf8"));
const map = await read("../public/data/map.json");
const tree = await read("../public/data/tree.json");
const edges = await read("../public/data/edges.json");
const rec = await read("../src/recording/agent-thread.json");

// 좌표: 지도 범위를 가로세로 같은 배율로 0–10000 정수에 담는다(y는 아래로 +, 지도와 같다).
const xs = map.x.filter(Number.isFinite),
  ys = map.y.filter(Number.isFinite);
const zs = map.z.filter(Number.isFinite);
const x0 = Math.min(...xs),
  y0 = Math.min(...ys),
  z0 = Math.min(...zs);
const span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
const q = (v, o) => Math.round(((v - o) / span) * 10000);

// 상위 분야: 트리 레벨 0에서 편수가 큰 8개(plan 참고). 클러스터마다 속한 분야 번호.
const byId = new Map(tree.nodes.map((n) => [n.id, n]));
const leavesOf = (id) => {
  const out = [],
    st = [id];
  while (st.length) {
    const n = byId.get(st.pop());
    if (n.cluster_id !== null) out.push(n.cluster_id);
    if (n.left !== null) st.push(n.left);
    if (n.right !== null) st.push(n.right);
  }
  return out;
};
const top = tree.levels["0"]
  .map((id) => byId.get(id))
  .sort((a, b) => b.size - a.size)
  .slice(0, 8);
const regionOf = new Map();
top.forEach((n, k) => leavesOf(n.id).forEach((c) => regionOf.set(c, k)));

// RT-1과 인용 이웃(코퍼스 안). citing[k]가 cited[k]를 인용한다.
const RT1 = "openalex:W4385430679";
const rt = map.id.indexOf(RT1);
const refs = [],
  citedBy = [];
for (let k = 0; k < edges.citing.length; k++) {
  if (edges.citing[k] === rt) refs.push(edges.cited[k]);
  if (edges.cited[k] === rt) citedBy.push(edges.citing[k]);
}

// 대화 기록: 질문, 도구 호출 순서, annotate가 그린 라벨.
const user = rec.messages.find((m) => m.role === "user").content[0].text;
const parts = rec.messages.find((m) => m.role === "assistant").content;
const tools = parts.filter((p) => p.type === "tool-call").map((p) => p.toolName);
const ann = parts.find((p) => p.toolName === "annotate");
const labels = ann.result.drawn.map((d) => ({
  i: map.id.indexOf(d.id.replace(/^paper:/, "")),
  label: d.label,
}));
if (labels.some((l) => l.i < 0)) throw new Error("라벨 논문이 지도에 없다");

// 피인용 상위 2% — 점을 조금 크게 그리는 데 쓴다(앱의 98분위 규칙).
const sorted = [...map.cited].sort((a, b) => a - b);
const cut = sorted[Math.floor(sorted.length * 0.98)];

const years = map.year.filter((y) => y !== null);
const DATA = {
  source: "피지컬 AI 코퍼스(OpenAlex, run " + map.run_id + ") · 에이전트 기록 " + rec.source.slice(0, 40),
  n: map.n,
  x: map.x.map((v) => (Number.isFinite(v) ? q(v, x0) : -1)),
  y: map.y.map((v) => (Number.isFinite(v) ? q(v, y0) : -1)),
  // 3D 좌표(3D UMAP 투영, 지도 x·y와 같은 투영). 같은 배율로 담는다.
  z: map.z.map((v) => (Number.isFinite(v) ? q(v, z0) : -1)),
  cluster: map.cluster,
  region: map.cluster.map((c) => regionOf.get(c) ?? -1),
  year: map.year.map((y) => y ?? 0),
  big: map.cited.map((c, i) => (c >= cut && c > 0 ? i : -1)).filter((i) => i >= 0),
  // 분야 이름의 3D 자리: 트리 노드의 x·y와 소속 논문 z의 평균.
  regions: top.map((n, k) => {
    let sz = 0, c = 0;
    for (let i = 0; i < map.n; i++)
      if (regionOf.get(map.cluster[i]) === k && Number.isFinite(map.z[i])) { sz += map.z[i]; c++; }
    return { label: n.label, x: q(n.x, x0), y: q(n.y, y0), z: q(sz / Math.max(1, c), z0), size: n.size };
  }),
  yearFrom: 2014, // 수집 범위(코퍼스 정의). backfill은 그 이전 논문도 들어 있다.
  yearTo: Math.max(...years),
  rt1: { i: rt, title: map.title[rt], year: map.year[rt], refs, citedBy },
  question: user,
  tools,
  labels,
};
const text =
  "// build-data.mjs가 만든다. 직접 고치지 않는다.\nwindow.DATA = " + JSON.stringify(DATA) + ";\n";
await writeFile(new URL("data.js", here), text);
console.log(
  `data.js ${(text.length / 1024).toFixed(0)}KB · n=${DATA.n} · refs=${refs.length} citedBy=${citedBy.length} · regions=${top.map((n) => n.label).join(", ")} · labels=${labels.length} · tools=${tools.join(",")}`,
);
