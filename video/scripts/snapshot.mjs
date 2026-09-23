// 영상이 쓰는 지도 자료를 앱과 같은 질의 계층(constellation-serve의 /api)에서 받아
// public/data/에 그대로 저장한다. 서버를 먼저 띄운다:
//   cargo run -p constellation-serve -- --db data/constellation.duckdb
// 홍보 영상은 피지컬 AI 코퍼스(data/physical-ai, 포트 8003)를 쓴다:
//   CONSTELLATION_API=http://127.0.0.1:8003 CONSTELLATION_RUN=project-scincl-20260923T165703Z npm run snapshot
// 계보는 씨앗 논문(CONSTELLATION_SEED, 기본 RT-1) 주변 depth 2를 받는다.
import { mkdir, writeFile } from "node:fs/promises";

const api = process.env.CONSTELLATION_API ?? "http://127.0.0.1:8000";
const run = process.env.CONSTELLATION_RUN ?? "project-scincl-20260826T084511Z";
const seed = process.env.CONSTELLATION_SEED ?? "openalex:W4385430679";
const out = new URL("../public/data/", import.meta.url);

async function get(path) {
  const response = await fetch(api + "/api" + path);
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

const runs = await get("/runs");
if (!runs.some((r) => r.run_id === run))
  throw new Error(
    `run ${run}이 없다. 있는 run: ${runs.map((r) => r.run_id).join(", ")}`,
  );
const q = "?run=" + encodeURIComponent(run);
await mkdir(out, { recursive: true });
for (const [name, path] of [
  ["map", "/map" + q],
  ["clusters", "/clusters" + q],
  ["tree", "/tree" + q],
  ["edges", "/edges" + q],
  ["flow", "/flow" + q],
  ["lineage", "/lineage" + q + "&seed=" + encodeURIComponent(seed) + "&depth=2"],
]) {
  const body = await get(path);
  await writeFile(new URL(name + ".json", out), JSON.stringify(body));
  console.log(name, body.n ?? body.nodes?.length ?? body.windows?.length ?? body.length);
}
