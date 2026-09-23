// 세 스타일 프레임이 같이 쓰는 데이터 계산(미적 값 없음). window.DATA는 ../data.js.
const D = window.DATA;
// 지도 범위(0–10000 정수 좌표)
const B = (() => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < D.n; i++) {
    if (D.x[i] < 0) continue;
    x0 = Math.min(x0, D.x[i]); x1 = Math.max(x1, D.x[i]);
    y0 = Math.min(y0, D.y[i]); y1 = Math.max(y1, D.y[i]);
  }
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
})();
// 지도를 화면 상자 { cx, cy, w, h }에 맞추는 변환. 결과 좌표는 화면 가운데 원점.
function fitMap(box) {
  const s = Math.min(box.w / B.w, box.h / B.h);
  const X = new Float32Array(D.n), Y = new Float32Array(D.n);
  for (let i = 0; i < D.n; i++) {
    X[i] = box.cx + (D.x[i] - B.cx) * s;
    Y[i] = box.cy + (D.y[i] - B.cy) * s;
  }
  const at = (x, y) => [box.cx + (x - B.cx) * s, box.cy + (y - B.cy) * s];
  return { X, Y, s, at };
}
// RT-1 인용선: 참조(RT-1 → 이웃)와 피인용(이웃 → RT-1). 가까운 이웃부터 순서를 준다.
function citeLinks(X, Y) {
  const r = D.rt1.i;
  const mk = (list, kind) => list.map((j) => ({ j, kind, d: Math.hypot(X[j] - X[r], Y[j] - Y[r]) }));
  const all = [...mk(D.rt1.refs, 'ref'), ...mk(D.rt1.citedBy, 'cited')].sort((a, b) => a.d - b.d);
  all.forEach((l, k) => (l.order = k / Math.max(1, all.length - 1)));
  return all;
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
