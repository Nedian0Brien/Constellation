import { useEffect, useRef, useState } from "react";
// 목표값이 바뀌면 지금 값에서 목표까지 `duration`ms에 걸쳐 잇는다(지도 카메라 이동과
// 같은 ease-out). `immediate`(동작 줄이기)면 바로 목표값이다.
export function useTween(
  target: number,
  duration: number,
  immediate = false,
): number {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const begin = current.current;
    if (immediate) {
      current.current = target;
      return;
    }
    if (begin === target) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration),
        f = 1 - (1 - t) ** 3;
      current.current = begin + (target - begin) * f;
      setValue(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, duration, immediate]);
  return immediate ? target : value;
}
// 일정한 속도로 나아가는 앞머리(픽셀). 열쇠가 있는 동안(0 이상) 0에서 `limit`까지
// 초당 `speed`만큼 늘고, 없어지면 지금 값에서 같은 속도로 0까지 준다. 열쇠가 다른 값으로
// 바뀌면 0부터 다시 — 강조 노드를 옮기면 연결선이 새 노드에서 다시 뻗어 나온다.
// 열쇠가 바뀐 렌더에서 바로 0을 돌려준다(이전 렌더 값을 state에 남기는 방식).
export function useFront(
  key: number,
  speed: number,
  limit: number,
  immediate = false,
): number {
  const on = key >= 0;
  const [state, setState] = useState({ key, d: on ? limit : 0 });
  if (on && state.key !== key) setState({ key, d: 0 });
  const d = on && state.key !== key ? 0 : state.d;
  const current = useRef(d);
  useEffect(() => {
    current.current = d;
  }, [d]);
  useEffect(() => {
    if (immediate) return;
    const target = on ? limit : 0;
    if (current.current === target) return;
    let prev = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const step = (speed * (now - prev)) / 1000;
      prev = now;
      const next = on
        ? Math.min(limit, current.current + step)
        : Math.max(0, current.current - step);
      current.current = next;
      setState({ key, d: next });
      if (next !== target) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [key, on, speed, limit, immediate]);
  return immediate ? (on ? limit : 0) : d;
}
