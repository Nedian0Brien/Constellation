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
