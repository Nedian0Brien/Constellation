'use strict';
const M = Motion;
// ─── Facts ──────────────────────────────────────────────────────────────
// source: 편수·인용 수·제목은 ../data.js(피지컬 AI 코퍼스 스냅샷, build-data.mjs)에서 읽는다.

// ─── STYLE — 방향 c: 깔끔하고 제품적인 지면 ─────────────────────────────
// 브리프: 톤 "깔끔·제품적", 웹 랜딩 상단 → 밝은 지면에 큰 문구와 수치 카드로 "무엇을 하는 제품인가"를
// 바로 읽히게 한다. 앱의 어두운 화면을 쓰지 않아 "앱 화면 같음"에서 벗어난다.
const STYLE = {
  palette: {
    background: '#f4f2ee',
    ink: '#121316',           // 본문(대비 17:1)
    muted: '#6b6f78',         // 보조(대비 5.2:1)
    card: '#ffffff',
    line: 'rgba(18,19,22,0.08)',
    dot: [[92, 120, 190], [140, 110, 190], [200, 110, 150], [210, 150, 80], [90, 160, 130], [80, 150, 170], [190, 170, 90], [150, 150, 160]],
    other: [175, 175, 182],
    refs: '#2f5bd8',          // 참조
    cited: '#e2572b',         // 피인용
    shadow: 'rgba(18,19,22,0.10)',
  },
  type: {
    head: (s) => `700 ${s}px "Noto Sans KR", sans-serif`,
    body: (s) => `400 ${s}px "Noto Sans KR", sans-serif`,
    num: (s) => `700 ${s}px "Noto Sans KR", sans-serif`,
    label: (s) => `500 ${s}px "Noto Sans KR", sans-serif`,
  },
  motion: {
    split: 'word', enter: 0.7, exit: 0.4, stagger: 0.09,
    easeIn: M.ease.outQuart, easeOut: M.ease.inQuad,
    lineDur: 1.4, lineSpread: 1.3, rise: 28,
  },
  materials: ['flat shapes', 'rounded cards', 'counters'],
  texture: null,
  sound: null,
  layout: { left: -840, card: { cx: 400, cy: 0, w: 1000, h: 860, r: 28 }, stat: { w: 250, h: 132, r: 20, gap: 24 }, dot: 2.2, bigDot: 3.6, line: 1.3, focusR: 7 },
};

const T = { cite: 13.6 };
const HEAD = ['무엇을 인용했고,', '누가 인용했는지'];
const film = M.film({
  title: 'Constellation — c', duration: 20, fps: 30, width: 1920, height: 1080,
  background: STYLE.palette.background, style: STYLE,
  fonts: [[STYLE.type.head(72), HEAD.join(' ')], [STYLE.type.body(26), '논문 한 편의 인용 관계를 지도 위에서 본다'], [STYLE.type.num(56), '0123456789'], [STYLE.type.label(20), `참조 피인용 RT-1 ${D.rt1.title}`]],
  assets: {}, audio: null, draw,
});
const C = STYLE.layout.card;
const MAP = fitMap({ cx: C.cx, cy: C.cy, w: C.w - 80, h: C.h - 80 });
const LINKS = citeLinks(MAP.X, MAP.Y);
const BIG = new Set(D.big);

function draw(ctx, t) {
  film.clear();
  const L = STYLE.layout, P = STYLE.palette, r = D.rt1.i;
  // 카드
  ctx.save();
  ctx.shadowColor = P.shadow; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  M.fill(ctx, M.shape.roundRect({ cx: C.cx, cy: C.cy, w: C.w, h: C.h, r: C.r }), P.card);
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(C.cx - C.w / 2, C.cy - C.h / 2, C.w, C.h, C.r); ctx.clip();
  const lit = new Map();
  for (const l of LINKS) lit.set(l.j, clamp01((t - (T.cite + l.order * STYLE.motion.lineSpread)) / STYLE.motion.lineDur));
  for (let i = 0; i < D.n; i++) {
    if (D.x[i] < 0) continue;
    const c = D.region[i] >= 0 ? P.dot[D.region[i]] : P.other;
    const on = lit.get(i) >= 1;
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${on ? 1 : t > T.cite ? 0.28 : 0.6})`;
    const s = BIG.has(i) ? L.bigDot : L.dot;
    ctx.beginPath(); ctx.arc(MAP.X[i], MAP.Y[i], s / 2, 0, M.TAU); ctx.fill();
  }
  const rx = MAP.X[r], ry = MAP.Y[r];
  for (const l of LINKS) {
    const e = STYLE.motion.easeIn(lit.get(l.j));
    if (e <= 0) continue;
    const jx = MAP.X[l.j], jy = MAP.Y[l.j];
    ctx.strokeStyle = l.kind === 'ref' ? P.refs : P.cited; ctx.globalAlpha = 0.75; ctx.lineWidth = L.line;
    ctx.beginPath();
    if (l.kind === 'ref') { ctx.moveTo(rx, ry); ctx.lineTo(rx + (jx - rx) * e, ry + (jy - ry) * e); }
    else { ctx.moveTo(jx, jy); ctx.lineTo(jx + (rx - jx) * e, jy + (ry - jy) * e); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(rx, ry, L.focusR, 0, M.TAU); ctx.fill();
  ctx.strokeStyle = P.card; ctx.lineWidth = 2; ctx.stroke();
  // RT-1 이름표
  const tag = M.span(t, T.cite - 0.8, null, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn });
  ctx.globalAlpha = tag;
  const label = `RT-1 · ${D.rt1.year}`;
  ctx.font = STYLE.type.label(20); const w = ctx.measureText(label).width + 28;
  M.fill(ctx, M.shape.roundRect({ cx: rx + 20 + w / 2, cy: ry - 34 + (1 - tag) * 10, w, h: 40, r: 20 }), P.ink);
  ctx.fillStyle = P.card; ctx.fillText(label, rx + 34, ry - 27 + (1 - tag) * 10);
  ctx.globalAlpha = 1;
  ctx.restore();
  // 왼쪽 문구
  HEAD.forEach((line, k) => M.text(ctx, M.seg(line, STYLE.type.head(72), P.ink, 0), L.left, -150 + k * 92, t, {
    split: STYLE.motion.split,
    enter: { at: T.cite - 1.2 + k * 0.25, dur: STYLE.motion.enter, ease: STYLE.motion.easeIn, stagger: STYLE.motion.stagger },
    transform: (e) => ({ alpha: e, dy: (1 - e) * STYLE.motion.rise }),
  }));
  ctx.font = STYLE.type.body(26); ctx.fillStyle = P.muted;
  ctx.globalAlpha = M.span(t, T.cite - 0.6, null, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn });
  ctx.fillText('논문 한 편의 인용 관계를 지도 위에서 본다', L.left, 60);
  ctx.globalAlpha = 1;
  // 수치 카드
  const p = clamp01((t - T.cite) / (STYLE.motion.lineDur + STYLE.motion.lineSpread));
  [['참조', D.rt1.refs.length, P.refs], ['피인용', D.rt1.citedBy.length, P.cited]].forEach(([name, n, color], k) => {
    const e = M.span(t, T.cite - 0.2 + k * 0.15, null, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn });
    const x = L.left + k * (L.stat.w + L.stat.gap), y = 170 + (1 - e) * STYLE.motion.rise;
    ctx.globalAlpha = e;
    M.fill(ctx, M.shape.roundRect({ cx: x + L.stat.w / 2, cy: y + L.stat.h / 2, w: L.stat.w, h: L.stat.h, r: L.stat.r }), P.card);
    ctx.fillStyle = color; ctx.fillRect(x + 24, y + 26, 12, 12);
    ctx.font = STYLE.type.label(20); ctx.fillStyle = P.muted; ctx.fillText(name, x + 46, y + 38);
    ctx.font = STYLE.type.num(56); ctx.fillStyle = P.ink; ctx.fillText(String(Math.round(n * p)), x + 24, y + 104);
    ctx.globalAlpha = 1;
  });
}
