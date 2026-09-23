'use strict';
const M = Motion;
// ─── Facts ──────────────────────────────────────────────────────────────
// source: 편수·인용 수·제목은 ../data.js(피지컬 AI 코퍼스 스냅샷, build-data.mjs)에서 읽는다.

// ─── STYLE — 방향 b: 역동적이고 웅장한 빛의 지도 ─────────────────────────
// 브리프: 톤 "역동·웅장" → 지도를 원근으로 기울인 은하처럼 두고 빛을 더한다. 이전 버전의 "움직임이
// 밋밋함"을 풀려고 카메라가 계속 움직이고 선은 빛줄기로 튄다. 웹 랜딩이라 자막은 크고 짧게.
const STYLE = {
  palette: {
    background: '#020205',
    ink: '#ffffff',
    sub: 'rgba(255,255,255,0.72)',
    clusters: [[96, 180, 255], [170, 120, 255], [255, 120, 190], [255, 170, 80], [120, 230, 180], [90, 220, 240], [255, 220, 120], [200, 200, 220]],
    other: [110, 120, 150],
    refs: [90, 215, 255],     // 참조 — 청록 빛
    cited: [255, 120, 70],    // 피인용 — 주황 빛
    core: [255, 255, 255],
  },
  type: {
    caption: (s) => `800 ${s}px "Gothic A1", sans-serif`,
    sub: (s) => `400 ${s}px "Gothic A1", sans-serif`,
  },
  motion: {
    split: 'char', enter: 0.55, exit: 0.4, stagger: 0.025,
    easeIn: M.ease.outExpo, easeOut: M.ease.inCubic, camEase: M.ease.inOutCubic,
    lineDur: 0.9, lineSpread: 1.2, rise: 40,
  },
  materials: ['additive glow', 'perspective plane', 'light beams'],
  texture: { vignette: { inner: 0.35, outer: 1.05, strength: 0.8, color: [0, 0, 0] }, grain: { alpha: 0.04, rate: 24, color: [255, 255, 255] }, bloom: 'blur(6px)' },
  sound: null,
  layout: { mapBox: { cx: 0, cy: 0, w: 2400, h: 1800 }, pitch: 0.95, focal: 1400, dist: 1500, dot: 1.8, bigDot: 3.2, beam: 1.6, glowR: 220 },
};

const T = { cite: 14.2 };
const CAPTION = '무엇을 인용했고, 누가 인용했는지';
const film = M.film({
  title: 'Constellation — b', duration: 20, fps: 30, width: 1920, height: 1080,
  background: STYLE.palette.background, style: STYLE,
  fonts: [[STYLE.type.caption(76), CAPTION], [STYLE.type.sub(24), `RT-1 참조 피인용 0123456789 ${D.rt1.title}`]],
  assets: {}, audio: null, draw,
});
const MAP = fitMap(STYLE.layout.mapBox);
const LINKS = citeLinks(MAP.X, MAP.Y);
const BIG = new Set(D.big);
const r = D.rt1.i;

// 지도 평면을 기울여 원근으로 본다. 카메라는 RT-1 쪽으로 천천히 돈다(yaw).
function projector(t) {
  const L = STYLE.layout;
  const yaw = M.keys(t, [[10, -0.35], [20, 0.25]], STYLE.motion.camEase);
  const cx = MAP.X[r], cy = MAP.Y[r];
  return (x, y) => {
    const [X, Y, Z] = M.rot3(x - cx, y - cy, 0, { pitch: L.pitch, yaw });
    const k = L.focal / (L.dist + Z);
    return [X * k, Y * k + 60, k];
  };
}

function draw(ctx, t) {
  film.clear();
  const L = STYLE.layout, P = STYLE.palette;
  const pr = projector(t);
  const lit = new Map();
  for (const l of LINKS) lit.set(l.j, clamp01((t - (T.cite + l.order * STYLE.motion.lineSpread)) / STYLE.motion.lineDur));
  const pts = (size) => {
    for (let i = 0; i < D.n; i++) {
      if (D.x[i] < 0) continue;
      const [x, y, k] = pr(MAP.X[i], MAP.Y[i]);
      if (k <= 0) continue;
      const c = D.region[i] >= 0 ? P.clusters[D.region[i]] : P.other;
      const on = lit.get(i) >= 1;
      const a = (on ? 1 : t > T.cite ? 0.45 : 0.8) * Math.min(1, k);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      const s = (BIG.has(i) ? L.bigDot : L.dot) * k * size;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  };
  // 빛 번짐 층 + 선명한 점
  film.layer(() => pts(2.4), { blend: 'lighter', filter: STYLE.texture.bloom, alpha: 0.9 });
  ctx.globalCompositeOperation = 'lighter';
  pts(1);
  // 빛줄기
  const [rx, ry] = pr(MAP.X[r], MAP.Y[r]);
  for (const l of LINKS) {
    const e = STYLE.motion.easeIn(lit.get(l.j));
    if (e <= 0) continue;
    const [jx, jy] = pr(MAP.X[l.j], MAP.Y[l.j]);
    const c = l.kind === 'ref' ? P.refs : P.cited;
    const [ax, ay, bx, by] = l.kind === 'ref' ? [rx, ry, jx, jy] : [jx, jy, rx, ry];
    const g = ctx.createLinearGradient(ax, ay, ax + (bx - ax) * e, ay + (by - ay) * e);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.05)`);
    g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0.95)`);
    ctx.strokeStyle = g; ctx.lineWidth = L.beam;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * e, ay + (by - ay) * e); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  const pulse = M.span(t, T.cite, null, { inDur: STYLE.motion.lineDur, easeIn: STYLE.motion.easeIn });
  film.glow(rx, ry, L.glowR * (0.6 + 0.4 * pulse), P.core, 0.55 * pulse);
  // 자막(가운데 아래, 크게)
  M.text(ctx, M.seg(CAPTION, STYLE.type.caption(76), P.ink, 0), 0, 360, t, {
    split: STYLE.motion.split, align: 'center',
    enter: { at: T.cite - 0.4, dur: STYLE.motion.enter, ease: STYLE.motion.easeIn, stagger: STYLE.motion.stagger },
    transform: (e) => ({ alpha: e, dy: (1 - e) * STYLE.motion.rise, blur: (1 - e) * 8 }),
  });
  const p = clamp01((t - T.cite) / (STYLE.motion.lineDur + STYLE.motion.lineSpread));
  ctx.font = STYLE.type.sub(24); ctx.textAlign = 'center';
  ctx.fillStyle = `rgb(${P.refs})`; ctx.fillText(`참조 ${Math.round(D.rt1.refs.length * p)}`, -110, 432);
  ctx.fillStyle = `rgb(${P.cited})`; ctx.fillText(`피인용 ${Math.round(D.rt1.citedBy.length * p)}`, 110, 432);
  ctx.fillStyle = P.sub; ctx.fillText(`RT-1 · ${D.rt1.year}`, rx, ry - 34);
  ctx.textAlign = 'left';
  film.vignette(STYLE.texture.vignette);
  film.grain(t, STYLE.texture.grain);
}
