import { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame, useDelayRender } from "remotion";
import type { DeckGLRef } from "@deck.gl/react";

// deck.gl이 이 프레임의 props로 그리기를 마칠 때까지 캡처를 붙잡는다.
// - 핸들은 렌더 중에 잡는다. DeckGL은 렌더 중에 setProps를 부르므로, 그 뒤에 오는
//   onAfterRender는 반드시 이 프레임의 카메라로 그린 것이다.
// - layout effect에서 redraw를 강제한다. deck은 바뀐 것이 없으면(카메라가 멈춘 구간)
//   다시 그리지 않아 onAfterRender가 오지 않는다.
// - 첫 프레임은 luma 장치가 비동기로 준비된 뒤의 첫 그리기가 핸들을 푼다.
// 그리지 못하면 delayRender 시간 초과로 렌더가 실패한다 — 빈 프레임을 내보내지 않는다.
export function useDeckFrameSync() {
  const frame = useCurrentFrame();
  const { delayRender, continueRender } = useDelayRender();
  const deck = useRef<DeckGLRef>(null);
  const pending = useRef(new Set<number>());
  useMemo(() => {
    pending.current.add(delayRender(`deck frame ${frame}`));
  }, [frame, delayRender]);
  useLayoutEffect(() => {
    deck.current?.deck?.redraw(`remotion frame ${frame}`);
  }, [frame]);
  const onAfterRender = () => {
    for (const handle of pending.current) continueRender(handle);
    pending.current.clear();
  };
  return { deck, onAfterRender };
}
