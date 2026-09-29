'use strict';
const M = Motion;
const A = AppMap; // 앱 연구 지도 코드(frontend/src/views/map). app-map.js
const D = window.DATA;
const MAP = D.map;
const CAP = D.capture; // 앱 화면 캡처의 요소 위치(CSS px). capture/capture.mjs

// ─── Facts ──────────────────────────────────────────────────────────────
// source: 논문·좌표·주제·트리·RT-1 인용 이웃·질문·도구 호출·라벨은 모두 ./data.js
// (build-data.mjs가 피지컬 AI 코퍼스 스냅샷과 실제 에이전트 기록에서 만든다). 코드에 수치를 적지 않는다.
// source: 앱 창의 헤더·사이드바·연도 막대·에이전트 패널은 실행 중인 앱을 찍은 픽셀(assets/, capture.mjs).
// 지도 자리는 앱 지도 코드(app-map.js)로 프레임마다 그린다. 창 모서리 반경과 신호등은 설치된 데스크톱 앱
// 창을 screencapture로 찍어 쟀다(2026-09-24). 아래 APP 값은 실행 중인 앱에서 getComputedStyle로 읽었다.

// ─── 앱 토큰(측정값) ──────────────────────────────────────────────────────
const SANS = '-apple-system, "system-ui", "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'; // --font-sans
const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace'; // --font-mono
const SERIF = 'Georgia, "Times New Roman", "Noto Serif KR", "AppleMyungjo", serif'; // --font-region
const APP = {
  ground: '#0c1118', // .map-wrap --map-ground
  mark: 'rgba(255,255,255,0.16)', // --map-mark: 십자·크롭 마크
  background: '#101113', // --background (앱 창·에이전트 패널 바탕, 캡처에서 확인)
  backgroundClear: 'rgba(16,17,19,0)', // --background의 투명
  foreground: '#e8e8ec', // --foreground
  muted: '#a5a6af', // --muted-foreground
  accent: '#86d9f0', // --accent: 에이전트 주석
  warn: '#f2cb8d', // --warn: 다이얼 바늘
  primary: '#d9d5e8', // --primary: 헤더 로고
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
  icons: {
    plus: ['M5 12h14', 'M12 5v14'], minus: ['M5 12h14'], reset: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
    logo: 'M6 22 12 7l13 6-7 13L6 22Zm6-15 6 19M6 22l19-9', logoDots: [[6, 22, 2], [12, 7, 2.3], [25, 13, 1.8], [18, 26, 1.6]],
  }, // lucide-react(24 뷰박스, 획 2)와 앱 헤더 로고
  window: { radius: 16, capScale: 2 }, // 데스크톱 창 모서리(screencapture 2배 이미지에서 32px), 캡처 배율
  move: 0.28, // MapView move(): 280ms ease-out cubic
  flyPaper: 3.5, // agent/resolve.ts levelOffset.paper
};

// ─── STYLE ──────────────────────────────────────────────────────────────
// 브리프: 웹 랜딩(소리 없이 재생 가능)의 제품 쇼케이스. 영상만 보고 제품을 알아야 한다.
// 사용자 결정: 실제 앱 창 전체를 보여 주고, 두세 단어 헤드라인을 넣는다. 설명 문장은 쓰지 않는다.
// 연출 문법: 어두운 무대에 앱 창 하나가 떠 있고, 장면마다 창이 기울어 돌며 헤드라인 반대편으로 비켜선다.
// 카메라는 창의 부분(지도, 에이전트 패널)으로 밀고 들어간다. 창 안의 지도는 앱 코드로 실제처럼 움직인다.
const deg = Math.PI / 180;
const STYLE = {
  palette: {
    background: '#050608', // 무대
    glow: [118, 108, 186], // 창 뒤 빛(앱 --primary의 보라 계열을 낮춘 색)
    glow2: [60, 110, 150], // 반대편 빛(앱 인용선 파랑 계열)
    headline: '#f4f4f7',
    headlineSoft: 'rgba(244,244,247,0.56)', // 헤드라인 둘째 줄
    shadow: 'rgba(0,0,0,0.62)',
    rim: 'rgba(255,255,255,0.10)', // 창 테두리 빛
    scrim: [5, 6, 8], // 헤드라인이 창 위에 올 때 뒤에 까는 무대색 그러데이션
  },
  type: {
    headline: (s) => `700 ${s}px ${SANS}`,
    brand: (s) => `${APP.brand.weight} ${s}px ${SANS}`,
    region: (s) => `${s}px ${SERIF}`,
    mono: (s) => `${s}px ${MONO}`,
    sans: (s, w = 400) => `${w} ${s}px ${SANS}`,
  },
  motion: {
    enter: 0.9, exit: 0.6, stagger: 0.028,
    easeIn: M.ease.outExpo, easeOut: M.ease.inCubic, move: M.ease.inOutQuart, cam: M.ease.inOutCubic, panel: M.ease.outCubic,
    regionFade: 0.5, // 영역 이름 묶음이 바뀌는 문턱의 교차 페이드 배율 폭
    labelFade: A.LABEL_FADE_MS / 1000,
    rise: 26, blur: 10, // 헤드라인 글자가 올라오며 선명해지는 거리(px)와 흐림
    lineDelay: 0.18, // 헤드라인 둘째 줄이 늦는 시간
  },
  materials: ['floating app window (real app capture + live map)', 'perspective (WebGL quad)', 'soft shadow', 'stage glow', 'kinetic headline'],
  texture: { vignette: { inner: 0.5, outer: 1.2, strength: 0.7, color: [0, 0, 0] }, grain: { alpha: 0.03, rate: 24, color: [255, 255, 255] } },
  sound: {
    chords: [[45, 52, 57, 64, 71], [41, 48, 57, 60, 67], [43, 50, 59, 62, 69], [45, 52, 60, 64, 71]],
    padGain: 0.05, whooshGain: 0.13, chimeGain: 0.05, hitGain: 0.3, master: 0.9, whoosh: 1.1,
    reverb: { seconds: 3.2, mix: 0.3, seed: 7 },
  },
  layout: {
    fov: 30 * deg, // 무대 카메라 화각
    headline: { size: 76, line: 1.12, tracking: -2.4 },
    brandScale: 4.6, // 헤더 로고·제품명(30px·16px)을 같은 비율로 키운다
    shadow: { dy: 70, blur: 70, grow: 1.02 },
    glow: [[-420, -140, 900, 0.22], [380, 120, 1000, 0.28]], // 무대 빛 두 개(x, y, 반지름, 세기)
    scrim: { h3: { from: -960, to: 40, alpha: 0.92 } }, // 헤드라인 뒤 그러데이션(왼쪽 끝 → 투명해지는 x)
    annotPad: 170, // 주석 셋을 담는 지도 카메라의 여백(CSS px)
    annotShift: 160, // 라벨이 점 오른쪽으로 뻗으므로 점들을 이만큼 왼쪽에 둔다(CSS px)
    reveal: 330, // 답이 패널에 채워지는 속도(CSS px/s)
    revealEdge: 28, // 드러나는 경계의 부드러운 폭(CSS px)
    scrollLead: 60, // 드러나는 경계를 패널 아래 끝에서 이만큼 위에 둔다
  },
};

// ─── 헤드라인(초안, 사용자 확인 전) ───────────────────────────────────────
const COPY = {
  h1: ['분야를', '한 장의 지도로'],
  h2: ['논문 하나에서', '인용의 흐름까지'],
  h3: ['물으면,', '에이전트가 찾아 준다'],
};
const HEAD_AT = { h1: [-880, -20], h2: [330, -20], h3: [-880, -250] }; // 헤드라인 왼쪽 위(무대 px)

const DURATION = 30, FPS = 30;
// 장면 시각(초). 화면과 소리가 같이 쓴다.
const T = {
  brand: [0.2, 3.0],
  enter: [2.6, 4.4], // 창이 무대로 들어온다
  pull: [3.6, 9.2], // 지도: RT-1 근접 → 전체 지도
  h1: [3.8, 9.4],
  s2: [9.4, 11.0], // 창이 왼쪽으로 돌며 다가온다
  dive: [10.0, 12.4], // 지도: 전체 → RT-1 주변
  select: 12.0,
  lines: [12.7, 16.2],
  h2: [11.0, 15.9],
  s3: [15.8, 17.2], // 창이 에이전트 패널 쪽으로 다가온다
  panel: [16.3, 16.65], // 패널이 열린다(지도 폭이 준다)
  type: [16.9, 19.1], // 질문을 친다(캡처한 입력 과정)
  send: 19.35,
  answer: 0.25, // 보낸 뒤 답이 드러나기 시작하기까지
  h3: [16.2, 21.0],
  s4: [21.0, 22.6], // 창이 지도로 돌아 주석을 보인다
  end: [24.2, 26.4], // 창이 가운데로 물러나고 지도가 전체로
  finale: 26.0, // 제품명
};
// 답이 채워지는 시각: 사용자 메시지 다음부터 일정한 속도로. fly_to·annotate는 그 도구 행이 드러날 때.
const userPart = CAP.parts.find((p) => p.kind === 'user');
const answerTop = userPart.y + userPart.h;
const revealAt = (y) => T.send + T.answer + Math.max(0, y - answerTop) / STYLE.layout.reveal;
// "RT-1으로 지도를 이동하고…" 문단 바로 아래 도구 행(fly_to·annotate)이 드러나는 순간.
const flyPart = CAP.parts.find((p) => p.kind === 'text' && p.text.includes('이동'));
const nextPart = CAP.parts[CAP.parts.indexOf(flyPart) + 1];
T.fly = revealAt(nextPart.y);
T.annot = T.fly + 0.35;
T.fit = [T.annot + 0.5, T.annot + 1.9];

// ── 앱 지도 모형(프레임과 무관, 한 번) ────────────────────────────────────
const MR = CAP.map, MRC = CAP.mapChat; // 지도 자리: 기본, 패널을 연 뒤
const home = A.homeCamera(MAP, MR.w, MR.h);
const homeChat = A.homeCamera(MAP, MRC.w, MRC.h);
const topCited = (() => {
  const s = [...MAP.cited].sort((a, b) => a - b), cut = s[Math.floor(s.length * A.TOP_CITED_QUANTILE)] ?? Infinity;
  return MAP.cited.map((c) => c >= cut && c > 0);
})();
const typo = A.titleTypography(); // body의 --font-mono와 글자색(video.html head)
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
const alive = new Set(regions.flat().map((n) => n.id));
const blobs = A.regionBlobs(MAP, D.clusters);
const COLOR = MAP.cluster.map((c) => A.clusterColor(c));
const RT = D.rt1.i;
const P = [MAP.x[RT], MAP.y[RT]];
const LINKS = [...D.rt1.refs.map((j) => ({ j, out: true })), ...D.rt1.citedBy.map((j) => ({ j, out: false }))]
  .filter((l) => Number.isFinite(MAP.x[l.j]))
  .map((l) => ({ ...l, len: Math.hypot(MAP.x[l.j] - P[0], MAP.y[l.j] - P[1]) }));

// ── 창 안 지도 카메라(앱과 같은 정사영: target·zoom) ────────────────────────
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const phase = (t, [a, b], ease) => ease(clamp01((t - a) / (b - a)));
function glide(a, b, e) {
  const zoom = a.zoom + (b.zoom - a.zoom) * e;
  const shrink = (2 ** a.zoom * (1 - e)) / 2 ** zoom;
  return { target: [b.target[0] - (b.target[0] - a.target[0]) * shrink, b.target[1] - (b.target[1] - a.target[1]) * shrink], zoom };
}
const cam = (target, zoom) => ({ target, zoom });
const HOME = cam([home.target[0], home.target[1]], home.zoom);
const CLOSE = cam(P, home.zoom + 5.6); // RT-1 논문 제목 단계
const NEAR = cam(P, home.zoom + 2.3); // 인용망 전체가 보이는 하위 분야 단계
const FLY = cam(P, homeChat.zoom + APP.flyPaper);
const FIT = (() => {
  const f = A.fitCamera(D.labels.map((l) => MAP.x[l.i]), D.labels.map((l) => MAP.y[l.i]), MRC.w, MRC.h, STYLE.layout.annotPad, homeChat.zoom - 2, homeChat.zoom + A.ZOOM_RANGE);
  return cam([f.target[0] + STYLE.layout.annotShift / 2 ** f.zoom, f.target[1]], f.zoom);
})();
const END = cam([homeChat.target[0], homeChat.target[1]], homeChat.zoom);
function mapCamAt(t) {
  if (t < T.pull[1]) return glide(CLOSE, HOME, phase(t, T.pull, STYLE.motion.cam));
  if (t < T.dive[0]) return HOME;
  if (t < T.fly) return glide(HOME, NEAR, phase(t, T.dive, STYLE.motion.cam));
  if (t < T.fit[0]) {
    const f = 1 - (1 - clamp01((t - T.fly) / APP.move)) ** 3; // 앱 move(): target·zoom 선형 보간
    return { target: [NEAR.target[0] + (FLY.target[0] - NEAR.target[0]) * f, NEAR.target[1] + (FLY.target[1] - NEAR.target[1]) * f], zoom: NEAR.zoom + (FLY.zoom - NEAR.zoom) * f };
  }
  if (t < T.end[0]) return glide(FLY, FIT, phase(t, T.fit, STYLE.motion.cam));
  return glide(FIT, END, phase(t, T.end, STYLE.motion.cam));
}
// 앱 호버 곡선(MapView hoverT·front): 240ms ease-out, 앞머리는 화면에서 초당 LINK_SPEED px.
function focusAt(t, on, off) {
  if (t < on) return null;
  const fd = STYLE.motion.labelFade, eo = (x) => 1 - (1 - clamp01(x)) ** 3;
  const k = t < off ? eo((t - on) / fd) : 1 - eo((t - off) / fd);
  if (k <= 0) return null;
  let front = 0;
  for (let f = 0; on + f / FPS < Math.min(t, off); f++) front += A.LINK_SPEED / FPS / 2 ** mapCamAt(on + f / FPS).zoom;
  return { t: k, front, fadeWorld: A.LINK_FADE_PX / 2 ** mapCamAt(on).zoom };
}

// ── 무대 위 창의 자리(무대 px, 가운데 원점; 각도는 도) ───────────────────────
// s: z = 0 평면에서 창의 폭(px). 창 좌표는 CSS px(1440×950)를 이 폭에 맞춰 줄인다.
const WIN = CAP.window;
const pose = (x, y, s, rx, ry, rz = 0, z = 0) => ({ x, y, s, rx: rx * deg, ry: ry * deg, rz: rz * deg, z });
const POSES = {
  off: pose(520, 760, 1150, 34, -34, 6),
  p1: pose(250, 36, 1180, 9, -17, 0.6),
  p2: pose(-300, 30, 1500, 7, 19, -0.4),
  // 에이전트 패널(창 오른쪽 27%)을 크게. 왼쪽 지도는 깊이 쪽으로 물러난다.
  p3: pose(-400, 40, 2350, 4, 26, 0),
  p4: pose(100, 60, 2200, 5, -10, 0),
  p5: pose(0, -110, 1000, 12, 0, 0),
};
function lerpPose(a, b, e) {
  const o = {};
  for (const k of Object.keys(a)) o[k] = a[k] + (b[k] - a[k]) * e;
  return o;
}
function poseAt(t) {
  const m = STYLE.motion.move;
  if (t < T.s2[0]) return lerpPose(POSES.off, POSES.p1, phase(t, T.enter, STYLE.motion.cam));
  if (t < T.s3[0]) return lerpPose(POSES.p1, POSES.p2, phase(t, T.s2, m));
  if (t < T.s4[0]) return lerpPose(POSES.p2, POSES.p3, phase(t, T.s3, m));
  if (t < T.end[0]) return lerpPose(POSES.p3, POSES.p4, phase(t, T.s4, m));
  return lerpPose(POSES.p4, POSES.p5, phase(t, T.end, m));
}

// ── 소리 ─────────────────────────────────────────────────────────────────
const S = STYLE.sound;
const score = M.audio.synth((ac, A2) => {
  const cuts = [0, T.s2[0], T.s3[0], T.end[0], DURATION];
  S.chords.forEach((notes, k) => A2.pad({ t0: Math.max(0, cuts[k] - 1), t1: cuts[k + 1] + 1, notes, gain: S.padGain }));
  A2.hit({ t: T.brand[0], gain: S.hitGain });
  [T.enter[0], T.s2[0], T.s3[0], T.s4[0], T.end[0]].forEach((t) => A2.whoosh({ t, dur: S.whoosh, gain: S.whooshGain }));
  A2.chime({ t: T.lines[0], note: 88, gain: S.chimeGain });
  A2.chime({ t: T.send, note: 81, gain: S.chimeGain });
  D.labels.forEach((_, k) => A2.chime({ t: T.annot + k * 0.12, note: 84 + k * 3, gain: S.chimeGain * 0.8 }));
  A2.hit({ t: T.finale + 0.2, gain: S.hitGain * 0.8 });
}, { gain: S.master, reverb: S.reverb });

// 캡처 이미지는 assets.js의 data URI(window.ASSETS)로 읽는다 — file://로 열어도 WebGL에 올릴 수 있다.
const ASSETS = {
  map: window.ASSETS.map, welcome: window.ASSETS.welcome, chat: window.ASSETS.chat, lights: window.ASSETS['traffic-lights'],
  ...Object.fromEntries(CAP.tiles.map((t) => [t.name, window.ASSETS[t.name]])),
  ...Object.fromEntries(CAP.typing.map((t) => [t.name, window.ASSETS[t.name]])),
};
const film = M.film({
  title: 'Constellation', duration: DURATION, fps: FPS, width: 1920, height: 1080,
  background: STYLE.palette.background, style: STYLE,
  copy: Object.values(COPY).flat().join(' ') + ' Constellation',
  fonts: [
    [STYLE.type.headline(STYLE.layout.headline.size), Object.values(COPY).flat().join(' ')],
    [STYLE.type.brand(72), 'Constellation'],
    [STYLE.type.sans(APP.annotation.font, APP.annotation.weight), D.labels.map((l) => l.label).join(' ')],
  ],
  assets: ASSETS, audio: score, draw,
});

// ── 창 그리기(오프스크린, 캡처와 같은 2배 해상도) ─────────────────────────────
const CS = APP.window.capScale;
const winCanvas = document.createElement('canvas');
winCanvas.width = WIN.width * CS; winCanvas.height = WIN.height * CS;
const wctx = winCanvas.getContext('2d');
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const span = (t, a, b) => M.span(t, a, b, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn, outDur: STYLE.motion.exit, easeOut: STYLE.motion.easeOut });
let VW = MR.w, VH = MR.h; // 지금 그리는 지도 자리의 크기(CSS px)

function drawWindow(t) {
  const c = wctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, winCanvas.width, winCanvas.height);
  c.scale(CS, CS);
  // 창 모양(모서리 16px)으로 자르고 앱 바탕을 깐다.
  c.save();
  c.beginPath(); c.roundRect(0, 0, WIN.width, WIN.height, APP.window.radius); c.clip();
  c.fillStyle = APP.background; c.fillRect(0, 0, WIN.width, WIN.height);

  // 패널이 열리는 정도(0~1)와 그때의 지도 자리.
  const open = phase(t, T.panel, STYLE.motion.panel);
  const mw = MR.w + (MRC.w - MR.w) * open;
  // 지도(앱 지도 코드).
  c.save(); c.translate(MR.x, MR.y); c.beginPath(); c.rect(0, 0, mw, MR.h); c.clip();
  VW = mw; VH = MR.h;
  const mcam = mapCamAt(t);
  const mhomeZoom = home.zoom + (homeChat.zoom - home.zoom) * open;
  drawGround(c);
  drawMap(c, t, mcam, mhomeZoom);
  drawAnnotations(c, t, mcam);
  drawCaption(c, mcam.zoom - mhomeZoom);
  drawControls(c, mcam.zoom, mhomeZoom);
  c.restore();

  // 앱 화면(캡처): 지도만 연 화면 → 패널이 오른쪽에서 밀려 들어온 화면 → 대화.
  const img = (n) => film.asset(n);
  const PX = CAP.scroller.x; // 패널 왼쪽 끝(창 CSS px)
  if (open < 1) { c.globalAlpha = 1 - open; c.drawImage(img('map'), 0, 0, WIN.width, WIN.height); c.globalAlpha = 1; }
  if (open > 0) {
    const chrome = t < T.send ? 'welcome' : 'chat';
    // 패널 바깥(사이드바·검색줄·연도 막대)은 교차하고, 패널은 오른쪽에서 밀려 들어온다.
    c.save(); c.beginPath(); c.rect(0, CAP.header.h, PX - 1, WIN.height); c.clip();
    c.globalAlpha = open; c.drawImage(img(chrome), 0, 0, WIN.width, WIN.height); c.restore();
    c.save(); c.translate((1 - open) * (WIN.width - PX + 1), 0);
    c.beginPath(); c.rect(PX - 1, CAP.header.h, WIN.width - PX + 1, WIN.height); c.clip();
    c.drawImage(img(chrome), 0, 0, WIN.width, WIN.height);
    if (t < T.send) drawTyping(c, t); else drawThread(c, t);
    c.restore();
    // 헤더는 두 캡처가 같다.
    c.save(); c.beginPath(); c.rect(0, 0, WIN.width, CAP.header.h); c.clip();
    c.drawImage(img(chrome), 0, 0, WIN.width, WIN.height); c.restore();
  }
  // 데스크톱 창의 신호등(설치된 앱 창에서 찍은 픽셀).
  c.drawImage(img('lights'), 0, 0, img('lights').width / CS, img('lights').height / CS);
  c.restore();
  // 창 테두리 빛.
  c.strokeStyle = STYLE.palette.rim; c.lineWidth = 1;
  c.beginPath(); c.roundRect(0.5, 0.5, WIN.width - 1, WIN.height - 1, APP.window.radius); c.stroke();
}

// 질문 입력: 캡처한 입력 과정에서 지금 글자 수에 맞는 장면을 입력창 자리에 놓는다.
function drawTyping(c, t) {
  if (t < T.type[0]) return;
  const frames = CAP.typing, total = frames[frames.length - 1].n;
  const n = Math.round(total * phase(t, T.type, M.ease.linear));
  let f = frames[0];
  for (const x of frames) if (x.n <= n) f = x;
  // 입력창이 줄이 늘며 자라므로 가장 큰 자리까지 바탕으로 덮고 놓는다.
  const top = Math.min(...frames.map((x) => x.y)), bottom = Math.max(...frames.map((x) => x.y + x.h));
  c.fillStyle = APP.background; c.fillRect(frames[0].x, top, frames[0].w, bottom - top);
  c.drawImage(film.asset(f.name), f.x, f.y, f.w, f.h);
}
// 대화: 사용자 메시지는 보내는 순간, 답은 위에서 아래로 일정한 속도로 드러난다. 넘치면 스크롤을 따라간다.
function drawThread(c, t) {
  const sc = CAP.scroller, L = STYLE.layout, visible = CAP.footer.y - sc.y;
  const reveal = answerTop + Math.max(0, t - T.send - T.answer) * L.reveal;
  const scroll = Math.max(0, Math.min(CAP.content - visible, reveal - visible + L.scrollLead));
  c.save(); c.beginPath(); c.rect(sc.x, sc.y, sc.w, visible); c.clip();
  c.fillStyle = APP.background; c.fillRect(sc.x, sc.y, sc.w, visible);
  for (const tile of CAP.tiles) c.drawImage(film.asset(tile.name), sc.x, sc.y + tile.y - scroll, sc.w, sc.h);
  // 아직 드러나지 않은 부분을 패널 바탕으로 덮는다(경계는 부드럽게).
  const y = sc.y + reveal - scroll;
  const g = c.createLinearGradient(0, y - L.revealEdge, 0, y);
  g.addColorStop(0, APP.backgroundClear); g.addColorStop(1, APP.background);
  c.fillStyle = g; c.fillRect(sc.x, y - L.revealEdge, sc.w, L.revealEdge);
  c.fillStyle = APP.background; c.fillRect(sc.x, y, sc.w, sc.y + visible - y);
  c.restore();
}

// ── 지도 레이어(앱 지도 코드) ─────────────────────────────────────────────
function drawGround(c) {
  c.fillStyle = APP.ground; c.fillRect(0, 0, VW, VH);
  const G = APP.cross, K = APP.crop;
  c.fillStyle = APP.mark;
  const ox = VW / 2 - G.tileW / 2, oy = VH / 2 - G.tileH / 2; // background-position: center
  for (let x = ox - G.tileW * Math.ceil(ox / G.tileW); x < VW; x += G.tileW)
    for (let y = oy - G.tileH * Math.ceil(oy / G.tileH); y < VH; y += G.tileH) {
      const cx = x + G.tileW / 2, cy = y + G.tileH / 2;
      c.fillRect(cx - G.half, cy, G.half * 2, 1);
      c.fillRect(cx, cy - G.half, 1, G.half * 2);
    }
  for (const [x, y, sx, sy] of [[K.inset, K.inset, 1, 1], [VW - K.inset, K.inset, -1, 1], [K.inset, VH - K.inset, 1, -1], [VW - K.inset, VH - K.inset, -1, -1]]) {
    c.fillRect(sx > 0 ? x : x - K.len, sy > 0 ? y : y - 1, K.len, 1);
    c.fillRect(sx > 0 ? x : x - 1, sy > 0 ? y : y - K.len, 1, K.len);
  }
}
const viewport = (cam) => {
  const s = 2 ** cam.zoom;
  return {
    s,
    project: (p) => [(p[0] - cam.target[0]) * s + VW / 2, (p[1] - cam.target[1]) * s + VH / 2],
    unproject: (p) => [(p[0] - VW / 2) / s + cam.target[0], (p[1] - VH / 2) / s + cam.target[1]],
  };
};

function drawMap(c, t, cam, homeZoom) {
  const vp = viewport(cam);
  const rel = cam.zoom - homeZoom;
  const level = A.labelLevel(rel);
  const scale = A.dotScale(rel);
  const rpx = (i) => Math.min(A.DOT_RADIUS_MAX, Math.max(APP.dotMin, scale * (topCited[i] ? A.DOT_RADIUS_TOP : A.DOT_RADIUS)));
  const focus = focusAt(t, T.lines[0], T.lines[1]);
  const hoverT = focus?.t ?? 0;
  const selA = clamp01((t - T.select) / STYLE.motion.labelFade) * (1 - clamp01((t - T.lines[1]) / STYLE.motion.labelFade));

  // 1. 영역 배경(soft-regions).
  for (const b of blobs) {
    const [x, y] = vp.project(b.position), r = b.radius * vp.s;
    if (x + r < 0 || x - r > VW || y + r < 0 || y - r > VH) continue;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, a] of APP.blobStops) g.addColorStop(o, rgba(b.color, a * APP.blobOpacity));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 2. 논문 점(papers).
  const dim = 1 - A.HOVER_DIM * hoverT;
  const pos = new Float32Array(MAP.n * 2);
  const groups = new Map(), rings = new Path2D();
  for (let i = 0; i < MAP.n; i++) {
    if (!Number.isFinite(MAP.x[i])) continue;
    const x = (MAP.x[i] - cam.target[0]) * vp.s + VW / 2, y = (MAP.y[i] - cam.target[1]) * vp.s + VH / 2;
    pos[i * 2] = x; pos[i * 2 + 1] = y;
    if (x < -10 || x > VW + 10 || y < -10 || y > VH + 10) continue;
    const r = rpx(i), sel = i === RT && selA > 0;
    const col = sel ? APP.held : COLOR[i];
    const a = sel ? APP.paperAlpha + (1 - APP.paperAlpha) * selA : APP.paperAlpha;
    const key = `${col}|${a.toFixed(3)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { col, a, path: new Path2D() }));
    g.path.moveTo(x + r, y); g.path.arc(x, y, r, 0, M.TAU);
    if (topCited[i]) { rings.moveTo(x + r, y); rings.arc(x, y, r, 0, M.TAU); }
  }
  c.globalAlpha = dim;
  for (const g of groups.values()) { c.fillStyle = rgba(g.col, g.a); c.fill(g.path); }
  c.lineWidth = 1; c.strokeStyle = rgba(APP.topStroke, APP.topStroke[3]); c.stroke(rings);
  c.globalAlpha = 1;

  // 3. 인용선(hover-links)과 이웃·강조 점(hover-nodes).
  const px = pos[RT * 2], py = pos[RT * 2 + 1];
  if (focus) {
    c.lineWidth = A.LINK_WIDTH; c.lineCap = 'butt';
    for (const l of LINKS) {
      const f = l.len > 0 ? Math.min(1, focus.front / l.len) : 1;
      c.strokeStyle = rgba(l.out ? A.LINK_OUT : A.LINK_IN, hoverT);
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + (pos[l.j * 2] - px) * f, py + (pos[l.j * 2 + 1] - py) * f); c.stroke();
    }
    const node = (i, fill, k) => {
      c.fillStyle = fill; c.beginPath(); c.arc(pos[i * 2], pos[i * 2 + 1], rpx(i), 0, M.TAU); c.fill();
      if (topCited[i]) { c.strokeStyle = rgba(APP.topStroke, APP.topStroke[3] * k); c.lineWidth = 1; c.stroke(); }
    };
    for (const l of LINKS) {
      const k = hoverT * clamp01((focus.front - l.len) / focus.fadeWorld);
      if (k > 0) node(l.j, rgba(COLOR[l.j], APP.paperAlpha * k), k);
    }
    node(RT, rgba(APP.held, hoverT), hoverT);
  }
  // 4. 선택 고리(selected-halo).
  if (selA > 0) {
    c.globalAlpha = selA; c.strokeStyle = rgba(APP.halo, APP.halo[3]); c.lineWidth = 1;
    c.beginPath(); c.arc(px, py, Math.max(A.HALO_MIN, rpx(RT) + A.HALO_GAP), 0, M.TAU); c.stroke();
    c.globalAlpha = 1;
  }

  // 5. 영역 이름(placeRegionLabels) — 문턱 교차 페이드 × 논문 제목이 켜지는 만큼 옅어짐.
  const size = { width: VW, height: VH };
  const regionOpacity = 1 - A.paperLabelOpacity(rel);
  const STEPS = [-Infinity, 1, 2, Infinity];
  const names = [];
  regions.forEach((items, k) => {
    const wgt = clamp01((rel - STEPS[k]) / STYLE.motion.regionFade + 0.5) * clamp01((STEPS[k + 1] - rel) / STYLE.motion.regionFade + 0.5);
    if (wgt <= 0 || regionOpacity <= 0) return;
    const placed = A.placeRegionLabels(items, vp, size, radii, alive, rel);
    for (const n of items) if (placed.has(n.id)) names.push({ label: n.label, at: placed.get(n.id), a: wgt * regionOpacity });
  });
  const cur = STEPS.findIndex((s) => rel < s) - 1;
  const regionless = level === 'topic' && A.placeRegionLabels(regions[cur], vp, size, radii, alive, rel).size === 0 ? 1 : 0;
  const floor = level === 'field' ? Infinity : homeZoom + A.PAPER_LABEL_ZOOM - 0.5;

  // 6. 논문 제목(paper-titles·paper-values).
  if (level !== 'field' || regionless > 0) {
    c.font = `${A.TITLE_FONT_SIZE}px ${typo.fontFamily}`; c.letterSpacing = `${A.TITLE_TRACKING}px`;
    c.textBaseline = 'middle'; c.textAlign = 'left';
    const hx = VW / 2 + A.TITLE_MARGIN_X, hy = VH / 2 + A.TITLE_MARGIN_Y;
    const title = (i, k, alpha) => {
      const x = pos[i * 2], y = pos[i * 2 + 1] + A.TITLE_HEIGHT * reveals.row[k];
      c.fillStyle = rgba(typo.color, alpha); c.fillText(metrics.displays[i], x + A.TITLE_OFFSET_X, y);
      c.fillStyle = rgba(COLOR[i], alpha); c.fillText(metrics.values[i], x + metrics.valueDx[i], y);
    };
    boxes.forEach((b, k) => {
      if (b.i === RT) return;
      if (Math.abs(pos[b.i * 2] - VW / 2) > hx || Math.abs(pos[b.i * 2 + 1] - VH / 2) > hy) return;
      const a = A.paperTitleOpacity(cam.zoom, reveals.zoom[k], floor, regionless) * dim;
      if (a > 0) title(b.i, k, a);
    });
    const a = Math.max(hoverT, selA * A.paperTitleOpacity(cam.zoom, -Infinity, floor, regionless), A.paperTitleOpacity(cam.zoom, reveals.zoom[boxOf[RT]], floor, regionless));
    if (a > 0) title(RT, boxOf[RT], a);
    c.letterSpacing = '0px';
  }
  drawRegionNames(c, names);
}

// .region-name: Georgia 20px/23px, 최대 폭 205px, 가운데 정렬, 바탕색 그림자 두 겹.
function drawRegionNames(c, names) {
  const F = APP.regionFont, dev = c.getTransform().a;
  c.font = STYLE.type.region(F.size); c.textAlign = 'center'; c.textBaseline = 'middle';
  const m = (s) => c.measureText(s).width;
  for (const n of names) {
    if (n.a <= 0) continue;
    const lines = A.wrapTitle(m, n.label, F.maxWidth - F.pad * 2);
    const y0 = n.at[1] - ((lines.length - 1) * F.line) / 2;
    c.globalAlpha = n.a;
    // CSS text-shadow는 그림자만 글자 아래에 깐다: 글자는 화면 밖에 그리고 그림자만 제자리로 끌어온다.
    for (const [dx, dy, blur] of F.shadows) {
      c.shadowColor = APP.background; c.shadowBlur = blur * dev;
      c.shadowOffsetX = 10000 * dev + dx * dev; c.shadowOffsetY = dy * dev;
      c.fillStyle = APP.background;
      lines.forEach((l, k) => c.fillText(l, n.at[0] - 10000, y0 + k * F.line));
    }
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
    c.fillStyle = APP.foreground;
    lines.forEach((l, k) => c.fillText(l, n.at[0], y0 + k * F.line));
  }
  c.globalAlpha = 1; c.textAlign = 'left';
}

// 에이전트 주석(.map-annotation).
function drawAnnotations(c, t, cam) {
  const N = APP.annotation;
  if (t < T.annot) return;
  const a = (1 - (1 - clamp01((t - T.annot) / STYLE.motion.labelFade)) ** 3) * (1 - clamp01((t - T.end[0]) / STYLE.motion.exit));
  if (a <= 0) return;
  const vp = viewport(cam);
  for (const l of D.labels) {
    const [px, py] = vp.project([MAP.x[l.i], MAP.y[l.i]]);
    const dx = px > VW - N.edge[0] ? -N.d : N.d, dy = py < N.edge[1] ? N.d : -N.d;
    const lx = px + dx, ly = py + dy;
    c.globalAlpha = a;
    c.strokeStyle = APP.accent; c.lineWidth = N.line; c.setLineDash(N.dash);
    c.beginPath(); c.moveTo(px, py); c.lineTo(lx, ly); c.stroke(); c.setLineDash([]);
    c.lineWidth = N.ring; c.beginPath(); c.arc(px, py, N.r, 0, M.TAU); c.stroke();
    c.font = STYLE.type.sans(N.font, N.weight); c.textBaseline = 'middle'; c.textAlign = dx > 0 ? 'left' : 'right';
    const tx = lx + (dx > 0 ? N.textGap : -N.textGap);
    c.lineJoin = 'round'; c.lineWidth = N.stroke; c.strokeStyle = APP.background;
    c.strokeText(l.label, tx, ly);
    c.fillStyle = APP.foreground; c.fillText(l.label, tx, ly);
  }
  c.globalAlpha = 1; c.textAlign = 'left';
}

// .map-caption.
function drawCaption(c, rel) {
  const K = APP.caption;
  const level = A.labelLevel(rel);
  const eyebrow = level === 'field' ? '상위 분야' : level === 'topic' ? '하위 분야' : '논문 제목';
  const parts = [[eyebrow, K.eyebrow], [`${D.clusters.length}개 주제 · ${MAP.n.toLocaleString('en-US')}편`, K.rest]];
  c.fillStyle = APP.muted; c.textBaseline = 'middle'; c.textAlign = 'left';
  let x = K.x;
  for (const [text, [size, ls]] of parts) {
    c.font = STYLE.type.mono(size); c.letterSpacing = `${ls}px`;
    c.fillText(text, x, K.y + 7);
    x += c.measureText(text).width + K.gap;
  }
  c.letterSpacing = '0px';
}

// 확대 컨트롤(.map-controls)과 다이얼(ZoomDial.tsx).
function icon(c, paths, x, y, size, color) {
  c.save(); c.translate(x - size / 2, y - size / 2); c.scale(size / 24, size / 24);
  c.strokeStyle = color; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const d of paths) c.stroke(new Path2D(d));
  c.restore();
}
function drawControls(c, zoom, homeZoom) {
  const K = APP.controls, G = APP.dial;
  const x0 = VW - K.right - K.width, cx = x0 + K.width / 2;
  const total = K.button * 2 + K.gap * 2 + G.height;
  const top = VH / 2 - total / 2, dialTop = top + K.button + K.gap;
  const pct = (z) => Math.round(100 * 2 ** (z - homeZoom));
  const min = homeZoom + G.min, max = homeZoom + A.ZOOM_RANGE;
  zoom = Math.min(max, Math.max(min, zoom));
  const half = G.height / 2 / G.pxPerZoom;
  const mask = (y) => { const v = (y - dialTop) / G.height; return v < G.mask ? v / G.mask : v > 1 - G.mask ? (1 - v) / G.mask : 1; };
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let m = Math.ceil((zoom - half - homeZoom) / G.minor); m <= Math.floor((zoom + half - homeZoom) / G.minor); m++) {
    const z = homeZoom + m * G.minor;
    if (z < min - 1e-9 || z > max + 1e-9) continue;
    const major = m % 4 === 0, y = dialTop + G.height / 2 - (z - zoom) * G.pxPerZoom;
    c.globalAlpha = clamp01(mask(y));
    const w = major ? G.tick[2] : G.tick[1];
    c.fillStyle = major ? APP.foreground : APP.muted;
    c.fillRect(x0 + K.width - G.tick[0] - w, y - 0.5, w, 1);
    if (major && Math.abs(z - zoom) > G.hide) {
      c.font = STYLE.type.mono(G.label[1]); c.letterSpacing = `${G.label[2]}px`; c.fillStyle = APP.muted;
      c.fillText(`${pct(z)}%`, x0 + K.width - G.tick[0] - G.label[0], y);
    }
  }
  c.globalAlpha = 1;
  const cy = dialTop + G.height / 2;
  c.fillStyle = APP.warn;
  c.fillRect(x0 + G.needle[0], cy - 1, K.width - G.needle[0] * 2, 2);
  c.font = STYLE.type.mono(G.needle[1]); c.letterSpacing = `${G.needle[2]}px`;
  c.fillText(`${pct(zoom)}%`, x0 + G.needle[0] - G.needle[3], cy);
  c.letterSpacing = '0px'; c.textAlign = 'left';
  icon(c, APP.icons.plus, cx, top + K.button / 2, K.icon, APP.foreground);
  icon(c, APP.icons.minus, cx, top + total - K.button / 2, K.icon, APP.foreground);
  icon(c, APP.icons.reset, VW - K.resetRight - K.button / 2, top + total + K.resetGap + K.button / 2, K.icon, APP.foreground);
}

// ── 무대: 창을 원근으로 놓는다(WebGL 사각형 하나, 밉맵) ─────────────────────
const GLC = document.createElement('canvas');
const gl = GLC.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true, alpha: true });
if (!gl) throw new Error('WebGL2를 쓸 수 없다');
const prog = (() => {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, `#version 300 es
    in vec2 a_uv; uniform mat4 u_mvp; uniform vec2 u_size; out vec2 v_uv;
    void main() { v_uv = a_uv; gl_Position = u_mvp * vec4((a_uv.x - 0.5) * u_size.x, (0.5 - a_uv.y) * u_size.y, 0.0, 1.0); }`));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float; in vec2 v_uv; uniform sampler2D u_tex; uniform float u_alpha; out vec4 o;
    void main() { o = texture(u_tex, v_uv) * u_alpha; }`));
  gl.linkProgram(p);
  return p;
})();
const tex = gl.createTexture();
(() => {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_uv');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
})();

// 4×4 행렬(열 우선). 무대 단위는 z = 0 평면에서 화면 px.
const mul = (a, b) => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
const ident = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const trans = (x, y, z) => { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; };
const rotX = (a) => { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
const rotY = (a) => { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
const rotZ = (a) => { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
const scaleM = (k) => { const m = ident(); m[0] = k; m[5] = k; m[10] = k; return m; };
const STAGE = { w: 1920, h: 1080 };
const DIST = STAGE.h / 2 / Math.tan(STYLE.layout.fov / 2); // 이 거리에서 z = 0 평면이 1 단위 = 1 px
const PERSP = (() => {
  const f = 1 / Math.tan(STYLE.layout.fov / 2), aspect = STAGE.w / STAGE.h, n = 10, far = DIST * 10;
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + n) / (n - far); m[11] = -1; m[14] = (2 * far * n) / (n - far);
  return m;
})();
// 창 자리 → MVP. y는 무대(아래 +)와 GL(위 +)이 반대다.
function mvpOf(p) {
  const k = p.s / WIN.width;
  const model = mul(trans(p.x, -p.y, p.z), mul(rotY(p.ry), mul(rotX(p.rx), mul(rotZ(p.rz), scaleM(k)))));
  return mul(PERSP, mul(trans(0, 0, -DIST), model));
}
// 창 좌표(CSS px, 왼쪽 위 원점) → 무대 px(가운데 원점).
function projectWin(mvp, u, v) {
  const x = u - WIN.width / 2, y = WIN.height / 2 - v;
  const cx = mvp[0] * x + mvp[4] * y + mvp[12], cy = mvp[1] * x + mvp[5] * y + mvp[13], cw = mvp[3] * x + mvp[7] * y + mvp[15];
  return [(cx / cw) * STAGE.w / 2, -(cy / cw) * STAGE.h / 2];
}

// ── 한 프레임 ─────────────────────────────────────────────────────────────
function draw(ctx, t) {
  film.clear();
  const P0 = STYLE.palette, L = STYLE.layout;
  const [g1, g2] = L.glow;
  film.glow(g1[0], g1[1], g1[2], P0.glow2, g1[3]);
  film.glow(g2[0], g2[1], g2[2], P0.glow, g2[3]);

  const winA = span(t, T.enter[0], DURATION + 1);
  if (winA > 0) {
    const p = poseAt(t), mvp = mvpOf(p);
    drawWindow(t);
    // 그림자: 창 네 모서리를 투영한 사각형을 아래로 내려 흐리게.
    const q = [[0, 0], [WIN.width, 0], [WIN.width, WIN.height], [0, WIN.height]].map(([u, v]) => projectWin(mvp, u, v));
    ctx.save(); ctx.filter = `blur(${L.shadow.blur}px)`; ctx.fillStyle = P0.shadow; ctx.globalAlpha = winA;
    ctx.beginPath(); q.forEach(([x, y], i) => (i ? ctx.lineTo(x * L.shadow.grow, y + L.shadow.dy) : ctx.moveTo(x * L.shadow.grow, y + L.shadow.dy))); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 창(원근).
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (GLC.width !== cw || GLC.height !== ch) { GLC.width = cw; GLC.height = ch; }
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, winCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'u_mvp'), false, mvp);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_size'), WIN.width, WIN.height);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_alpha'), winA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(GLC, 0, 0); ctx.restore();
  }

  // 창 위에 오는 헤드라인은 뒤에 무대색 그러데이션을 깐다.
  for (const [k, sc] of Object.entries(L.scrim)) {
    const a = span(t, T[k][0] - 0.2, T[k][1] + 0.2) * sc.alpha;
    if (a <= 0) continue;
    const g = ctx.createLinearGradient(sc.from, 0, sc.to, 0);
    g.addColorStop(0, rgba(P0.scrim, a)); g.addColorStop(0.55, rgba(P0.scrim, a * 0.75)); g.addColorStop(1, rgba(P0.scrim, 0));
    ctx.fillStyle = g; ctx.fillRect(-STAGE.w / 2, -STAGE.h / 2, sc.to + STAGE.w / 2, STAGE.h);
  }
  for (const k of Object.keys(COPY)) headline(ctx, t, COPY[k], T[k], HEAD_AT[k][0], HEAD_AT[k][1]);
  // 제품명: 여는 장면(무대 가운데)과 닫는 장면(창 아래).
  brand(ctx, t, T.brand, 0, 0, 1);
  brand(ctx, t, [T.finale, DURATION + 1], 0, 380, 0.62);

  film.vignette(STYLE.texture.vignette);
  film.grain(t, STYLE.texture.grain);
}

// 두 줄 헤드라인: 글자가 흐림에서 선명하게 올라온다. 둘째 줄은 조금 늦게, 옅게.
function headline(ctx, t, lines, [a, b], x, y) {
  if (t < a - 0.1 || t > b + STYLE.motion.exit + 0.1) return;
  const L = STYLE.layout.headline, P0 = STYLE.palette;
  lines.forEach((line, k) => {
    M.text(ctx, M.seg(line, STYLE.type.headline(L.size), k === 0 ? P0.headline : P0.headlineSoft, L.tracking), x, y + k * L.size * L.line, t, {
      split: 'char', align: 'left',
      enter: { at: a + k * STYLE.motion.lineDelay, dur: STYLE.motion.enter, ease: STYLE.motion.easeIn, stagger: STYLE.motion.stagger },
      exit: { at: b, dur: STYLE.motion.exit, ease: STYLE.motion.easeOut },
      transform: (e, xo) => ({ alpha: e * (1 - xo), dy: (1 - e) * STYLE.motion.rise - xo * STYLE.motion.rise * 0.5, blur: (1 - e + xo) * STYLE.motion.blur }),
    });
  });
}

// 제품명: 앱 헤더의 로고(30px, --primary)와 제품명(16px, 550, 자간 −0.5px)을 같은 비율로 키운다.
function brand(ctx, t, [at, out], cx, cy, scale) {
  const B = APP.brand, k = STYLE.layout.brandScale * scale;
  const a = span(t, at, out);
  if (a <= 0) return;
  const logo = B.logo * k, size = B.size * k, gap = B.gap * k;
  ctx.font = STYLE.type.brand(size); ctx.letterSpacing = `${B.tracking * k}px`;
  const tw = ctx.measureText('Constellation').width;
  const x0 = cx - (logo + gap + tw) / 2, y = cy + (1 - a) * STYLE.motion.rise;
  ctx.globalAlpha = a;
  ctx.save(); ctx.translate(x0, y - logo / 2); ctx.scale(logo / 32, logo / 32);
  ctx.strokeStyle = APP.primary; ctx.lineWidth = B.line;
  ctx.stroke(new Path2D(APP.icons.logo));
  ctx.fillStyle = APP.primary;
  for (const [px, py, r] of APP.icons.logoDots) { ctx.beginPath(); ctx.arc(px, py, r, 0, M.TAU); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = APP.foreground; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText('Constellation', x0 + logo + gap, y);
  ctx.letterSpacing = '0px'; ctx.globalAlpha = 1;
}
