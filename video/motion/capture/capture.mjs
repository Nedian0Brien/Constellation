// 실행 중인 앱(웹 빌드)을 데스크톱 창 크기로 찍어 쇼케이스 영상의 앱 화면으로 쓴다.
// 지도 캔버스·영역 이름·캡션·확대 컨트롤·주석은 숨기고 그 자리를 투명하게 찍는다 — 영상이 앱 지도
// 코드(app-map.js)로 그 자리를 프레임마다 그린다. 나머지(헤더·사이드바·연도 막대·에이전트 패널)는
// 앱이 그린 픽셀 그대로다.
//
// 준비: 피지컬 AI API(8003)와 이 워크트리의 프런트엔드(5181)를 띄운다(.claude/launch.json의
// api-physical-ai, web-promo-video). 실행: node video/motion/capture/capture.mjs
// 결과: video/motion/assets/ — map·welcome·chat.png(창 전체), compose-NNN.png(질문 입력 과정의 입력창),
// thread-N.png(대화 내용 스크롤 타일), rects.json(CSS px). 모두 2배 해상도.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";

const SKILL = process.env.JS_MOTION_TOOL ?? `${homedir()}/.claude/skills/js-motion-video/tool`;
const { default: puppeteer } = await import(`${SKILL}/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js`);
const APP = process.env.APP_URL ?? "http://localhost:5181";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// 데스크톱 앱 창 크기(src-tauri/tauri.conf.json windows[0]).
const WIN = { width: 1440, height: 950 };
const here = new URL(".", import.meta.url);
const out = new URL("../assets/", here);
await mkdir(out, { recursive: true });

const rec = JSON.parse(await readFile(new URL("../../src/recording/agent-thread.json", here), "utf8"));
const map = JSON.parse(await readFile(new URL("../../public/data/map.json", here), "utf8"));
const RUN = map.run_id;

// 기록을 앱의 대화 저장 형식(frontend/src/agent/history.ts StoredThread)으로 되돌린다.
function storedThread() {
  const at = new Date("2026-09-24T03:00:00Z");
  const [u, a] = rec.messages;
  const user = {
    id: "promo-user", role: "user", createdAt: at, content: u.content, attachments: [],
    metadata: { custom: {} },
  };
  const assistant = {
    id: "promo-assistant", role: "assistant", createdAt: at, content: a.content,
    status: { type: "complete", reason: "stop" },
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} },
  };
  return {
    version: 1,
    sessionId: "00000000-0000-4000-8000-000000000000",
    repository: {
      headId: assistant.id,
      messages: [{ message: user, parentId: null }, { message: assistant, parentId: user.id }],
    },
  };
}

// 지도 레이어를 숨기고 지도 영역과 그 조상을 투명하게 둔다. 데스크톱 헤더(신호등 자리)를 켠다.
const PREP = `
document.querySelector('.product-shell')?.setAttribute('data-desktop', '');
const style = document.createElement('style');
style.textContent = \`
  .map-wrap canvas, .region-name, .map-caption, .map-controls, .map-reset, .map-annotations, .tooltip, .aui-thread-scroll-to-bottom { visibility: hidden !important; }
  .map-wrap { background: none !important; }
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
\`;
document.head.appendChild(style);
for (let el = document.querySelector('.map-wrap'); el; el = el.parentElement) el.style.background = 'transparent';
document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';
`;
const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
const page = await browser.newPage();
await page.setViewport({ ...WIN, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("page error:", e.message));

async function open(prefs, thread) {
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.evaluate((prefs, key, thread) => {
    localStorage.clear();
    localStorage.setItem("constellation.layout.v3", JSON.stringify({ ...prefs, version: 3 }));
    if (thread) localStorage.setItem(key, JSON.stringify(thread));
  }, prefs, `constellation.agent.v1:${RUN}`, thread);
  await page.goto(APP, { waitUntil: "networkidle0" });
  await page.waitForSelector(".region-name", { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(PREP);
  await new Promise((r) => setTimeout(r, 800));
}
// captureBeyondViewport를 끈다: 켜면 찍는 동안 뷰포트가 바뀌어 앱이 입력창을 다시 만들고 입력이 지워진다.
async function shot(name) {
  await page.screenshot({ path: new URL(`${name}.png`, out).pathname, omitBackground: true, captureBeyondViewport: false });
}
const rects = { window: WIN, run: RUN };

// 1. 지도: 탐색 패널만 연 기본 화면.
await open({ navOpen: true, chatOpen: false }, null);
Object.assign(rects, await page.evaluate((rectSrc) => {
  const rect = eval(rectSrc);
  return {
    map: rect(document.querySelector(".map-wrap")),
    header: rect(document.querySelector(".product-header")),
  };
}, rect.toString()));
await shot("map");

// 2. 입력: 에이전트 패널을 연 빈 대화(환영 화면)에 질문을 한 글자씩 친다. 입력창 영역만 글자 수마다 찍는다.
await open({ navOpen: true, chatOpen: true }, null);
await shot("welcome");
const input = await page.waitForSelector("textarea");
await input.evaluate((t) => (t.spellcheck = false)); // 브라우저 맞춤법 밑줄을 끈다(캡처한 브라우저의 설정이지 앱 화면이 아니다).
await input.click(); // 초점을 먼저 준다. 그래야 첫 글자가 빠지지 않고 입력창이 줄 수만큼 자란다(앱과 같다).
Object.assign(rects, await page.evaluate((rectSrc) => {
  const rect = eval(rectSrc);
  return { mapChat: rect(document.querySelector(".map-wrap")), composer: rect(document.querySelector("textarea").closest("form")) };
}, rect.toString()));
const question = rec.messages[0].content[0].text;
const STEP = 2; // 글자 수 간격
rects.typing = [];
const chars = [...question];
for (let n = 0; n <= chars.length; n += STEP) {
  if (n > 0) await input.type(chars.slice(n - STEP, n).join(""));
  const c = await page.evaluate(() => { const r = document.querySelector("textarea").closest("form").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const name = `compose-${String(n).padStart(3, "0")}`;
  await page.screenshot({ path: new URL(`${name}.png`, out).pathname, omitBackground: true, captureBeyondViewport: false, clip: { x: c.x - 2, y: c.y - 2, width: c.w + 4, height: c.h + 4 } });
  rects.typing.push({ n, name, x: c.x - 2, y: c.y - 2, w: c.w + 4, h: c.h + 4 });
  if (process.env.DEBUG) console.log(n, await page.evaluate(() => { const t = document.querySelector("textarea"); return [t.value.length, t.clientHeight, t.scrollHeight, t.scrollTop, document.activeElement === t]; }));
  if (n + STEP > chars.length && n < chars.length) n = chars.length - STEP; // 마지막 글자까지
}

// 3. 대화: 기록된 대화 전체. 창 전체(스크롤 맨 위)와, 대화 내용을 스크롤 타일로 찍는다.
await open({ navOpen: true, chatOpen: true }, storedThread());
const SCROLLER = `document.querySelector('.aui-thread-root .overflow-y-scroll')`;
await page.evaluate(`${SCROLLER}.scrollTop = 0`);
await new Promise((r) => setTimeout(r, 300));
await shot("chat");
Object.assign(rects, await page.evaluate((rectSrc, SCROLLER) => {
  const rect = eval(rectSrc);
  const sc = eval(SCROLLER);
  const top = sc.getBoundingClientRect().y;
  const footer = document.querySelector(".aui-thread-viewport-footer");
  // 위에서 아래로 나타날 조각: 사용자 메시지, 도구 행, 답의 문단(대화 내용 좌표).
  const parts = [...sc.querySelectorAll(".aui-user-message-content, .aui-tool-fallback-root, [class*='aui-reasoning'][class*='root'], .aui-md > *")]
    .filter((el) => el.getBoundingClientRect().height > 0)
    .map((el) => { const r = rect(el); const c = el.className.toString(); return { kind: c.includes("user") ? "user" : c.includes("tool") ? "tool" : c.includes("reasoning") ? "reasoning" : "text", ...r, y: r.y - top, text: el.textContent.slice(0, 40) }; })
    .sort((a, b) => a.y - b.y);
  return { scroller: rect(sc), footer: footer ? rect(footer) : null, content: sc.scrollHeight, parts };
}, rect.toString(), SCROLLER));
// 타일: 입력창(바닥 고정)을 숨기고 스크롤러 영역을 스크롤하며 찍는다.
await page.evaluate(() => { const f = document.querySelector(".aui-thread-viewport-footer"); if (f) f.style.visibility = "hidden"; });
rects.tiles = [];
const sc = rects.scroller;
for (let top = 0; ; top += sc.h) {
  const y = Math.min(top, rects.content - sc.h);
  await page.evaluate(`${SCROLLER}.scrollTop = ${y}`);
  await new Promise((r) => setTimeout(r, 200));
  const name = `thread-${rects.tiles.length}`;
  await page.screenshot({ path: new URL(`${name}.png`, out).pathname, omitBackground: true, captureBeyondViewport: false, clip: { x: sc.x, y: sc.y, width: sc.w, height: sc.h } });
  rects.tiles.push({ name, y });
  if (y + sc.h >= rects.content) break;
}

await writeFile(new URL("rects.json", out), JSON.stringify(rects, null, 2));
console.log(JSON.stringify(rects, null, 1).slice(0, 3000));
await browser.close();
