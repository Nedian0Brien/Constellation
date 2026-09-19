import { useRef } from "react";
// 확대 다이얼. 세로 눈금자가 배율에 따라 흐르고, 가운데 표시선은 고정이다 — 카메라
// 줌 링처럼. 눈금은 배율 0.25 단계마다, 굵은 눈금과 % 라벨은 정수 단계(기준 배율의
// 2^k)마다. 끌거나 휠을 굴리면 배율이 바뀌고, 키보드(↑↓)는 반 단계씩. 눈금자의 픽셀
// 간격은 배율 1단계 = 48px.
const PX_PER_ZOOM = 48,
  MINOR_STEP = 0.25,
  DIAL_HEIGHT = 168;
export function ZoomDial({
  zoom,
  home,
  min,
  max,
  onChange,
}: {
  zoom: number;
  home: number;
  min: number;
  max: number;
  onChange: (zoom: number) => void;
}) {
  const drag = useRef<{ id: number; y: number; zoom: number } | null>(null);
  const clamp = (z: number) => Math.min(max, Math.max(min, z));
  const percent = (z: number) => Math.round(100 * 2 ** (z - home));
  // 보이는 눈금: 가운데(zoom)에서 위아래로 반 높이만큼.
  const half = DIAL_HEIGHT / 2 / PX_PER_ZOOM;
  // 눈금은 기준 배율(home)에서 0.25 단계씩 — 기준 배율은 지도 크기에 따라 정수가
  // 아니므로 절대값이 아니라 기준 배율 기준으로 잰다.
  const ticks: { z: number; major: boolean }[] = [];
  const m0 = Math.ceil((zoom - half - home) / MINOR_STEP),
    m1 = Math.floor((zoom + half - home) / MINOR_STEP);
  for (let m = m0; m <= m1; m++) {
    const z = home + m * MINOR_STEP;
    if (z < min - 1e-9 || z > max + 1e-9) continue;
    ticks.push({ z, major: m % 4 === 0 });
  }
  return (
    <div className="zoom-dial-wrap" style={{ height: DIAL_HEIGHT }}>
      <div
        className="zoom-dial"
        role="slider"
        tabIndex={0}
        aria-label="지도 배율"
        aria-orientation="vertical"
        aria-valuemin={percent(min)}
        aria-valuemax={percent(max)}
        aria-valuenow={percent(zoom)}
        aria-valuetext={`${percent(zoom)}%`}
        style={{ height: DIAL_HEIGHT }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, y: e.clientY, zoom };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          // 위로 끌면 확대(눈금자가 아래로 흐른다).
          onChange(clamp(d.zoom + (d.y - e.clientY) / PX_PER_ZOOM));
        }}
        onPointerUp={(e) => {
          if (drag.current?.id === e.pointerId) drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(e) => {
          onChange(clamp(zoom - e.deltaY / (PX_PER_ZOOM * 2)));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(clamp(zoom + (e.key === "ArrowUp" ? 0.5 : -0.5)));
          }
        }}
      >
        <div className="zoom-dial-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <div
              key={t.z.toFixed(2)}
              className="zoom-tick"
              data-major={t.major || undefined}
              style={{
                top: DIAL_HEIGHT / 2 - (t.z - zoom) * PX_PER_ZOOM,
              }}
            >
              {/* 바늘과 겹치는 라벨은 숨긴다 — 바늘 옆에 현재 배율이 있다. */}
              {t.major && Math.abs(t.z - zoom) > 0.12 && (
                <span>{percent(t.z)}%</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* 바늘과 현재 배율. 눈금자(overflow hidden) 밖에 두어 라벨이 왼쪽으로 나간다. */}
      <div className="zoom-dial-needle" aria-hidden="true">
        <span>{percent(zoom)}%</span>
      </div>
    </div>
  );
}
