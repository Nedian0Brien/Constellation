'use strict';
const M = Motion;
const A = AppMap; // 앱 연구 지도 코드(frontend/src/views/map). app-map.js
const D = window.DATA;
const MAP = D.map;

// ─── Facts ──────────────────────────────────────────────────────────────
// source: 논문·좌표·주제·트리·RT-1 인용 이웃·질문·도구 호출·라벨은 모두 ./data.js
// (build-data.mjs가 피지컬 AI 코퍼스 스냅샷과 실제 에이전트 기록에서 만든다). 코드에 수치를 적지 않는다.
// source: 점·영역·제목·인용선·고리의 치수와 색, 영역 이름 배치, 제목이 켜지는 배율은 앱 코드
// (app-map.js = frontend/src/views/map/{labels,regions,edges,style,titles}.ts)에서 그대로 부른다.
// source: 아래 APP 값은 실행 중인 앱(어두운 테마, 1280×720)에서 getComputedStyle로 읽었다(2026-09-24).

// ─── 앱 화면 크기 ────────────────────────────────────────────────────────
// 앱의 지도는 CSS 픽셀로 그린다. 영상은 1280×720 CSS 화면을 기기 픽셀 비율 1.5로 그려
// 1920×1080을 낸다(Remotion 버전과 같은 설정). 아래 치수는 모두 CSS 픽셀이다.
const W = 1280, H = 720, DPR = 1.5;

// ─── 앱 토큰(측정값) ──────────────────────────────────────────────────────
const SANS = '-apple-system, "system-ui", "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'; // --font-sans
const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace'; // --font-mono
const SERIF = 'Georgia, "Times New Roman", "Noto Serif KR", "AppleMyungjo", serif'; // --font-region
const APP = {
  ground: '#0c1118', // .map-wrap --map-ground
  mark: 'rgba(255,255,255,0.16)', // --map-mark: 십자·크롭 마크
  background: '#101113', // --background
  foreground: '#e8e8ec', // --foreground
  muted: '#a5a6af', // --muted-foreground
  accent: '#86d9f0', // --accent: 에이전트 주석
  warn: '#f2cb8d', // --warn: 다이얼 바늘
  primary: '#d9d5e8', // --primary: 헤더 로고
  bubble: '#2b2c31', // --muted: 사용자 메시지
  border: '#37383f', // --border
  halo: [232, 232, 236, 210 / 255], // MapView selected-halo
  held: [255, 255, 255], // MapView: 선택·강조한 논문의 점
  topStroke: [255, 255, 255, 235 / 255], // MapView papers: 상위 피인용 흰 테두리
  paperAlpha: 205 / 255, // MapView colors: 강조 대상 점의 알파
  blobOpacity: 0.7, // MapView soft-regions: 주제 색 모드
  blobStops: [[0, 0.1], [0.45, 0.04], [1, 0]], // region-gradient.ts
  dotMin: 1.3, // MapView radiusMinPixels
  regionFont: { size: 20, line: 23, maxWidth: 205, pad: 4, shadows: [[0, 1, 5], [0, 0, 12]] }, // .region-name
  caption: { x: 34, y: 30, gap: 15, eyebrow: [10, 1.2], rest: [11, 1.1] }, // .map-caption(px, 자간 px)
  crop: { inset: 18, len: 56 }, // .map-wrap 모서리 크롭 마크
  cross: { tileW: 480, tileH: 400, half: 20 }, // .map-wrap 십자(480×400 칸 가운데, 40px)
  controls: { right: 18, width: 48, button: 32, icon: 16, gap: 4, resetRight: 26, resetGap: 12 }, // .map-controls, .map-reset
  dial: { height: 168, pxPerZoom: 48, minor: 0.25, tick: [6, 8, 14], label: [18, 9, 0.36], needle: [4, 10, 0.4, 6], mask: 0.18, hide: 0.12, min: -2 }, // ZoomDial.tsx, .zoom-*
  brand: { logo: 30, gap: 10, size: 16, weight: 550, tracking: -0.5, line: 0.8 }, // .product-brand, 헤더 로고 SVG
  annotation: { line: 1.5, dash: [3, 3], ring: 2, r: 4, d: 36, textGap: 4, font: 12, weight: 600, stroke: 4, edge: [200, 60] }, // .map-annotation, MapView
  chat: { size: 14, line: 20, padX: 16, padY: 8, radius: 7, rowPad: 6, icon: 16, gap: 8, bold: 700, spin: 0.6 }, // thread.aui 사용자 메시지, tool-fallback.aui 도구 행
  icons: {
    plus: ['M5 12h14', 'M12 5v14'], minus: ['M5 12h14'], reset: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
    check: ['M20 6 9 17l-5-5'],
    loader: ['M12 2v4', 'm16.2 7.8 2.9-2.9', 'M18 12h4', 'm16.2 16.2 2.9 2.9', 'M12 18v4', 'm4.9 19.1 2.9-2.9', 'M2 12h4', 'm4.9 4.9 2.9 2.9'],
    logo: 'M6 22 12 7l13 6-7 13L6 22Zm6-15 6 19M6 22l19-9', logoDots: [[6, 22, 2], [12, 7, 2.3], [25, 13, 1.8], [18, 26, 1.6]],
  }, // lucide-react(24 뷰박스, 획 2)와 앱 헤더 로고
  move: 0.28, // MapView move(): 280ms ease-out cubic
  flyPaper: 3.5, // agent/resolve.ts levelOffset.paper
};

// ─── STYLE ──────────────────────────────────────────────────────────────
// 브리프: 웹 랜딩(소리 없이 재생 가능), 영상만 보고 제품을 알아야 한다. 사용자 결정: 앱의 2D 연구
// 지도를 기준으로 하고 노드·영역·라벨은 앱 디자인을 그대로 옮긴다. 화면의 글자는 제품명과 데이터의
// 사실, 앱이 원래 띄우는 글자(캡션·다이얼·제목·주석·대화)뿐이다. 앱 값은 APP, 영상 연출 값은 여기.
const STYLE = {
  palette: {
    background: APP.ground,
    ink: APP.foreground,
    muted: APP.muted,
    brand: APP.primary,
    dim: 'rgba(12,17,24,0.72)', // 엔딩 제목 뒤 지도를 누르는 막(지도 바탕색)
  },
  type: {
    brand: (s) => `${APP.brand.weight} ${s}px ${SANS}`,
    region: (s) => `${s}px ${SERIF}`,
    mono: (s) => `${s}px ${MONO}`,
    sans: (s, w = 400) => `${w} ${s}px ${SANS}`,
  },
  motion: {
    enter: 0.8, exit: 0.5,
    easeIn: M.ease.outCubic, easeOut: M.ease.inOutSine, cam: M.ease.inOutCubic,
    regionFade: 0.5, // 영역 이름 묶음이 바뀌는 문턱의 교차 페이드 배율 폭(Remotion 버전과 같다)
    labelFade: A.LABEL_FADE_MS / 1000,
    type: 0.03, // 질문 한 글자 입력 간격(초)
    tool: 0.26, // 도구 호출 하나의 간격(초)
    rise: 10,
  },
  materials: ['app research map (orthographic)', 'region gradient blobs', 'cluster dots', 'citation lines', 'region names', 'paper titles', 'zoom dial', 'chat bubble + tool rows'],
  texture: {},
  sound: {
    chords: [[45, 52, 57, 64, 71], [41, 48, 57, 60, 67], [43, 50, 59, 62, 69], [45, 52, 60, 64, 71]],
    padGain: 0.05, whoosh: 1.2, whooshGain: 0.14, chimeGain: 0.06, hitGain: 0.3, master: 0.9,
    reverb: { seconds: 3.2, mix: 0.3, seed: 7 },
  },
  layout: {
    brandScale: 4, // 헤더 로고·제품명(30px·16px)을 같은 비율로 키운다
    chat: { x: 34, bottom: 34, width: 460, gap: 8, pad: 12 }, // 대화 조각을 앱 대화 패널 바탕(--background, --border) 위에 띄운다
    annotPad: 260, // 주석 셋을 담는 카메라의 여백(라벨이 오른쪽으로 뻗는다)
  },
};

const DURATION = 30, FPS = 30;
// 장면 시각(초). 화면과 소리가 같이 쓴다.
const T = {
  title: 0.5, titleOut: 2.6,
  mapIn: 2.2, // 지도 틀(캡션·다이얼)이 켜진다
  grow: [2.6, 7.8], // 연도 재생: 헤드가 첫해 − 1 → 마지막 해 + 1
  overview: 9.4,
  field: 11.6, // RT-1이 속한 상위 분야
  select: 13.4, // RT-1 선택(흰 점 + 고리)
  paper: 14.0, // RT-1(논문 제목 단계)
  hover: 15.0, // 인용선
  web: 17.0, // 물러나 인용망 전체
  ask: 19.4, // 질문
  annotFit: 1.2, // 주석 셋이 다 보이게 물러나는 시간
  end: 26.6, // 전체 보기
  brand: 27.6,
};
T.tools = T.ask + 0.4 + D.question.length * STYLE.motion.type + 0.3;
T.fly = T.tools + D.tools.indexOf('fly_to') * STYLE.motion.tool + 0.2;
T.annot = T.tools + D.tools.indexOf('annotate') * STYLE.motion.tool + 0.2;

// ── 앱 지도 모형(프레임과 무관, 한 번) ────────────────────────────────────
// Remotion 버전(video/src/map/model.ts)과 같은 함수·같은 입력: MapView가 useMemo로 드는 값.
const home = A.homeCamera(MAP, W, H);
const topCited = (() => {
  const s = [...MAP.cited].sort((a, b) => a - b), cut = s[Math.floor(s.length * A.TOP_CITED_QUANTILE)] ?? Infinity;
  return MAP.cited.map((c) => c >= cut && c > 0);
})();
const typo = A.titleTypography(); // body의 --font-mono와 글자색을 읽는다(video.html head)
const measure = A.titleMeasure(A.titleCharacterSet(MAP), typo);
const metrics = A.titleMetrics(MAP, measure);
const boxes = [];
for (let i = 0; i < MAP.n; i++)
  if (Number.isFinite(MAP.x[i]) && Number.isFinite(MAP.y[i]))
    boxes.push({ i, x: MAP.x[i], y: MAP.y[i], width: metrics.widths[i], priority: MAP.cited[i] });
const boxOf = new Int32Array(MAP.n).fill(-1);
boxes.forEach((b, k) => (boxOf[b.i] = k));
const reveals = A.revealZooms(boxes, home.zoom, A.TITLE_HEIGHT, home.zoom + A.ZOOM_RANGE);
const regions = [0, 1, 2].map((l) => A.regionLabels(D.tree, D.clusters, l));
const radii = A.regionRadii(MAP, D.tree, D.clusters);
const regionClusters = new Map(regions.flat().map((n) => [n.id, n.node !== undefined ? A.descendants(D.tree, n.node) : new Set([n.cluster])]));
const allAlive = new Set(regions.flat().map((n) => n.id));
const blobs = A.regionBlobs(MAP, D.clusters);
const COLOR = MAP.cluster.map((c) => A.clusterColor(c));
const years = MAP.year.filter((y) => y !== null);
const yearTo = Math.max(...years);
const RT = D.rt1.i;
const P = [MAP.x[RT], MAP.y[RT]];
// 영상이 파고드는 상위 분야: RT-1이 속한 레벨 0 영역(앱 트리).
const FIELD = regions[0].find((n) => A.descendants(D.tree, n.node).has(MAP.cluster[RT]));
// RT-1의 1홉 인용 그래프(앱 hover-links): 참조는 RT-1 → 이웃(파랑), 피인용은 이웃 → RT-1(빨강).
const LINKS = [...D.rt1.refs.map((j) => ({ j, out: true })), ...D.rt1.citedBy.map((j) => ({ j, out: false }))]
  .filter((l) => Number.isFinite(MAP.x[l.j]))
  .map((l) => ({ ...l, len: Math.hypot(MAP.x[l.j] - P[0], MAP.y[l.j] - P[1]) }));
// 주석 셋이 여백을 두고 다 들어오는 카메라(앱 fitCamera).
const ANN_CAM = A.fitCamera(D.labels.map((l) => MAP.x[l.i]), D.labels.map((l) => MAP.y[l.i]), W, H, STYLE.layout.annotPad, home.zoom - 2, home.zoom + A.ZOOM_RANGE);

// ── 카메라 ────────────────────────────────────────────────────────────────
// 열쇠 사이: 배율은 보간하고, 목적지의 화면 오프셋은 (1 − e)배로 준다(video/src/map/camera.ts와 같다).
const HOME = [home.target[0], home.target[1]];
const KEYS = [
  { t: 0, at: HOME, rel: 0 },
  { t: T.grow[1], at: HOME, rel: 0.08 },
  { t: T.overview, at: HOME, rel: 0.3 },
  { t: T.field, at: [FIELD.x, FIELD.y], rel: 1.6 },
  { t: T.paper, at: P, rel: 5.6 },
  { t: T.hover + 0.4, at: P, rel: 5.6 },
  { t: T.web, at: P, rel: 2.2 },
  { t: T.fly, at: P, rel: 2.2 },
];
function glide(from, to, e) {
  const zoom = from.zoom + (to.zoom - from.zoom) * e;
  const shrink = (2 ** from.zoom * (1 - e)) / 2 ** zoom;
  return { target: [to.target[0] - (to.target[0] - from.target[0]) * shrink, to.target[1] - (to.target[1] - from.target[1]) * shrink], zoom };
}
function keysAt(t) {
  let k = KEYS.findIndex((key) => t < key.t) - 1;
  if (k < 0) k = t < KEYS[0].t ? 0 : KEYS.length - 2;
  const a = KEYS[k], b = KEYS[k + 1];
  const e = STYLE.motion.cam(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
  return glide({ target: a.at, zoom: home.zoom + a.rel }, { target: b.at, zoom: home.zoom + b.rel }, e);
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
function cameraAt(t) {
  let cam = keysAt(t);
  // 에이전트 fly_to(level paper): 앱처럼 기준 배율 + levelOffset.paper로, 280ms ease-out cubic 선형 보간.
  const flyTo = { target: P, zoom: home.zoom + APP.flyPaper };
  if (t >= T.fly) {
    const from = keysAt(T.fly), f = 1 - (1 - clamp01((t - T.fly) / APP.move)) ** 3;
    cam = { target: [from.target[0] + (flyTo.target[0] - from.target[0]) * f, from.target[1] + (flyTo.target[1] - from.target[1]) * f], zoom: from.zoom + (flyTo.zoom - from.zoom) * f };
  }
  // 주석이 붙은 뒤 셋이 다 보이게 물러난다(사용자가 축소하는 것처럼, 영상 연출).
  const fitAt = T.annot + 0.5;
  if (t >= fitAt) cam = glide(flyTo, ANN_CAM, STYLE.motion.cam(clamp01((t - fitAt) / T.annotFit)));
  // 전체 보기(앱의 전체 보기 버튼과 같은 목적지).
  if (t >= T.end) cam = glide(ANN_CAM, home, STYLE.motion.cam(clamp01((t - T.end) / 1.4)));
  return cam;
}
const viewport = (cam) => {
  const s = 2 ** cam.zoom;
  return {
    s,
    project: (p) => [(p[0] - cam.target[0]) * s + W / 2, (p[1] - cam.target[1]) * s + H / 2],
    unproject: (p) => [(p[0] - W / 2) / s + cam.target[0], (p[1] - H / 2) / s + cam.target[1]],
  };
};

// 앱 호버 곡선(MapView hoverT·front, video/src/map/camera.ts focusAt): 240ms ease-out으로 켜지고,
// 앞머리는 화면에서 초당 LINK_SPEED px — 지도 단위로는 그 순간 배율로 나눈 속도를 더한다.
function focusAt(t, on, off) {
  if (t < on) return null;
  const fd = STYLE.motion.labelFade, eo = (x) => 1 - (1 - clamp01(x)) ** 3;
  const k = t < off ? eo((t - on) / fd) : 1 - eo((t - off) / fd);
  if (k <= 0) return null;
  let front = 0;
  for (let f = 0; on + f / FPS < Math.min(t, off); f++) front += A.LINK_SPEED / FPS / 2 ** cameraAt(on + f / FPS).zoom;
  return { t: k, front, fadeWorld: A.LINK_FADE_PX / 2 ** cameraAt(on).zoom };
}

// 연도 재생(앱 재생 헤드의 필터): 헤드 해의 논문은 소프트 범위로 옅게 켜진다.
// 앱 재생 헤드는 일정한 속도로 간다.
const yearHeadAt = (t) => (t < T.grow[1] ? M.keys(t, [[T.grow[0], D.yearFrom - 1], [T.grow[1], yearTo + 1]], M.ease.linear) : null);
const yearFactor = (i, head) => (head === null || MAP.year[i] === null ? 1 : clamp01(head - MAP.year[i]));
function clusterShare(head) {
  const total = new Map(), shown = new Map();
  for (let i = 0; i < MAP.n; i++) {
    const c = MAP.cluster[i], y = MAP.year[i];
    total.set(c, (total.get(c) ?? 0) + 1);
    const w = y === null ? 1 : clamp01(head - y + 1);
    if (w > 0) shown.set(c, (shown.get(c) ?? 0) + w);
  }
  const out = new Map();
  for (const [c, n] of total) out.set(c, (shown.get(c) ?? 0) / n);
  return out;
}

// ── 소리 ─────────────────────────────────────────────────────────────────
const S = STYLE.sound;
const score = M.audio.synth((ac, A2) => {
  const cuts = [0, T.field - 1.5, T.hover, T.end, DURATION];
  S.chords.forEach((notes, k) => A2.pad({ t0: Math.max(0, cuts[k] - 1), t1: cuts[k + 1] + 1, notes, gain: S.padGain }));
  [T.overview + 0.4, T.paper - 1.6, T.web - 1.2, T.end + 0.2].forEach((t) => A2.whoosh({ t, dur: S.whoosh, gain: S.whooshGain }));
  A2.hit({ t: T.title, gain: S.hitGain });
  A2.chime({ t: T.select, note: 81, gain: S.chimeGain });
  A2.chime({ t: T.hover, note: 88, gain: S.chimeGain });
  D.labels.forEach((_, k) => A2.chime({ t: T.annot + k * 0.12, note: 84 + k * 3, gain: S.chimeGain * 0.8 }));
  A2.hit({ t: T.brand, gain: S.hitGain * 0.8 });
}, { gain: S.master, reverb: S.reverb });

const film = M.film({
  title: 'Constellation', duration: DURATION, fps: FPS, width: W * DPR, height: H * DPR,
  background: STYLE.palette.background, style: STYLE,
  fonts: [
    [STYLE.type.brand(64), 'Constellation'],
    [STYLE.type.sans(14), D.question + ' 도구'],
    [STYLE.type.sans(14, APP.chat.bold), D.tools.join(' ')],
    [STYLE.type.sans(12, APP.annotation.weight), D.labels.map((l) => l.label).join(' ')],
  ],
  assets: {}, audio: score, draw,
});

// ── 그리기 ───────────────────────────────────────────────────────────────
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const span = (t, a, b) => M.span(t, a, b, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn, outDur: STYLE.motion.exit, easeOut: STYLE.motion.easeOut });
let DEV = DPR; // 지금 캔버스의 CSS px → 기기 px 배율(그림자 흐림·오프셋은 변환을 받지 않는다)

function draw(ctx, t) {
  film.clear();
  ctx.save();
  ctx.translate(-W * DPR / 2, -H * DPR / 2);
  ctx.scale(DPR, DPR);
  DEV = ctx.getTransform().a;

  const cam = cameraAt(t), vp = viewport(cam);
  const rel = cam.zoom - home.zoom;
  const head = yearHeadAt(t);

  drawGround(ctx);
  ctx.globalAlpha = span(t, T.mapIn, DURATION + 1);
  drawMap(ctx, t, cam, vp, rel, head);
  drawAnnotations(ctx, t, vp);
  drawCaption(ctx, rel, head);
  drawControls(ctx, cam.zoom);
  ctx.globalAlpha = 1;
  drawChat(ctx, t);

  // 엔딩: 지도를 바탕색 막으로 누르고 제품명.
  const endA = span(t, T.brand, DURATION + 1);
  if (endA > 0) { ctx.fillStyle = STYLE.palette.dim; ctx.globalAlpha = endA; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  drawBrand(ctx, t, T.title, T.titleOut);
  drawBrand(ctx, t, T.brand, DURATION + 1);
  ctx.restore();
}

// 지도 바탕: 바탕색, 화면에 고정된 십자(480×400 칸 가운데), 모서리 크롭 마크(.map-wrap).
function drawGround(ctx) {
  ctx.fillStyle = APP.ground; ctx.fillRect(0, 0, W, H);
  const C = APP.cross, K = APP.crop;
  ctx.fillStyle = APP.mark;
  const ox = W / 2 - C.tileW / 2, oy = H / 2 - C.tileH / 2; // background-position: center
  for (let x = ox - C.tileW * Math.ceil(ox / C.tileW); x < W; x += C.tileW)
    for (let y = oy - C.tileH * Math.ceil(oy / C.tileH); y < H; y += C.tileH) {
      const cx = x + C.tileW / 2, cy = y + C.tileH / 2;
      ctx.fillRect(cx - C.half, cy, C.half * 2, 1); // M220 200.5h40
      ctx.fillRect(cx, cy - C.half, 1, C.half * 2); // M240.5 180v40
    }
  for (const [x, y, sx, sy] of [[K.inset, K.inset, 1, 1], [W - K.inset, K.inset, -1, 1], [K.inset, H - K.inset, 1, -1], [W - K.inset, H - K.inset, -1, -1]]) {
    ctx.fillRect(sx > 0 ? x : x - K.len, sy > 0 ? y : y - 1, K.len, 1);
    ctx.fillRect(sx > 0 ? x : x - 1, sy > 0 ? y : y - K.len, 1, K.len);
  }
}

function drawMap(ctx, t, cam, vp, rel, head) {
  const share = head === null ? null : clusterShare(head);
  const alive = share
    ? new Set([...regionClusters].filter(([, cs]) => [...cs].some((c) => (share.get(c) ?? 0) > 0)).map(([id]) => id))
    : allAlive;
  const level = A.labelLevel(rel);
  const scale = A.dotScale(rel);
  const rpx = (i) => Math.min(A.DOT_RADIUS_MAX, Math.max(APP.dotMin, scale * (topCited[i] ? A.DOT_RADIUS_TOP : A.DOT_RADIUS)));
  const focus = focusAt(t, T.hover, T.ask);
  const hoverT = focus?.t ?? 0;
  const selected = t >= T.select && t < T.end ? RT : -1;
  const baseA = ctx.globalAlpha;

  // 1. 영역 배경(soft-regions): 중심 0.10 → 45%에서 0.04 → 가장자리 0, 불투명도 0.7 × 그려지는 비율.
  for (const b of blobs) {
    const f = share ? share.get(b.id) ?? 0 : 1;
    if (f <= 0) continue;
    const [x, y] = vp.project(b.position), r = b.radius * vp.s;
    if (x + r < 0 || x - r > W || y + r < 0 || y - r > H) continue;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, a] of APP.blobStops) g.addColorStop(o, rgba(b.color, a * APP.blobOpacity * f));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 2. 논문 점(papers): 주제 색, 상위 피인용은 크게 + 흰 테두리, 선택한 논문은 흰색. 강조 중에는 절반으로 옅어진다.
  const dim = 1 - A.HOVER_DIM * hoverT;
  ctx.globalAlpha = baseA * dim;
  const pos = new Float32Array(MAP.n * 2);
  const groups = new Map(), ring = [];
  for (let i = 0; i < MAP.n; i++) {
    if (!Number.isFinite(MAP.x[i])) continue;
    const [x, y] = vp.project([MAP.x[i], MAP.y[i]]);
    pos[i * 2] = x; pos[i * 2 + 1] = y;
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    const f = yearFactor(i, head);
    if (f <= 0) continue;
    const r = rpx(i), sel = i === selected;
    const c = sel ? APP.held : COLOR[i];
    const a = Math.round((sel ? 1 : APP.paperAlpha) * f * 64) / 64;
    const key = `${c}|${a}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { c, a, path: new Path2D() }));
    g.path.moveTo(x + r, y); g.path.arc(x, y, r, 0, M.TAU);
    if (topCited[i]) ring.push([x, y, r, f]);
  }
  for (const g of groups.values()) { ctx.fillStyle = rgba(g.c, g.a); ctx.fill(g.path); }
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(APP.topStroke, APP.topStroke[3]);
  for (const [x, y, r, f] of ring) { ctx.globalAlpha = baseA * dim * f; ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU); ctx.stroke(); }
  ctx.globalAlpha = baseA;

  // 3. 인용선(hover-links)과 이웃·강조 점(hover-nodes).
  if (focus) {
    const px = pos[RT * 2], py = pos[RT * 2 + 1];
    ctx.lineWidth = A.LINK_WIDTH; ctx.lineCap = 'butt';
    for (const l of LINKS) {
      const f = l.len > 0 ? Math.min(1, focus.front / l.len) : 1;
      const qx = pos[l.j * 2], qy = pos[l.j * 2 + 1];
      ctx.strokeStyle = rgba(l.out ? A.LINK_OUT : A.LINK_IN, hoverT);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (qx - px) * f, py + (qy - py) * f); ctx.stroke();
    }
    const node = (i, fill, k) => {
      const r = rpx(i);
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(pos[i * 2], pos[i * 2 + 1], r, 0, M.TAU); ctx.fill();
      if (topCited[i]) { ctx.strokeStyle = rgba(APP.topStroke, APP.topStroke[3] * k); ctx.lineWidth = 1; ctx.stroke(); }
    };
    for (const l of LINKS) {
      const k = hoverT * clamp01((focus.front - l.len) / focus.fadeWorld);
      if (k > 0) node(l.j, rgba(COLOR[l.j], APP.paperAlpha * k), k);
    }
    node(RT, rgba(APP.held, hoverT), hoverT);
  }

  // 4. 선택 고리(selected-halo): 점보다 HALO_GAP 밖, 최소 HALO_MIN.
  if (selected >= 0) {
    const r = Math.max(A.HALO_MIN, rpx(selected) + A.HALO_GAP);
    ctx.globalAlpha = baseA * clamp01((t - T.select) / STYLE.motion.labelFade);
    ctx.strokeStyle = rgba(APP.halo, APP.halo[3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(pos[selected * 2], pos[selected * 2 + 1], r, 0, M.TAU); ctx.stroke();
    ctx.globalAlpha = baseA;
  }

  // 5. 영역 이름: 묶음마다 앱 규칙(placeRegionLabels)으로 놓고, 문턱의 교차 페이드 × 논문 제목이 켜지는 만큼 옅어짐.
  const size = { width: W, height: H };
  const regionOpacity = 1 - A.paperLabelOpacity(rel);
  const STEPS = [-Infinity, 1, 2, Infinity];
  const names = [];
  regions.forEach((items, k) => {
    const wgt = clamp01((rel - STEPS[k]) / STYLE.motion.regionFade + 0.5) * clamp01((STEPS[k + 1] - rel) / STYLE.motion.regionFade + 0.5);
    if (wgt <= 0 || regionOpacity <= 0) return;
    const placed = A.placeRegionLabels(items, vp, size, radii, alive, rel);
    for (const n of items) if (placed.has(n.id)) names.push({ label: n.label, at: placed.get(n.id), a: wgt * regionOpacity });
  });
  // 하위 분야 단계인데 화면에 영역 이름이 없으면 제목의 바닥을 없앤다(앱 regionless).
  const cur = STEPS.findIndex((s) => rel < s) - 1;
  const regionless = level === 'topic' && A.placeRegionLabels(regions[cur], vp, size, radii, alive, rel).size === 0 ? 1 : 0;
  const floor = level === 'field' ? Infinity : home.zoom + A.PAPER_LABEL_ZOOM - 0.5;

  // 6. 논문 제목(paper-titles·paper-values): 모노 10px 대문자, 점 오른쪽. 연도는 점 색.
  if (head === null && (level !== 'field' || regionless > 0)) {
    ctx.font = `${A.TITLE_FONT_SIZE}px ${typo.fontFamily}`; ctx.letterSpacing = `${A.TITLE_TRACKING}px`;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const hx = W / 2 + A.TITLE_MARGIN_X, hy = H / 2 + A.TITLE_MARGIN_Y;
    const title = (i, k, alpha) => {
      const x = pos[i * 2], y = pos[i * 2 + 1] + A.TITLE_HEIGHT * reveals.row[k];
      ctx.fillStyle = rgba(typo.color, alpha);
      ctx.fillText(metrics.displays[i], x + A.TITLE_OFFSET_X, y);
      ctx.fillStyle = rgba(COLOR[i], alpha);
      ctx.fillText(metrics.values[i], x + metrics.valueDx[i], y);
    };
    // 선택·강조한 논문은 이웃에 가려지지 않는다(앱 titleOpacity의 selected).
    const heldA = Math.max(hoverT, selected === RT ? A.paperTitleOpacity(cam.zoom, -Infinity, floor, regionless) : 0);
    boxes.forEach((b, k) => {
      if (b.i === RT) return;
      if (Math.abs(pos[b.i * 2] - W / 2) > hx || Math.abs(pos[b.i * 2 + 1] - H / 2) > hy) return;
      const a = A.paperTitleOpacity(cam.zoom, reveals.zoom[k], floor, regionless);
      if (a > 0) title(b.i, k, a);
    });
    const a = Math.max(heldA, A.paperTitleOpacity(cam.zoom, reveals.zoom[boxOf[RT]], floor, regionless));
    if (a > 0) title(RT, boxOf[RT], a);
    ctx.letterSpacing = '0px';
  }

  // 영역 이름은 앱에서 DOM이라 캔버스 위에 온다.
  drawRegionNames(ctx, names, baseA);
}

// .region-name: Georgia 20px/23px, 최대 폭 205px(안쪽 여백 4px), 가운데 정렬, 바탕색 그림자 두 겹.
function drawRegionNames(ctx, names, baseA) {
  const F = APP.regionFont;
  ctx.font = STYLE.type.region(F.size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const m = (s) => ctx.measureText(s).width;
  for (const n of names) {
    const lines = A.wrapTitle(m, n.label, F.maxWidth - F.pad * 2);
    const y0 = n.at[1] - ((lines.length - 1) * F.line) / 2;
    ctx.globalAlpha = baseA * n.a;
    // CSS text-shadow는 그림자만 글자 아래에 깐다: 글자는 화면 밖에 그리고 그림자만 제자리로 끌어온다.
    for (const [dx, dy, blur] of F.shadows) {
      ctx.shadowColor = APP.background; ctx.shadowBlur = blur * DEV;
      ctx.shadowOffsetX = 10000 * DEV + dx * DEV; ctx.shadowOffsetY = dy * DEV;
      ctx.fillStyle = '#000';
      lines.forEach((l, k) => ctx.fillText(l, n.at[0] - 10000, y0 + k * F.line));
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = APP.foreground;
    lines.forEach((l, k) => ctx.fillText(l, n.at[0], y0 + k * F.line));
  }
  ctx.globalAlpha = baseA; ctx.textAlign = 'left';
}

// 에이전트 주석(.map-annotation): 점의 오른쪽 위 36px로 점선, 점에 고리, 라벨은 바탕색 외곽선.
function drawAnnotations(ctx, t, vp) {
  const N = APP.annotation, baseA = ctx.globalAlpha;
  if (t < T.annot) return;
  const a = (1 - (1 - clamp01((t - T.annot) / STYLE.motion.labelFade)) ** 3) * (1 - clamp01((t - T.end) / STYLE.motion.labelFade));
  if (a <= 0) return;
  for (const l of D.labels) {
    const [px, py] = vp.project([MAP.x[l.i], MAP.y[l.i]]);
    const dx = px > W - N.edge[0] ? -N.d : N.d, dy = py < N.edge[1] ? N.d : -N.d;
    const lx = px + dx, ly = py + dy;
    ctx.globalAlpha = baseA * a;
    ctx.strokeStyle = APP.accent; ctx.lineWidth = N.line; ctx.setLineDash(N.dash);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lx, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = N.ring; ctx.beginPath(); ctx.arc(px, py, N.r, 0, M.TAU); ctx.stroke();
    ctx.font = STYLE.type.sans(N.font, N.weight); ctx.textBaseline = 'middle'; ctx.textAlign = dx > 0 ? 'left' : 'right';
    const tx = lx + (dx > 0 ? N.textGap : -N.textGap);
    ctx.lineJoin = 'round'; ctx.lineWidth = N.stroke; ctx.strokeStyle = APP.background;
    ctx.strokeText(l.label, tx, ly);
    ctx.fillStyle = APP.foreground; ctx.fillText(l.label, tx, ly);
  }
  ctx.globalAlpha = baseA; ctx.textAlign = 'left';
}

// .map-caption: 단계 이름(10px, 자간 1.2px) · 주제 수와 편수(11px, 자간 1.1px), 모노 대문자.
// 연도 재생 중에는 그려지는 편수와 재생 헤드 해를 같은 모양으로 보인다(영상 연출).
function drawCaption(ctx, rel, head) {
  const C = APP.caption;
  const level = A.labelLevel(rel);
  const eyebrow = level === 'field' ? '상위 분야' : level === 'topic' ? '하위 분야' : '논문 제목';
  let shown = MAP.n;
  if (head !== null) { shown = 0; for (let i = 0; i < MAP.n; i++) if (yearFactor(i, head) >= 1) shown++; }
  const parts = [[eyebrow, C.eyebrow], [`${D.clusters.length}개 주제 · ${shown.toLocaleString('en-US')}편`, C.rest]];
  if (head !== null) parts.push([String(Math.min(yearTo, Math.floor(head))), C.rest]);
  ctx.fillStyle = APP.muted; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  let x = C.x;
  for (const [text, [size, ls]] of parts) {
    ctx.font = STYLE.type.mono(size); ctx.letterSpacing = `${ls}px`;
    ctx.fillText(text, x, C.y + 7);
    x += ctx.measureText(text).width + C.gap;
  }
  ctx.letterSpacing = '0px';
}

// 확대 컨트롤(.map-controls): 오른쪽 가운데에 + / 다이얼 / −, 그 아래 전체 보기.
// 다이얼(ZoomDial.tsx): 0.25단계 눈금, 정수 단계 큰 눈금과 %, 가운데 바늘(--warn), 위아래 18% 마스크.
function icon(ctx, paths, x, y, size, color) {
  ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const d of paths) ctx.stroke(new Path2D(d));
  ctx.restore();
}
function drawControls(ctx, zoom) {
  const K = APP.controls, G = APP.dial, baseA = ctx.globalAlpha;
  const x0 = W - K.right - K.width, cx = x0 + K.width / 2;
  const total = K.button * 2 + K.gap * 2 + G.height;
  const top = H / 2 - total / 2, dialTop = top + K.button + K.gap;
  const pct = (z) => Math.round(100 * 2 ** (z - home.zoom));
  const min = home.zoom + G.min, max = home.zoom + A.ZOOM_RANGE;
  const half = G.height / 2 / G.pxPerZoom;
  const mask = (y) => { const v = (y - dialTop) / G.height; return v < G.mask ? v / G.mask : v > 1 - G.mask ? (1 - v) / G.mask : 1; };
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let m = Math.ceil((zoom - half - home.zoom) / G.minor); m <= Math.floor((zoom + half - home.zoom) / G.minor); m++) {
    const z = home.zoom + m * G.minor;
    if (z < min - 1e-9 || z > max + 1e-9) continue;
    const major = m % 4 === 0, y = dialTop + G.height / 2 - (z - zoom) * G.pxPerZoom;
    ctx.globalAlpha = baseA * clamp01(mask(y));
    const w = major ? G.tick[2] : G.tick[1];
    ctx.fillStyle = major ? APP.foreground : APP.muted;
    ctx.fillRect(x0 + K.width - G.tick[0] - w, y - 0.5, w, 1);
    if (major && Math.abs(z - zoom) > G.hide) {
      ctx.font = STYLE.type.mono(G.label[1]); ctx.letterSpacing = `${G.label[2]}px`; ctx.fillStyle = APP.muted;
      ctx.fillText(`${pct(z)}%`, x0 + K.width - G.tick[0] - G.label[0], y);
    }
  }
  ctx.globalAlpha = baseA;
  const cy = dialTop + G.height / 2;
  ctx.fillStyle = APP.warn;
  ctx.fillRect(x0 + G.needle[0], cy - 1, K.width - G.needle[0] * 2, 2);
  ctx.font = STYLE.type.mono(G.needle[1]); ctx.letterSpacing = `${G.needle[2]}px`;
  ctx.fillText(`${pct(zoom)}%`, x0 + G.needle[0] - G.needle[3], cy);
  ctx.letterSpacing = '0px'; ctx.textAlign = 'left';
  icon(ctx, APP.icons.plus, cx, top + K.button / 2, K.icon, APP.foreground);
  icon(ctx, APP.icons.minus, cx, top + total - K.button / 2, K.icon, APP.foreground);
  icon(ctx, APP.icons.reset, W - K.resetRight - K.button / 2, top + total + K.resetGap + K.button / 2, K.icon, APP.foreground);
}

// 에이전트: 사용자 메시지(bg-muted, rounded-xl, 14px/20px)와 도구 행("도구: 이름", 아이콘 16px, muted).
function drawChat(ctx, t) {
  const L = STYLE.layout.chat, C = APP.chat;
  const a = span(t, T.ask, T.end);
  if (a <= 0) return;
  ctx.font = STYLE.type.sans(C.size);
  const m = (s) => ctx.measureText(s).width;
  const lines = A.wrapTitle(m, D.question, L.width - C.padX * 2);
  const n = Math.max(0, Math.floor((t - T.ask - 0.4) / STYLE.motion.type));
  const bubbleH = lines.length * C.line + C.padY * 2;
  const rowH = C.icon + C.rowPad * 2;
  const shown = D.tools.filter((_, k) => t >= T.tools + k * STYLE.motion.tool).length;
  const y0 = H - L.bottom - L.pad - bubbleH - (shown ? L.gap + shown * rowH : 0) + (1 - a) * STYLE.motion.rise;
  ctx.globalAlpha = a;
  // 대화 패널 바탕: 도구 행이 지도 점 위에서도 읽힌다.
  const bottom = H - L.bottom - L.pad + (1 - a) * STYLE.motion.rise;
  ctx.fillStyle = APP.background; ctx.strokeStyle = APP.border; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(L.x - L.pad + 0.5, y0 - L.pad + 0.5, L.width + L.pad * 2, bottom - y0 + L.pad * 2, C.radius); ctx.fill(); ctx.stroke();
  // 말풍선: 줄은 미리 정해 두고 앞 n글자만 그린다(타이핑).
  ctx.fillStyle = APP.bubble; ctx.beginPath(); ctx.roundRect(L.x, y0, Math.max(...lines.map(m)) + C.padX * 2, bubbleH, C.radius); ctx.fill();
  ctx.fillStyle = APP.foreground; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  let left = n;
  lines.forEach((l, k) => {
    if (left <= 0) return;
    ctx.fillText(l.slice(0, left), L.x + C.padX, y0 + C.padY + k * C.line + C.line / 2);
    left -= l.length + 1;
  });
  // 도구 행: 실행 중(loader 회전) → 완료(check). 기록된 순서 그대로.
  let y = y0 + bubbleH + L.gap;
  D.tools.forEach((name, k) => {
    const at = T.tools + k * STYLE.motion.tool;
    if (t < at) return;
    ctx.globalAlpha = a * clamp01((t - at) / 0.15);
    const iy = y + rowH / 2, done = t >= at + STYLE.motion.tool * 0.8;
    if (done) icon(ctx, APP.icons.check, L.x + C.icon / 2, iy, C.icon, APP.muted);
    else {
      ctx.save(); ctx.translate(L.x + C.icon / 2, iy); ctx.rotate(((t - at) / C.spin) * M.TAU);
      icon(ctx, APP.icons.loader, 0, 0, C.icon, APP.muted); ctx.restore();
    }
    const lx = L.x + C.icon + C.gap;
    ctx.fillStyle = APP.muted; ctx.font = STYLE.type.sans(C.size);
    ctx.fillText('도구: ', lx, iy);
    const w = ctx.measureText('도구: ').width;
    ctx.font = STYLE.type.sans(C.size, C.bold);
    ctx.fillText(name, lx + w, iy);
    y += rowH;
  });
  ctx.globalAlpha = 1;
}

// 제품명: 앱 헤더의 로고(30px, --primary)와 제품명(16px, 550, 자간 −0.5px)을 같은 비율로 키운다.
function drawBrand(ctx, t, at, out) {
  const B = APP.brand, k = STYLE.layout.brandScale;
  const a = span(t, at, out);
  if (a <= 0) return;
  const logo = B.logo * k, size = B.size * k, gap = B.gap * k;
  ctx.font = STYLE.type.brand(size); ctx.letterSpacing = `${B.tracking * k}px`;
  const tw = ctx.measureText('Constellation').width;
  const x0 = W / 2 - (logo + gap + tw) / 2, cy = H / 2 + (1 - a) * STYLE.motion.rise;
  ctx.globalAlpha = a;
  ctx.save(); ctx.translate(x0, cy - logo / 2); ctx.scale(logo / 32, logo / 32);
  ctx.strokeStyle = APP.primary; ctx.lineWidth = B.line;
  ctx.stroke(new Path2D(APP.icons.logo));
  ctx.fillStyle = APP.primary;
  for (const [x, y, r] of APP.icons.logoDots) { ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = APP.foreground; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText('Constellation', x0 + logo + gap, cy);
  ctx.letterSpacing = '0px'; ctx.globalAlpha = 1;
}
