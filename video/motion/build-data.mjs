// 모션 티저가 쓰는 실제 데이터를 data.js(window.DATA)로 묶는다.
// 입력: video/public/data/*.json(피지컬 AI 코퍼스 스냅샷, `npm run snapshot`)과
//       video/src/recording/agent-thread.json(실제 에이전트 대화 기록).
// 지도 자료는 앱 API 응답과 같은 모양으로 둔다 — 영상은 앱 지도 함수(app-map.js)에 그대로 넘긴다.
// 영상에 나오는 수치와 이름은 모두 이 파일에서 온다 — 영상 코드에 숫자를 적지 않는다.
import { readFile, writeFile } from "node:fs/promises";

const here = new URL(".", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, here), "utf8"));
const map = await read("../public/data/map.json");
const clusters = await read("../public/data/clusters.json");
const tree = await read("../public/data/tree.json");
const edges = await read("../public/data/edges.json");
const rec = await read("../src/recording/agent-thread.json");

// 좌표는 소수 5자리(지도 단위). 이 코퍼스의 기준 배율(1280×720)에서 1단위는 약 90px이고
// 영상의 최대 배율(×64 안쪽)에서도 반올림 오차가 0.1px를 넘지 않는다.
const r5 = (v) => (Number.isFinite(v) ? Math.round(v * 1e5) / 1e5 : null);

// RT-1과 인용 이웃(코퍼스 안). citing[k]가 cited[k]를 인용한다.
const RT1 = "openalex:W4385430679";
const rt = map.id.indexOf(RT1);
const refs = [],
  citedBy = [];
for (let k = 0; k < edges.citing.length; k++) {
  if (edges.citing[k] === rt) refs.push(edges.cited[k]);
  if (edges.cited[k] === rt) citedBy.push(edges.citing[k]);
}

// 대화 기록: 질문, 도구 호출 순서, fly_to 단계, annotate가 그린 라벨.
const user = rec.messages.find((m) => m.role === "user").content[0].text;
const parts = rec.messages.find((m) => m.role === "assistant").content;
const calls = parts.filter((p) => p.type === "tool-call");
const fly = calls.find((p) => p.toolName === "fly_to");
const ann = calls.find((p) => p.toolName === "annotate");
const labels = ann.result.drawn.map((d) => ({
  i: map.id.indexOf(d.id.replace(/^paper:/, "")),
  label: d.label,
}));
if (labels.some((l) => l.i < 0)) throw new Error("라벨 논문이 지도에 없다");

// 앱 화면 캡처의 요소 위치(capture/capture.mjs가 만든다). 영상이 캡처 위에 지도·입력·대화를 맞춰 그린다.
const capture = await read("assets/rects.json");

const DATA = {
  source: "피지컬 AI 코퍼스(OpenAlex, run " + map.run_id + ") · 에이전트 기록 " + rec.source.slice(0, 40),
  map: {
    n: map.n,
    x: map.x.map(r5),
    y: map.y.map(r5),
    year: map.year,
    cited: map.cited,
    title: map.title,
    cluster: map.cluster,
  },
  clusters: clusters.map(({ cluster_id, label, size, x, y }) => ({ cluster_id, label, size, x: r5(x), y: r5(y) })),
  tree: {
    nodes: tree.nodes.map(({ id, left, right, size, cluster_id, x, y, label }) => ({
      id, left, right, size, cluster_id, x: r5(x), y: r5(y), label,
    })),
    levels: tree.levels,
  },
  yearFrom: 2014, // 수집 범위(코퍼스 정의). backfill은 그 이전 논문도 들어 있다.
  rt1: { i: rt, refs, citedBy },
  question: user,
  tools: calls.map((p) => p.toolName),
  flyLevel: fly.args.level,
  labels,
  capture,
};
// 캡처 이미지를 data URI로 묶는다. file://로 연 페이지에서 파일 이미지를 쓰면 캔버스가 오염돼
// WebGL 텍스처로 올릴 수 없다(SecurityError). data URI는 같은 출처로 취급된다.
import { readdir } from "node:fs/promises";
const pngs = (await readdir(new URL("assets/", here))).filter((f) => f.endsWith(".png")).sort();
const assets = {};
for (const f of pngs) assets[f.replace(/\.png$/, "")] = "data:image/png;base64," + (await readFile(new URL("assets/" + f, here))).toString("base64");
const assetText = "// build-data.mjs가 assets/*.png에서 만든다. 직접 고치지 않는다.\nwindow.ASSETS = " + JSON.stringify(assets) + ";\n";
await writeFile(new URL("assets.js", here), assetText);
console.log(`assets.js ${(assetText.length / 1024).toFixed(0)}KB · ${pngs.length}장`);

const text = "// build-data.mjs가 만든다. 직접 고치지 않는다.\nwindow.DATA = " + JSON.stringify(DATA) + ";\n";
await writeFile(new URL("data.js", here), text);
console.log(
  `data.js ${(text.length / 1024).toFixed(0)}KB · n=${map.n} · topics=${clusters.length} · refs=${refs.length} citedBy=${citedBy.length} · labels=${labels.length} · fly=${fly.args.level} · tools=${DATA.tools.join(",")}`,
);
