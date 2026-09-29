// 티저 사운드를 코드로 합성해 public/audio/teaser.wav(48kHz, 16bit 스테레오)로 쓴다.
// 외부 음원을 쓰지 않는다. 난수는 시드를 고정한 PRNG라 같은 입력이면 같은 파일이 나온다.
// 장면 경계는 영상과 같은 src/timeline.ts에서 읽는다(Node가 TS 타입을 걷어 내고 읽는다).
import { mkdir, writeFile } from "node:fs/promises";
import { DURATION, FPS, SCENES } from "../src/timeline.ts";

const RATE = 48000;
const N = Math.round((DURATION / FPS) * RATE);
const L = new Float32Array(N),
  R = new Float32Array(N);
const sec = (frame) => frame / FPS;

// mulberry32 — 시드 고정 PRNG
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20260924);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function add(i, l, r) {
  if (i >= 0 && i < N) {
    L[i] += l;
    R[i] += r;
  }
}

// ── 배경 패드: 장면마다 화음. 사인 + 약한 2배음, 좌우 0.3Hz 어긋나게 해 넓게 ──────
const chords = [
  [SCENES.growth[0], [45, 52, 57, 59, 64]], // A2 E3 A3 B3 E4
  [SCENES.overview[0], [41, 48, 52, 57, 60]], // F2 C3 E3 A3 C4
  [SCENES.cite[0], [43, 50, 55, 59, 62]], // G2 D3 G3 B3 D4
  [SCENES.chat[0], [48, 55, 59, 62, 67]], // C3 G3 B3 D4 G4
  [SCENES.views[0], [41, 48, 55, 57, 64]], // F2 C3 G3 A3 E4
  [SCENES.end[0], [45, 52, 59, 60, 64]], // A2 E3 B3 C4 E4
];
const XFADE = 0.6 * RATE;
for (let c = 0; c < chords.length; c++) {
  const start = Math.round(sec(chords[c][0]) * RATE);
  const end =
    c + 1 < chords.length ? Math.round(sec(chords[c + 1][0]) * RATE) : N;
  for (const note of chords[c][1]) {
    const f = hz(note);
    const amp = 0.05 / Math.sqrt(chords[c][1].length);
    for (
      let i = Math.max(0, start - XFADE);
      i < Math.min(N, end + XFADE);
      i++
    ) {
      const t = i / RATE;
      // 앞뒤 화음과 겹쳐 잇는 창
      const win = Math.min(
        1,
        (i - (start - XFADE)) / (2 * XFADE),
        (end + XFADE - i) / (2 * XFADE),
      );
      const lfo = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.17 * t + note);
      const s = (x) =>
        Math.sin(2 * Math.PI * x * t) + 0.18 * Math.sin(4 * Math.PI * x * t);
      add(i, amp * win * lfo * s(f - 0.15), amp * win * lfo * s(f + 0.15));
    }
  }
}

// ── 연도 재생: 논문이 켜질 때마다 흩어지는 높은 음(A 단조 5음). 뒤로 갈수록 촘촘하다 ──
const pent = [69, 72, 74, 76, 79, 81, 84, 86, 88];
function pluck(t0, midi, amp, pan) {
  const f = hz(midi),
    i0 = Math.round(t0 * RATE),
    len = Math.round(0.6 * RATE);
  for (let k = 0; k < len; k++) {
    const e = Math.exp(-k / (0.12 * RATE)) * Math.min(1, k / 48);
    const v = amp * e * Math.sin((2 * Math.PI * f * k) / RATE);
    add(i0 + k, v * (1 - pan), v * pan);
  }
}
{
  const [g0, g1] = SCENES.growth;
  const count = 70;
  for (let n = 0; n < count; n++) {
    // 누적 분포가 t²를 따르도록: 뒤쪽이 촘촘하다
    const t = sec(g0 + 6) + Math.sqrt(rand()) * sec(g1 - g0 - 16);
    pluck(
      t,
      pent[Math.floor(rand() * pent.length)],
      0.018 + 0.012 * rand(),
      0.2 + 0.6 * rand(),
    );
  }
}

// ── 장면 전환: 저역 통과 차단 주파수가 올라갔다 내려오는 노이즈 ─────────────────
function whoosh(frame, dur = 0.7, amp = 0.09) {
  const i0 = Math.round((sec(frame) - dur * 0.6) * RATE),
    len = Math.round(dur * RATE);
  let yl = 0,
    yr = 0;
  for (let k = 0; k < len; k++) {
    const p = k / len;
    const env = Math.sin(Math.PI * p) ** 2;
    const cutoff = 200 + 3200 * Math.sin(Math.PI * p);
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
    yl += a * (rand() * 2 - 1 - yl);
    yr += a * (rand() * 2 - 1 - yr);
    add(i0 + k, amp * env * yl, amp * env * yr);
  }
}
for (const key of ["overview", "dive", "cite", "chat", "views", "end"])
  whoosh(SCENES[key][0]);

// ── 종: 인용선이 뻗기 시작할 때와 엔딩 ─────────────────────────────────────────
function bell(frame, midi, amp, decay = 1.6) {
  const i0 = Math.round(sec(frame) * RATE),
    len = Math.round(decay * 2.5 * RATE);
  const partials = [
    [1, 1],
    [2.01, 0.45],
    [3.02, 0.22],
    [4.2, 0.1],
  ];
  for (let k = 0; k < len; k++) {
    const t = k / RATE;
    let v = 0;
    for (const [m, g] of partials)
      v +=
        g *
        Math.exp(-t / (decay / m)) *
        Math.sin(2 * Math.PI * hz(midi) * m * t);
    v *= amp * Math.min(1, k / 96);
    add(i0 + k, v, v);
  }
}
bell(SCENES.cite[0] + 5, 76, 0.07);
bell(SCENES.cite[0] + 5, 83, 0.035);
bell(SCENES.end[0] + 2, 69, 0.08, 2.2);
bell(SCENES.end[0] + 2, 76, 0.05, 2.2);

// ── 마스터: 처음 1.5초 페이드인, 끝 2초 페이드아웃, 최고점 0.8로 맞춘다 ────────────
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / RATE,
    total = N / RATE;
  const g = Math.min(1, t / 1.5, (total - t) / 2);
  L[i] *= g;
  R[i] *= g;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = peak > 0 ? 0.8 / peak : 1;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(36 + N * 4, 4);
pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20); // PCM
pcm.writeUInt16LE(2, 22); // 스테레오
pcm.writeUInt32LE(RATE, 24);
pcm.writeUInt32LE(RATE * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  pcm.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767),
    44 + i * 4,
  );
  pcm.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767),
    46 + i * 4,
  );
}
const out = new URL("../public/audio/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("teaser.wav", out), pcm);
console.log(
  `teaser.wav ${(N / RATE).toFixed(1)}s, peak ${peak.toFixed(3)} → 0.8`,
);
