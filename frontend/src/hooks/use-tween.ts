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
// 열쇠가 있는 동안(0 이상) 0 → 1로, 없어지면 지금 값에서 0으로 잇는다. 열쇠가 다른
// 값으로 바뀌면 0부터 다시 — 강조 노드를 옮길 때 연결선이 새 노드에서 다시 뻗어 나온다.
export function useKeyedTween(
  key: number,
  duration: number,
  immediate = false,
): number {
  const on = key >= 0;
  const [value, setValue] = useState(on ? 1 : 0);
  const current = useRef(value);
  const lastKey = useRef(key);
  useEffect(() => {
    const target = on ? 1 : 0;
    let begin = current.current;
    if (on && key !== lastKey.current) begin = 0;
    if (on) lastKey.current = key;
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
  }, [key, on, duration, immediate]);
  return immediate ? (on ? 1 : 0) : value;
}
