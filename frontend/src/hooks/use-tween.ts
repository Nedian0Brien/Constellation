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
// 초당 `speed`만큼 는다. 열쇠가 없어지면 그 자리에 멈춘다(되돌아가지 않는다 — 선은
// 페이드아웃으로 사라진다). 열쇠가 다른 값으로 바뀌면 0부터 다시 — 강조 노드를 옮기면
// 연결선이 새 노드에서 다시 뻗어 나온다. 열쇠가 바뀐 렌더에서 바로 0을 돌려준다(이전
// 렌더 값을 state에 남기는 방식).
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
    if (immediate || !on || current.current >= limit) return;
    let prev = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      // rAF의 시각은 프레임 시작이라 effect의 performance.now()보다 앞설 수 있다.
      const next = Math.min(
        limit,
        current.current + (speed * Math.max(0, now - prev)) / 1000,
      );
      prev = now;
      current.current = next;
      setState({ key, d: next });
      if (next < limit) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [key, on, speed, limit, immediate]);
  return immediate ? limit : d;
}
// 타이핑 진행(글자 수). 열쇠가 0 이상이면 0부터 `total`까지 `msPerChar`마다 한 글자씩
// 는다. 열쇠가 바뀌면 처음부터. 시작 시각은 첫 프레임의 rAF 시각으로 잡는다(렌더 중에
// performance.now()를 부르지 않는다). `immediate`면 바로 전부.
export function useTyping(
  key: number,
  total: number,
  msPerChar: number,
  immediate = false,
): number {
  const [typing, setTyping] = useState({ key, start: -1 });
  if (key >= 0 && typing.key !== key) setTyping({ key, start: -1 });
  const start = typing.key === key ? typing.start : -1;
  const [now, setNow] = useState(0);
  const count =
    key < 0
      ? 0
      : immediate
        ? total
        : start < 0
          ? 0
          : Math.min(total, Math.max(0, Math.floor((now - start) / msPerChar)));
  useEffect(() => {
    if (key < 0 || immediate || count >= total) return;
    const raf = requestAnimationFrame((t) => {
      if (start < 0) setTyping({ key, start: t });
      setNow(t);
    });
    return () => cancelAnimationFrame(raf);
  }, [key, immediate, count, total, start, now]);
  return count;
}
