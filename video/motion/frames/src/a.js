'use strict';
const M = Motion;
// ─── Facts ──────────────────────────────────────────────────────────────
// source: 편수·인용 수·제목은 ../data.js(피지컬 AI 코퍼스 스냅샷, build-data.mjs)에서 읽는다.

// ─── STYLE — 방향 a: 고요하고 정밀한 도판 ───────────────────────────────
// 브리프: 웹 랜딩(소리 없이 재생 가능) → 자막만으로 읽혀야 한다. 톤 "고요·정밀" → 천문 도판처럼
// 색을 줄이고 가는 선과 주석으로 정밀함을 낸다. 이전 버전의 "앱 화면 같음"을 피하려고 UI 요소를 두지 않는다.
const STYLE = {
  palette: {
    background: '#0a0e13',
    ink: '#ece5d6',          // 종이빛 흰색 — 본문(대비 15:1)
    dim: '#8a929d',          // 주석(대비 6.1:1)
    dot: 'rgba(236,229,214,0.55)',
    dotFaint: 'rgba(236,229,214,0.13)',
    rule: 'rgba(236,229,214,0.20)',
    refs: '#d6b06a',         // 참조 — 금색
    cited: '#a9bfd6',        // 피인용 — 은청색
    focus: '#fff6e2',
  },
  type: {
    caption: (s) => `500 ${s}px "Noto Serif KR", serif`,
    title: (s) => `700 ${s}px "Noto Serif KR", serif`,
    mono: (s) => `400 ${s}px "IBM Plex Mono", monospace`,
  },
  motion: {
    split: 'line', enter: 1.6, exit: 0.8, stagger: 0.35,
    easeIn: M.ease.inOutSine, easeOut: M.ease.inOutSine,
    lineDur: 2.6, lineSpread: 1.4, rise: 14,
  },
  materials: ['hairline strokes', 'graticule ticks', 'monochrome points'],
  texture: { grain: { alpha: 0.05, rate: 12, color: [236, 229, 214] }, vignette: { inner: 0.5, outer: 1.2, strength: 0.55, color: [4, 6, 9] } },
  sound: null,
  layout: { margin: 132, column: 560, mapBox: { cx: 300, cy: 20, w: 1180, h: 900 }, dot: 1.3, bigDot: 2.4, hair: 0.7, focusR: 6 },
};

const T = { cite: 13.4 };
const CAPTION = '무엇을 인용했고, 누가 인용했는지';
const film = M.film({
  title: 'Constellation — a', duration: 20, fps: 30, width: 1920, height: 1080,
  background: STYLE.palette.background, style: STYLE,
  fonts: [[STYLE.type.caption(52), CAPTION], [STYLE.type.title(20), D.rt1.title], [STYLE.type.mono(15), 'FIG. 04 — CITATIONS 참조 피인용 0123456789']],
  assets: {}, audio: null, draw,
});
const MAP = fitMap(STYLE.layout.mapBox);
const LINKS = citeLinks(MAP.X, MAP.Y);
const BIG = new Set(D.big);

function draw(ctx, t) {
  film.clear();
  const L = STYLE.layout, P = STYLE.palette, r = D.rt1.i;
  const rx = MAP.X[r], ry = MAP.Y[r];
  // 경위선 눈금: 지도 상자 가장자리의 가는 눈금
  ctx.strokeStyle = P.rule; ctx.lineWidth = L.hair;
  const bx = L.mapBox;
  for (let k = 0; k <= 12; k++) {
    const x = bx.cx - bx.w / 2 + (bx.w * k) / 12, y = bx.cy - bx.h / 2 + (bx.h * k) / 12;
    ctx.beginPath(); ctx.moveTo(x, bx.cy - bx.h / 2); ctx.lineTo(x, bx.cy - bx.h / 2 + (k % 3 ? 6 : 14)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx.cx - bx.w / 2, y); ctx.lineTo(bx.cx - bx.w / 2 + (k % 3 ? 6 : 14), y); ctx.stroke();
  }
  // 논문 점: 인용선이 닿은 이웃은 밝게
  const lit = new Map();
  for (const l of LINKS) {
    const e = clamp01((t - (T.cite + l.order * STYLE.motion.lineSpread)) / STYLE.motion.lineDur);
    lit.set(l.j, e);
  }
  for (let i = 0; i < D.n; i++) {
    if (D.x[i] < 0) continue;
    const s = BIG.has(i) ? L.bigDot : L.dot;
    ctx.fillStyle = lit.has(i) && lit.get(i) >= 1 ? P.ink : lit.size && t > T.cite ? P.dotFaint : P.dot;
    ctx.fillRect(MAP.X[i] - s / 2, MAP.Y[i] - s / 2, s, s);
  }
  // 인용선: 참조는 RT-1에서 나가고, 피인용은 이웃에서 RT-1로 들어온다
  for (const l of LINKS) {
    const e = STYLE.motion.easeIn(lit.get(l.j));
    if (e <= 0) continue;
    const [jx, jy] = [MAP.X[l.j], MAP.Y[l.j]];
    ctx.strokeStyle = l.kind === 'ref' ? P.refs : P.cited; ctx.lineWidth = L.hair;
    ctx.beginPath();
    if (l.kind === 'ref') { ctx.moveTo(rx, ry); ctx.lineTo(rx + (jx - rx) * e, ry + (jy - ry) * e); }
    else { ctx.moveTo(jx, jy); ctx.lineTo(jx + (rx - jx) * e, jy + (ry - jy) * e); }
    ctx.stroke();
  }
  // RT-1
  ctx.strokeStyle = P.focus; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(rx, ry, L.focusR, 0, M.TAU); ctx.stroke();
  ctx.fillStyle = P.focus; ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
  // 주석 선과 제목
  const a = M.span(t, T.cite - 1.2, null, { inDur: STYLE.motion.enter, easeIn: STYLE.motion.easeIn });
  ctx.globalAlpha = a;
  ctx.strokeStyle = P.dim; ctx.lineWidth = L.hair;
  ctx.beginPath(); ctx.moveTo(rx + L.focusR, ry); ctx.lineTo(rx + 120, ry - 90); ctx.lineTo(rx + 420, ry - 90); ctx.stroke();
  ctx.font = STYLE.type.title(20); ctx.fillStyle = P.ink; ctx.fillText(D.rt1.title.split(':')[0] + ' · ' + D.rt1.year, rx + 126, ry - 100);
  ctx.font = STYLE.type.mono(13); ctx.fillStyle = P.dim; ctx.fillText(D.rt1.title.split(':')[1].trim(), rx + 126, ry - 74);
  ctx.globalAlpha = 1;
  // 왼쪽 도판 설명 칸
  const left = -960 + L.margin;
  ctx.font = STYLE.type.mono(15); ctx.fillStyle = P.dim; ctx.fillText('FIG. 04 — CITATIONS', left, -260);
  ctx.strokeStyle = P.rule; ctx.beginPath(); ctx.moveTo(left, -240); ctx.lineTo(left + L.column, -240); ctx.stroke();
  M.text(ctx, M.seg(CAPTION, STYLE.type.caption(52), P.ink, 0), left, -160, t, {
    split: STYLE.motion.split,
    enter: { at: T.cite - 1.0, dur: STYLE.motion.enter, ease: STYLE.motion.easeIn, stagger: STYLE.motion.stagger },
    transform: (e) => ({ alpha: e, dy: (1 - e) * STYLE.motion.rise }),
  });
  const nRef = Math.round(D.rt1.refs.length * clamp01((t - T.cite) / (STYLE.motion.lineDur + STYLE.motion.lineSpread)));
  const nCit = Math.round(D.rt1.citedBy.length * clamp01((t - T.cite) / (STYLE.motion.lineDur + STYLE.motion.lineSpread)));
  ctx.font = STYLE.type.mono(18);
  ctx.fillStyle = P.refs; ctx.fillText(`참조 ${nRef}`, left, -40);
  ctx.fillStyle = P.cited; ctx.fillText(`피인용 ${nCit}`, left + 150, -40);
  ctx.font = STYLE.type.mono(13); ctx.fillStyle = P.dim;
  ctx.fillText(`${M.count(D.n, { separator: ',' })} papers · ${D.yearFrom}–${D.yearTo}`, left, 40);
  // 질감
  film.vignette(STYLE.texture.vignette);
  film.grain(t, STYLE.texture.grain);
}
