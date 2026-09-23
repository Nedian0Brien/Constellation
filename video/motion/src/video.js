'use strict';
const M = Motion;
const D = window.DATA;

// ─── Facts ──────────────────────────────────────────────────────────────
// source: 논문 수·좌표·분야 이름·RT-1 인용(참조·피인용)·질문·도구 이름·라벨은 모두 ./data.js
// (build-data.mjs가 피지컬 AI 코퍼스 스냅샷과 실제 에이전트 기록에서 만든다). 코드에 수치를 적지 않는다.
// source: 확대 다이얼의 비율·색은 앱 frontend/src/views/map/ZoomDial.tsx와 index.css `.zoom-*`.

// ─── STYLE — 논문 노드로 이루어진 우주를 탐색한다 ─────────────────────────
// 브리프: 웹 랜딩(소리 없이 재생 가능), "제품이 무엇인지 바로" → 설명 문장 대신 데이터의 사실과
// 제품명만 둔다(사용자 결정). 방향: 논문 노드 우주를 날며 탐색(사용자 결정). 이전 버전의 "앱 화면 같음·
// 밋밋한 움직임"을 풀려고 3D 카메라 비행과 빛을 쓰고, 제품의 흔적은 확대 다이얼(사용자 요청) 하나로 둔다.
const SANS = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const MONO = '"SFMono-Regular", Menlo, Consolas, monospace'; // 앱 --font-mono
const STYLE = {
  palette: {
    background: '#02030a',
    spaceCore: { color: [26, 36, 86], r: 1100, a: 0.5 }, // 화면 가운데 옅은 성운빛
    fieldInk: [240, 244, 255], chipInk: [214, 220, 245], queryBg: 'rgba(8,10,24,0.72)',
    stars: [[124, 172, 255], [255, 146, 196], [164, 132, 255], [96, 222, 206], [255, 196, 120], [150, 232, 150], [255, 128, 128], [206, 214, 255]],
    starOther: [150, 160, 196],
    refs: [110, 210, 255], // 참조 — 앱의 파랑 계열
    cited: [255, 172, 96], // 피인용 — 앱의 빨강 계열을 따뜻하게
    core: [255, 255, 255],
    ink: '#f3f5ff', // 제목·라벨(바탕 대비 18:1)
    muted: 'rgba(214,220,245,0.66)',
    faint: 'rgba(214,220,245,0.30)',
    annot: '#86d9f0', // 앱 --accent: 에이전트 주석 색
    dial: { tick: '#a5a6af', major: '#e8e8ec', needle: '#f2cb8d' }, // 앱 --muted-foreground, --foreground, --warn
  },
  type: {
    title: (s) => `600 ${s}px ${SANS}`,
    label: (s) => `500 ${s}px ${SANS}`,
    body: (s) => `400 ${s}px ${SANS}`,
    mono: (s) => `400 ${s}px ${MONO}`,
  },
  motion: {
    split: 'char', enter: 0.9, exit: 0.6, stagger: 0.035,
    easeIn: M.ease.outCubic, easeOut: M.ease.inOutSine, camEase: M.ease.inOutCubic,
    form: 3.4, formSpread: 1.2, // 흩어진 별이 제자리로 모이는 시간과 퍼짐
    beam: 1.1, beamSpread: 2.2, // 인용선이 뻗는 시간과 거리순 퍼짐
    shutter: 1 / 60, // 모션 블러 길이(초)
    streak: [3, 60], // 이 길이(px) 사이에서만 꼬리를 그린다
    type: 0.045, // 질문 한 글자 입력 간격(초)
    rise: 18,
  },
  materials: ['3D star field (projected points)', 'additive glow', 'motion-blur streaks', 'light beams', 'billboard labels', 'app zoom dial'],
  texture: { vignette: { inner: 0.45, outer: 1.15, strength: 0.75, color: [0, 0, 0] }, grain: { alpha: 0.035, rate: 24, color: [255, 255, 255] }, bloom: 'blur(7px)' },
  sound: {
    chords: [[45, 52, 57, 64, 71], [41, 48, 57, 60, 67], [43, 50, 59, 62, 69], [45, 52, 60, 64, 71]],
    padGain: 0.05, whoosh: 1.3, whooshGain: 0.16, chimeGain: 0.06, hitGain: 0.35, master: 0.9,
    reverb: { seconds: 3.2, mix: 0.32, seed: 7 },
  },
  layout: {
    world: 0.6, // 데이터 좌표(0–10000) → 월드 단위
    fov: 1100,
    star: 7, bigStar: 14, starMin: 0.55, starMax: 6, bloom: 2.2, // 별의 월드 반지름과 화면 픽셀 한계
    scatter: 11000, // 모이기 전 흩어진 구의 반지름
    nebula: 0.55, // 분야 성운 빛의 세기
    beam: 1.6,
    title: 96, titleSub: 26, logo: 120, logoLine: 1.1,
    field: [18, 34], // 분야 이름 크기 범위(px)
    rt1: 26, rt1Sub: 18, count: 20,
    query: { y: 390, w: 1400, h: 84, r: 42, size: 28, line: 1.5 },
    chip: { size: 17, gap: 14, y: 470 },
    annot: { size: 22, dx: 60, dy: -54, line: 1.5, r: 9, left: -900, right: 620 }, // 라벨이 들어갈 가로 범위(다이얼 왼쪽까지)
    shadow: { color: 'rgba(2,3,10,0.9)', blur: 10 }, // 별 위 글자의 가독성
    fieldFade: [560, 700], // 다이얼 쪽으로 가면 분야 이름이 옅어진다
    dial: { x: 800, scale: 2.2, height: 168, pxPerZoom: 48, minor: 0.25, min: -2, max: 8, btn: 16, gap: 4 },
    vignetteOn: true,
  },
};

const DURATION = 30;
// 장면 시각. 화면과 소리가 같이 쓴다.
const T = {
  title: 0.8, titleOut: 4.3,
  form: 0.4,
  fly: 4.6, // 기준 거리(배율 100%)를 재는 시각
  fields: 5.0, fieldsOut: 12.4,
  rt1: 12.4,
  cite: 13.6,
  ask: 18.4,
  tools: 21.6,
  fly2: 22.9, // 에이전트 fly_to
  annot: 23.4,
  askOut: 26.0,
  end: 26.4,
  dialIn: 4.6, dialOut: 26.2,
};

// ── 월드 좌표 ────────────────────────────────────────────────────────────
const W = STYLE.layout.world;
const C = (() => {
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (let i = 0; i < D.n; i++) if (D.x[i] >= 0) { sx += D.x[i]; sy += D.y[i]; sz += D.z[i]; n++; }
  return [sx / n, sy / n, sz / n];
})();
const PX = new Float32Array(D.n), PY = new Float32Array(D.n), PZ = new Float32Array(D.n);
for (let i = 0; i < D.n; i++) {
  PX[i] = (D.x[i] - C[0]) * W; PY[i] = (D.y[i] - C[1]) * W; PZ[i] = (D.z[i] - C[2]) * W;
}
const world = (i) => [PX[i], PY[i], PZ[i]];
const regionAt = (r) => [(r.x - C[0]) * W, (r.y - C[1]) * W, (r.z - C[2]) * W];
// 흩어진 자리: 시드 고정 구 안의 점(모이기 전)
const SX = new Float32Array(D.n), SY = new Float32Array(D.n), SZ = new Float32Array(D.n), DELAY = new Float32Array(D.n);
for (let i = 0; i < D.n; i++) {
  const u = M.hash(i * 4 + 1), v = M.hash(i * 4 + 2), w = M.hash(i * 4 + 3);
  const th = u * M.TAU, ph = Math.acos(2 * v - 1), rr = STYLE.layout.scatter * Math.cbrt(0.15 + 0.85 * w);
  SX[i] = rr * Math.sin(ph) * Math.cos(th); SY[i] = rr * Math.cos(ph); SZ[i] = rr * Math.sin(ph) * Math.sin(th);
  DELAY[i] = M.hash(i * 4 + 4);
}
const BIG = new Set(D.big);
const RT = D.rt1.i;
const RTW = world(RT);
const RL = regionAt(D.regions.find((r) => r.label === 'Robot Learning') ?? D.regions[0]);
const LOC = regionAt(D.regions[0]);
const LAB = D.labels.map((l) => world(l.i));
const LABC = LAB.reduce((a, p) => [a[0] + p[0] / LAB.length, a[1] + p[1] / LAB.length, a[2] + p[2] / LAB.length], [0, 0, 0]);
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

// ── 카메라 경로 ──────────────────────────────────────────────────────────
const PATH = [
  [0, [0, 700, -24000]],
  [T.fly, [0, 300, -9500]],
  [7.6, add(LOC, [-2000, 500, -3400])],
  [10.6, add(RL, [1000, 300, -2800])],
  [13.3, add(RTW, [380, 140, -1250])],
  [17.8, add(RTW, [-800, 420, -2700])],
  [T.fly2, add(RTW, [-600, 320, -2500])],
  [T.annot + 0.4, add(LABC, [260, 220, -2300])],
  [T.end, add(LABC, [300, 260, -2600])],
  [DURATION, [0, 900, -26000]],
];
const TARGET = [
  [0, [0, 0, 0]], [T.fly, [0, 0, 0]], [7.6, LOC], [10.6, RL], [13.3, RTW], [T.fly2, RTW],
  [T.annot + 0.4, LABC], [T.end, LABC], [DURATION, [0, 0, 0]],
];
const cam = M.camera((t) => {
  const p = M.spline(t, PATH);
  const q = M.keys(t, TARGET, STYLE.motion.camEase);
  return { x: p[0], y: p[1], z: p[2], ...M.lookAt(p, q), fov: STYLE.layout.fov };
});
const dist = (t) => {
  const p = M.spline(t, PATH), q = M.keys(t, TARGET, STYLE.motion.camEase);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const HOME = dist(T.fly); // 배율 100%의 거리

// 인용선: 참조(RT-1 → 이웃)와 피인용(이웃 → RT-1). 3D 거리 순서로 뻗는다.
const LINKS = [...D.rt1.refs.map((j) => ({ j, kind: 'ref' })), ...D.rt1.citedBy.map((j) => ({ j, kind: 'cited' }))]
  .map((l) => ({ ...l, d: Math.hypot(PX[l.j] - RTW[0], PY[l.j] - RTW[1], PZ[l.j] - RTW[2]) }))
  .sort((a, b) => a.d - b.d);
LINKS.forEach((l, k) => (l.order = k / Math.max(1, LINKS.length - 1)));

const LOGO = M.path('M6 22 L12 7 L25 13 L18 26 L6 22 Z M12 7 L18 26 M6 22 L25 13');
const LOGO_DOTS = [[6, 22, 2], [12, 7, 2.3], [25, 13, 1.8], [18, 26, 1.6]];
const TOOLS = D.tools;

// ── 소리 ─────────────────────────────────────────────────────────────────
const S = STYLE.sound;
const score = M.audio.synth((ac, A) => {
  const cuts = [0, T.fly, T.cite, T.end, DURATION];
  S.chords.forEach((notes, k) => A.pad({ t0: Math.max(0, cuts[k] - 1), t1: cuts[k + 1] + 1, notes, gain: S.padGain }));
  [T.fly - 0.6, 10.2, T.fly2 - 0.5, T.end - 0.4].forEach((t) => A.whoosh({ t, dur: S.whoosh, gain: S.whooshGain }));
  A.hit({ t: T.title, gain: S.hitGain });
  A.chime({ t: T.rt1 + 0.6, note: 81, gain: S.chimeGain });
  A.chime({ t: T.cite, note: 88, gain: S.chimeGain });
  D.labels.forEach((_, k) => A.chime({ t: T.annot + k * 0.25, note: 84 + k * 3, gain: S.chimeGain * 0.8 }));
  A.hit({ t: T.end + 0.5, gain: S.hitGain * 0.8 });
}, { gain: S.master, reverb: S.reverb });

const film = M.film({
  title: 'Constellation', duration: DURATION, fps: 30, width: 1920, height: 1080,
  background: STYLE.palette.background, style: STYLE,
  fonts: [
    [STYLE.type.title(96), 'Constellation'],
    [STYLE.type.body(26), `논문 ${M.count(D.n, { separator: ',' })}편`],
    [STYLE.type.label(34), D.regions.map((r) => r.label).join(' ') + ' ' + D.rt1.title],
    [STYLE.type.body(30), D.question + D.labels.map((l) => l.label).join(' ') + ' 참조 피인용'],
    [STYLE.type.mono(17), TOOLS.join(' ') + ' 0123456789%'],
  ],
  assets: {}, audio: score, draw,
});

// ── 그리기 ───────────────────────────────────────────────────────────────
const O = {}, O0 = {};
const ramp = (v) => Math.min(1, Math.max(0, v));
const shadow = (ctx, on) => {
  ctx.shadowColor = on ? STYLE.layout.shadow.color : 'transparent';
  ctx.shadowBlur = on ? STYLE.layout.shadow.blur : 0;
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function starPos(i, t) {
  const e = STYLE.motion.easeIn(ramp((t - T.form - DELAY[i] * STYLE.motion.formSpread) / STYLE.motion.form));
  if (e >= 1) return [PX[i], PY[i], PZ[i]];
  // 흩어진 구는 천천히 돈다
  const a = t * 0.05, ca = Math.cos(a), sa = Math.sin(a);
  const sx = SX[i] * ca - SZ[i] * sa, sz = SX[i] * sa + SZ[i] * ca;
  return [sx + (PX[i] - sx) * e, SY[i] + (PY[i] - SY[i]) * e, sz + (PZ[i] - sz) * e];
}

function draw(ctx, t) {
  film.clear();
  const L = STYLE.layout, P = STYLE.palette;
  const s = cam.at(t), s0 = cam.at(t - STYLE.motion.shutter);
  film.glow(0, 0, P.spaceCore.r, P.spaceCore.color, P.spaceCore.a);

  // 인용선이 닿은 이웃
  const lit = new Map();
  for (const l of LINKS) lit.set(l.j, ramp((t - (T.cite + l.order * STYLE.motion.beamSpread)) / STYLE.motion.beam));
  const beamOn = t > T.cite && t < T.end;

  // 분야 성운: 분야 중심에 옅은 빛
  D.regions.forEach((r, k) => {
    const p = regionAt(r);
    const kk = cam.project(s, p[0], p[1], p[2], O);
    if (!kk) return;
    const formed = ramp((t - T.form - STYLE.motion.formSpread) / STYLE.motion.form);
    film.glow(O.x, O.y, Math.sqrt(r.size) * 60 * kk, P.stars[k], L.nebula * 0.25 * formed);
  });

  // 별: 빛 번짐 층과 선명한 층
  const stars = (grow, alphaMul, streaks) => {
    for (let i = 0; i < D.n; i++) {
      if (D.x[i] < 0) continue;
      const w = starPos(i, t);
      const k = cam.project(s, w[0], w[1], w[2], O);
      if (!k) continue;
      const on = lit.get(i) >= 1;
      const base = (BIG.has(i) ? L.bigStar : L.star) * (on && beamOn ? 1.6 : 1);
      const px = Math.min(L.starMax, base * k) * grow;
      if (px < L.starMin * grow * 0.5) continue;
      const c = D.region[i] >= 0 ? P.stars[D.region[i]] : P.starOther;
      const dim = beamOn && !on ? 0.45 : 1;
      const a = Math.min(1, px / 2.2) * dim * alphaMul;
      const w0 = starPos(i, t - STYLE.motion.shutter);
      const k0 = cam.project(s0, w0[0], w0[1], w0[2], O0);
      ctx.strokeStyle = ctx.fillStyle = rgba(c, a);
      const len = k0 ? Math.hypot(O.x - O0.x, O.y - O0.y) : 0;
      if (streaks && len > STYLE.motion.streak[0] && len < STYLE.motion.streak[1]) {
        ctx.lineWidth = Math.max(L.starMin, px);
        ctx.beginPath(); ctx.moveTo(O0.x, O0.y); ctx.lineTo(O.x, O.y); ctx.stroke();
      } else {
        const r = Math.max(L.starMin, px) / 2;
        ctx.fillRect(O.x - r, O.y - r, r * 2, r * 2);
      }
    }
  };
  film.layer(() => stars(L.bloom, 0.55, false), { blend: 'lighter', filter: STYLE.texture.bloom });
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  stars(1, 1, true);

  // 인용 빛줄기
  const rk = cam.project(s, RTW[0], RTW[1], RTW[2], O);
  const rx = O.x, ry = O.y;
  if (beamOn && rk) {
    const fade = 1 - ramp((t - (T.ask + 1.5)) / 1.5) * 0.7;
    for (const l of LINKS) {
      const e = STYLE.motion.easeIn(lit.get(l.j));
      if (e <= 0) continue;
      if (!cam.project(s, PX[l.j], PY[l.j], PZ[l.j], O)) continue;
      const c = l.kind === 'ref' ? P.refs : P.cited;
      const [ax, ay, bx, by] = l.kind === 'ref' ? [rx, ry, O.x, O.y] : [O.x, O.y, rx, ry];
      const ex = ax + (bx - ax) * e, ey = ay + (by - ay) * e;
      const g = ctx.createLinearGradient(ax, ay, ex, ey);
      g.addColorStop(0, rgba(c, 0.06 * fade)); g.addColorStop(1, rgba(c, 0.9 * fade));
      ctx.strokeStyle = g; ctx.lineWidth = L.beam;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // RT-1: 다가가면 빛나고 이름이 붙는다
  const rtOn = M.span(t, T.rt1, T.annot + 0.3, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn, outDur: STYLE.motion.exit, easeOut: STYLE.motion.easeOut });
  if (rk && rtOn > 0) {
    film.glow(rx, ry, 90 + 60 * rtOn, P.core, 0.5 * rtOn);
    ctx.globalAlpha = rtOn;
    shadow(ctx, true);
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rx + 10, ry - 8); ctx.lineTo(rx + 70, ry - 70); ctx.lineTo(rx + 520, ry - 70); ctx.stroke();
    ctx.font = STYLE.type.title(L.rt1); ctx.fillStyle = P.ink;
    const [head, rest] = D.rt1.title.split(':');
    ctx.fillText(`${head} · ${D.rt1.year}`, rx + 78, ry - 82);
    ctx.font = STYLE.type.body(L.rt1Sub); ctx.fillStyle = P.muted;
    ctx.fillText(rest.trim(), rx + 78, ry - 44);
    const n = ramp((t - T.cite) / (STYLE.motion.beam + STYLE.motion.beamSpread));
    if (t > T.cite) {
      ctx.font = STYLE.type.label(L.count);
      ctx.fillStyle = rgba(P.refs, 1); ctx.fillText(`참조 ${Math.round(D.rt1.refs.length * n)}`, rx + 78, ry - 12);
      ctx.fillStyle = rgba(P.cited, 1); ctx.fillText(`피인용 ${Math.round(D.rt1.citedBy.length * n)}`, rx + 190, ry - 12);
    }
    shadow(ctx, false);
    ctx.globalAlpha = 1;
  }

  // 분야 이름: 가까울수록 크고 밝다
  const fieldsOn = M.span(t, T.fields, T.fieldsOut, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn, outDur: STYLE.motion.exit, easeOut: STYLE.motion.easeOut });
  if (fieldsOn > 0) {
    ctx.textAlign = 'center';
    shadow(ctx, true);
    D.regions.forEach((r, k) => {
      const p = regionAt(r);
      const kk = cam.project(s, p[0], p[1], p[2], O);
      if (!kk || Math.abs(O.x) > 1100 || Math.abs(O.y) > 650) return;
      const size = Math.min(L.field[1], Math.max(L.field[0], kk * 90));
      ctx.font = STYLE.type.label(size);
      const F = L.fieldFade, near = 1 - ramp((O.x + ctx.measureText(r.label).width / 2 - F[0]) / (F[1] - F[0]));
      ctx.fillStyle = rgba(P.fieldInk, fieldsOn * Math.min(1, kk * 5) * near);
      ctx.fillText(r.label, O.x, O.y);
    });
    shadow(ctx, false);
    ctx.textAlign = 'left';
  }

  // 질문 → 도구 호출 → 주석 라벨(실제 기록)
  drawAsk(ctx, t, s);

  // 확대 다이얼(앱 ZoomDial 디자인)
  drawDial(ctx, t);

  // 제목(처음과 끝)
  drawTitle(ctx, t, T.title, T.titleOut, true);
  drawTitle(ctx, t, T.end + 0.3, DURATION + 1, false);

  film.vignette(STYLE.texture.vignette);
  film.grain(t, STYLE.texture.grain);
}

function drawTitle(ctx, t, at, out, sub) {
  const L = STYLE.layout, P = STYLE.palette;
  const a = M.span(t, at, out, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn, outDur: STYLE.motion.exit, easeOut: STYLE.motion.easeOut });
  if (a <= 0) return;
  // 로고: 앱 헤더의 별자리 표식이 선으로 그려진다
  ctx.save();
  ctx.translate(-L.logo / 2, -L.logo - 70);
  ctx.scale(L.logo / 32, L.logo / 32);
  M.stroke(ctx, LOGO, { from: 0, to: a, width: L.logoLine * 32 / L.logo * 2, color: P.ink });
  ctx.fillStyle = P.ink;
  LOGO_DOTS.forEach(([x, y, r], k) => {
    const e = ramp(a * 4 - k * 0.6);
    ctx.globalAlpha = e; ctx.beginPath(); ctx.arc(x, y, r * e, 0, M.TAU); ctx.fill();
  });
  ctx.restore();
  ctx.globalAlpha = 1;
  M.text(ctx, M.seg('Constellation', STYLE.type.title(L.title), P.ink, 0), 0, 30, t, {
    split: STYLE.motion.split, align: 'center',
    enter: { at, dur: STYLE.motion.enter, ease: STYLE.motion.easeIn, stagger: STYLE.motion.stagger },
    exit: out < DURATION ? { at: out - STYLE.motion.exit, dur: STYLE.motion.exit, ease: STYLE.motion.easeOut } : undefined,
    transform: (e, x) => ({ alpha: e * (1 - x), dy: (1 - e) * STYLE.motion.rise, blur: (1 - e) * 6 }),
  });
  if (sub) {
    ctx.font = STYLE.type.body(L.titleSub); ctx.fillStyle = P.muted; ctx.textAlign = 'center'; ctx.globalAlpha = a;
    ctx.fillText(`논문 ${M.count(Math.round(D.n * ramp((t - at) / 2.2)), { separator: ',' })}편`, 0, 96);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
}

function drawAsk(ctx, t, s) {
  const L = STYLE.layout, P = STYLE.palette, Q = L.query;
  const a = M.span(t, T.ask, T.askOut, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn, outDur: STYLE.motion.exit, easeOut: STYLE.motion.easeOut });
  if (a <= 0) return;
  ctx.globalAlpha = a;
  const box = M.shape.roundRect({ cx: 0, cy: Q.y + (1 - a) * 20, w: Q.w, h: Q.h, r: Q.r });
  M.fill(ctx, box, P.queryBg);
  M.stroke(ctx, box, { from: 0, to: 1, width: Q.line, color: P.faint });
  const n = Math.max(0, Math.min(D.question.length, Math.floor((t - T.ask - 0.3) / STYLE.motion.type)));
  ctx.font = STYLE.type.body(Q.size); ctx.fillStyle = P.ink; ctx.textBaseline = 'middle';
  let text = D.question.slice(0, n);
  const maxW = Q.w - 120;
  while (ctx.measureText(text).width > maxW) text = text.slice(1);
  if (text !== D.question.slice(0, n)) text = '…' + text;
  ctx.fillText(text, -Q.w / 2 + 44, Q.y + (1 - a) * 20);
  const caret = n < D.question.length && Math.floor(t * 2.5) % 2 === 0;
  if (caret) { const w = ctx.measureText(text).width; ctx.fillRect(-Q.w / 2 + 48 + w, Q.y - Q.size / 2 + 2, 2, Q.size - 4); }
  ctx.textBaseline = 'alphabetic';
  // 도구 호출(기록 순서 그대로)
  ctx.font = STYLE.type.mono(L.chip.size);
  shadow(ctx, true);
  let x = -Q.w / 2 + 44;
  TOOLS.forEach((name, k) => {
    const e = ramp((t - T.tools - k * 0.26) / 0.25);
    if (e <= 0) return;
    ctx.fillStyle = rgba(P.chipInk, 0.8 * e);
    ctx.fillText(name, x, L.chip.y);
    x += ctx.measureText(name).width + L.chip.gap * 2;
    if (k < TOOLS.length - 1) { ctx.fillStyle = P.faint; ctx.fillText('›', x - L.chip.gap * 1.3, L.chip.y); }
  });
  shadow(ctx, false);
  ctx.globalAlpha = 1;
  // 주석 라벨(annotate 결과)
  D.labels.forEach((lab, k) => {
    const e = STYLE.motion.easeIn(ramp((t - T.annot - k * 0.25) / 0.5)) * (1 - ramp((t - T.askOut) / 0.6));
    if (e <= 0) return;
    const w = LAB[k];
    if (!cam.project(s, w[0], w[1], w[2], O)) return;
    const A = L.annot;
    ctx.globalAlpha = e;
    ctx.strokeStyle = P.annot; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(O.x, O.y, A.r, 0, M.TAU); ctx.stroke();
    ctx.font = STYLE.type.label(A.size); ctx.fillStyle = P.ink;
    // 라벨은 오른쪽에 두되, 다이얼과 화면 왼쪽 끝 사이에 들어오게 민다
    const lw = ctx.measureText(lab.label).width;
    const lx = Math.max(A.left, Math.min(O.x + A.dx + 8, A.right - lw)), ly = O.y + A.dy;
    ctx.strokeStyle = P.annot; ctx.lineWidth = A.line; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.lineTo(O.x + A.dx * 0.6, ly); ctx.lineTo(lx - 8, ly); ctx.stroke(); ctx.setLineDash([]);
    shadow(ctx, true);
    ctx.fillText(lab.label, lx, ly + 7);
    shadow(ctx, false);
    ctx.globalAlpha = 1;
  });
}

// 앱 ZoomDial: 세로 눈금자가 배율에 따라 흐르고 가운데 바늘은 고정. 배율 1단계 = 48px,
// 0.25단계마다 작은 눈금, 정수 단계마다 큰 눈금과 % 라벨, 위아래는 옅어진다.
// 영상의 배율 = log2(기준 거리 / 지금 거리) — 카메라가 다가간 만큼 올라간다.
function drawDial(ctx, t) {
  const G = STYLE.layout.dial, P = STYLE.palette.dial;
  const a = M.span(t, T.dialIn, T.dialOut, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn, outDur: STYLE.motion.exit, easeOut: STYLE.motion.easeOut });
  if (a <= 0) return;
  const zoom = Math.min(G.max, Math.max(G.min, Math.log2(HOME / dist(t))));
  const pct = (z) => Math.round(100 * 2 ** z);
  ctx.save();
  ctx.translate(G.x, 0);
  ctx.scale(G.scale, G.scale);
  ctx.globalAlpha = a;
  const H = G.height, half = H / 2 / G.pxPerZoom;
  // 눈금자(위아래 마스크)
  film.layer(() => {
    for (let m = Math.ceil((zoom - half) / G.minor); m <= Math.floor((zoom + half) / G.minor); m++) {
      const z = m * G.minor;
      if (z < G.min - 1e-9 || z > G.max + 1e-9) continue;
      const major = m % 4 === 0, y = -H / 2 + H / 2 - (z - zoom) * G.pxPerZoom;
      ctx.fillStyle = major ? P.major : P.tick;
      ctx.fillRect(24 - 6 - (major ? 14 : 8), y - 0.5, major ? 14 : 8, 1);
      if (major && Math.abs(z - zoom) > 0.12) {
        ctx.font = STYLE.type.mono(9); ctx.fillStyle = P.tick; ctx.textAlign = 'right';
        ctx.fillText(`${pct(z)}%`, 24 - 6 - 18, y + 3);
      }
    }
  }, {
    blend: 'source-over',
    mask: (mk) => {
      const g = mk.createLinearGradient(0, -H / 2, 0, H / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.18, '#000'); g.addColorStop(0.82, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      mk.fillStyle = g; mk.fillRect(-60, -H / 2, 90, H);
    },
  });
  // 바늘과 현재 배율
  ctx.fillStyle = P.needle;
  ctx.fillRect(-24 + 4, -1, 40, 2);
  ctx.font = STYLE.type.mono(10); ctx.textAlign = 'right';
  ctx.fillText(`${pct(zoom)}%`, -24 + 4 - 6, 4);
  // + / − / 되돌리기(앱 map-controls)
  ctx.strokeStyle = P.major; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  const b = G.btn / 2, top = -H / 2 - G.gap - 16, bot = H / 2 + G.gap + 16;
  ctx.beginPath(); ctx.moveTo(-b / 2, top); ctx.lineTo(b / 2, top); ctx.moveTo(0, top - b / 2); ctx.lineTo(0, top + b / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-b / 2, bot); ctx.lineTo(b / 2, bot); ctx.stroke();
  const ry = bot + 44;
  ctx.beginPath(); ctx.arc(0, ry, b / 2, Math.PI * 0.95, Math.PI * 2.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-b / 2 - 1, ry - 4); ctx.lineTo(-b / 2 - 1, ry + 0.5); ctx.lineTo(-b / 2 + 3.5, ry + 0.5); ctx.stroke();
  ctx.textAlign = 'left';
  ctx.restore();
  ctx.globalAlpha = 1;
}
