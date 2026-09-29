import { useMemo } from "react";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { homeCamera } from "../../../frontend/src/views/map/labels";
import { useSnapshot, type Snapshot } from "../data";
import { buildModel, HEIGHT, WIDTH, type MapModel } from "../map/model";
import { MapScene, type Annotation, type Camera } from "../map/MapScene";
import { cameraAt, focusAt, type Key } from "../map/camera";
import { ChatPanel, PANEL_W } from "../chat/ChatPanel";
import { chatSchedule } from "../chat/schedule";
import { FlowFrame, LineageFrame, TreeFrame } from "../views/ViewFrames";
import {
  CAPTIONS,
  FOCUS_FIELD,
  FOCUS_PAPER,
  FPS,
  SCENES,
  type SceneKey,
} from "../timeline";

// 모션 값. 등장 250ms·퇴장 200ms는 design-ops `patterns/motion.md` Implementation
// defaults(큰 영역의 등장·퇴장, 표본 83개), 곡선은 앱 토큰 `--ease`
// (cubic-bezier(0.2, 0.8, 0.2, 1), frontend/src/styles/tokens.css).
const ENTER = Math.round(0.25 * FPS),
  EXIT = Math.round(0.2 * FPS),
  appEase = Easing.bezier(0.2, 0.8, 0.2, 1),
  CROSSFADE = 8;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function Teaser() {
  const data = useSnapshot();
  const model = useMemo(() => (data ? buildModel(data) : null), [data]);
  if (!data || !model) return null;
  return <Story data={data} model={model} />;
}

function Story({ data, model }: { data: Snapshot; model: MapModel }) {
  const frame = useCurrentFrame();
  const [mapEnd, viewsStart] = [SCENES.chat[1], SCENES.views[0]];
  // 장면 사이 교차: 다음 장면이 CROSSFADE 프레임 동안 위에 겹쳐 켜진다.
  // 경계 프레임 직전에 1이 되어, 앞 장면을 떼는 프레임에 남은 잔상이 없다.
  const viewsIn = clamp01((frame - (viewsStart - CROSSFADE) + 1) / CROSSFADE),
    endIn = clamp01((frame - (SCENES.end[0] - CROSSFADE) + 1) / CROSSFADE);
  return (
    <AbsoluteFill style={{ background: "var(--background)" }}>
      {frame < mapEnd && <MapStory model={model} frame={frame} />}
      {frame >= viewsStart - CROSSFADE && frame < SCENES.end[0] && (
        <AbsoluteFill style={{ opacity: viewsIn }}>
          <Views data={data} frame={frame} />
        </AbsoluteFill>
      )}
      {frame >= SCENES.end[0] - CROSSFADE && (
        <AbsoluteFill style={{ opacity: endIn }}>
          <EndCard model={model} frame={frame} />
        </AbsoluteFill>
      )}
      {(Object.keys(SCENES) as SceneKey[])
        .filter((k) => k !== "end")
        .map((k) => (
          <Caption key={k} scene={k} frame={frame} />
        ))}
      <Audio src={staticFile("audio/teaser.wav")} />
    </AbsoluteFill>
  );
}

// ── 장면 1–5: 한 번 이어지는 지도 ───────────────────────────────────────────

function MapStory({ model, frame }: { model: MapModel; frame: number }) {
  const { map, home } = model;
  const paper = map.id.indexOf(FOCUS_PAPER);
  const field = model.regions[0].find((n) => n.id === FOCUS_FIELD)!;
  const P: [number, number] = [map.x[paper], map.y[paper]];
  const H: [number, number] = [home.target[0], home.target[1]];
  const chat = useMemo(() => chatSchedule(), []);
  const chatStart = SCENES.chat[0];

  // 장면 1–4의 카메라 열쇠.
  const keys: Key[] = useMemo(
    () => [
      { frame: SCENES.growth[0], at: H, rel: 0 },
      { frame: SCENES.growth[1], at: H, rel: 0.05 },
      { frame: SCENES.overview[1] - 2, at: H, rel: 0.35 },
      { frame: SCENES.dive[0] + 60, at: [field.x, field.y], rel: 1.6 },
      { frame: SCENES.dive[1] - 10, at: P, rel: 5.6 },
      { frame: SCENES.cite[0] + 40, at: P, rel: 5.6 },
      // 물러나 인용망 전체를 보인다. 채팅에서 에이전트의 fly_to가 다시 들어간다.
      { frame: SCENES.cite[1] - 5, at: P, rel: 2.2 },
      { frame: SCENES.chat[1], at: P, rel: 2.2 },
    ],
    [H[0], H[1], field, P[0], P[1]],
  );

  // 장면 5: 패널이 열리며 지도 폭이 준다(앱의 사이드바처럼). 에이전트의 fly_to가 끝나는
  // 프레임부터 앱의 카메라 이동(280ms ease-out cubic, MapView `move`)으로 옮긴다. 목적
  // 배율은 앱의 fly_to와 같다: 좁아진 지도의 기준 배율 + levelOffset.paper(3.5).
  const f = frame - chatStart;
  const open = frame < chatStart ? 0 : appEase(clamp01(f / ENTER));
  const width = WIDTH - PANEL_W * open;
  const narrowHome = useMemo(
    () => homeCamera(map, WIDTH - PANEL_W, HEIGHT),
    [map],
  );
  const fly = chat.events.find((e) => e.name === "fly_to");
  let camera: Camera = cameraAt(frame, keys, home.zoom);
  if (fly && f >= fly.frame) {
    const t = 1 - (1 - clamp01((f - fly.frame) / (0.28 * FPS))) ** 3;
    const from = cameraAt(chatStart + fly.frame, keys, home.zoom);
    const to = narrowHome.zoom + 3.5;
    camera = {
      target: [
        from.target[0] + (P[0] - from.target[0]) * t,
        from.target[1] + (P[1] - from.target[1]) * t,
        0,
      ],
      zoom: from.zoom + (to - from.zoom) * t,
    };
  }

  // 장면 1: 연도 재생. 헤드가 2013 → 2027로 간다(이 코퍼스는 해마다 약 1,190편이라 앱의
  // 축 비례 속도와 선형 속도가 같다). 헤드가 끝에 닿으면 필터를 푼다.
  const [g0, g1] = SCENES.growth;
  const yearHead =
    frame < g1 - 8
      ? interpolate(frame, [g0 + 6, g1 - 10], [2013, 2027], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : undefined;

  // 장면 4: RT-1의 인용선. 채팅이 시작되면 꺼진다.
  const focus = focusAt(
    frame,
    paper,
    SCENES.cite[0] + 5,
    chatStart,
    (x) => cameraAt(x, keys, home.zoom).zoom,
    FPS,
  );

  // 장면 5: annotate가 끝나는 프레임부터 기록된 결과(drawn)대로 라벨을 켠다.
  const ann = chat.events.find((e) => e.name === "annotate");
  const annotations: Annotation[] =
    ann && f >= ann.frame
      ? (
          ann.result as {
            drawn: { id: string; label: string; x: number; y: number }[];
          }
        ).drawn.map((d) => ({
          ...d,
          kind: "paper",
          alpha: 1 - (1 - clamp01((f - ann.frame) / (0.24 * FPS))) ** 3,
        }))
      : [];

  return (
    <AbsoluteFill>
      <MapScene
        model={model}
        camera={camera}
        focus={focus}
        width={width}
        yearHead={yearHead}
        annotations={annotations}
      />
      {yearHead !== undefined && <YearCounter model={model} head={yearHead} />}
      {frame >= chatStart && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            height: HEIGHT,
            transform: `translateX(${(1 - open) * PANEL_W}px)`,
          }}
        >
          <ChatPanel f={f} s={chat} />
        </div>
      )}
    </AbsoluteFill>
  );
}

function YearCounter({ model, head }: { model: MapModel; head: number }) {
  const year = Math.min(2026, Math.floor(head));
  const shown = useMemo(() => {
    let n = 0;
    for (const y of model.map.year) if (y === null || y <= year) n++;
    return n;
  }, [model, year]);
  return (
    <div className="year-counter">
      <span className="year-counter-year">{year}</span>
      <span className="year-counter-n">논문 {shown.toLocaleString()}편</span>
    </div>
  );
}

// ── 장면 6: 다른 뷰 ─────────────────────────────────────────────────────────

function Views({ data, frame }: { data: Snapshot; frame: number }) {
  const [v0, v1] = SCENES.views;
  const step = (v1 - v0) / 3;
  const k = Math.min(2, Math.max(0, Math.floor((frame - v0) / step)));
  const local = (frame - (v0 + k * step)) / step;
  const pan = Easing.inOut(Easing.cubic)(clamp01(local));
  // 뷰 사이도 짧게 교차한다.
  // 들어오는 뷰는 제 훑기의 시작(0)에서 그린다 — 경계에서 위치가 튀지 않는다.
  const next = clamp01(
    (local - 1 + CROSSFADE / step) / (CROSSFADE / step) + 1 / CROSSFADE,
  );
  const view = (i: number, p: number) =>
    i === 0 ? (
      <TreeFrame tree={data.tree} pan={p} />
    ) : i === 1 ? (
      <FlowFrame data={data.flow} pan={p} />
    ) : (
      <LineageFrame data={data.lineage} pan={p} />
    );
  return (
    <AbsoluteFill>
      {view(k, pan)}
      {k < 2 && next > 0 && (
        <AbsoluteFill style={{ opacity: next }}>{view(k + 1, 0)}</AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

// ── 장면 7: 엔딩 ────────────────────────────────────────────────────────────

function EndCard({ model, frame }: { model: MapModel; frame: number }) {
  const [e0] = SCENES.end;
  const t = appEase(clamp01((frame - e0) / ENTER));
  const sub = appEase(clamp01((frame - e0 - 6) / ENTER));
  // 배경을 칠해 두어야 교차가 끝났을 때 아래 장면이 비치지 않는다.
  return (
    <AbsoluteFill style={{ background: "var(--background)" }}>
      <AbsoluteFill style={{ opacity: 0.3 }}>
        <MapScene
          model={model}
          camera={{
            target: model.home.target,
            zoom: model.home.zoom + 0.1 * clamp01((frame - e0) / 90),
          }}
          labels={false}
        />
      </AbsoluteFill>
      <div className="end-card">
        <div
          className="end-brand"
          style={{ opacity: t, transform: `translateY(${(1 - t) * 8}px)` }}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path
              d="M6 22 12 7l13 6-7 13L6 22Zm6-15 6 19M6 22l19-9"
              fill="none"
              stroke="currentColor"
              strokeWidth=".8"
            />
            <g fill="currentColor">
              <circle cx="6" cy="22" r="2" />
              <circle cx="12" cy="7" r="2.3" />
              <circle cx="25" cy="13" r="1.8" />
              <circle cx="18" cy="26" r="1.6" />
            </g>
          </svg>
          <span>Constellation</span>
        </div>
        <div
          className="end-sub"
          style={{ opacity: sub, transform: `translateY(${(1 - sub) * 8}px)` }}
        >
          {CAPTIONS.end}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ── 자막 ────────────────────────────────────────────────────────────────────

function Caption({ scene, frame }: { scene: SceneKey; frame: number }) {
  const [s0, s1] = SCENES[scene];
  const start = s0 + 6,
    end = s1 - 2;
  if (frame < start || frame >= end) return null;
  const inT = appEase(clamp01((frame - start) / ENTER));
  const outT = clamp01((frame - (end - EXIT)) / EXIT);
  const a = inT * (1 - outT);
  // 채팅 장면에서는 패널을 피해 지도 쪽에 둔다(패널 폭만큼 오른쪽 여백).
  return (
    <div
      className="caption"
      style={{
        opacity: a,
        transform: `translateY(${(1 - inT) * 8}px)`,
        right: scene === "chat" ? PANEL_W + 64 : 64,
      }}
    >
      {CAPTIONS[scene]}
    </div>
  );
}
