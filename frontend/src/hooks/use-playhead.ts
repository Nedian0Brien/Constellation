import { useSyncExternalStore } from "react";
// 연도 재생 헤드의 자리(소수 연도). YearRange가 재생 중(또는 일시정지 중) 프레임마다
// 쓴다. 필터 일치 집합·인용선은 정수 연도(`usePlayhead`)를 `to` 대신 상한으로 읽어 한 해를
// 넘을 때만 다시 계산하고, 지도의 점은 소수 값(`usePlayheadExact`)으로 그 해의 점을 헤드가
// 칸을 지나는 동안 서서히 그린다. 사용자가 정한 범위(`from`·`to`)는 URL에 있고 헤드는 그
// 안에서 도는 일시적인 값이라 URL에 넣지 않는다 — 새로고침하면 재생 중이 아니므로 헤드도
// 없어야 한다.
let head: number | undefined;
const listeners = new Set<() => void>();
export function setPlayhead(next: number | undefined) {
  if (next === head) return;
  head = next;
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const exact = () => head;
const year = () => (head === undefined ? undefined : Math.floor(head));
/** 헤드가 지나는 해(정수). 한 해를 넘을 때만 다시 그린다. */
export const usePlayhead = () => useSyncExternalStore(subscribe, year, year);
/** 헤드의 자리(소수 연도). 프레임마다 다시 그린다 — 지도만 쓴다. */
export const usePlayheadExact = () =>
  useSyncExternalStore(subscribe, exact, exact);
