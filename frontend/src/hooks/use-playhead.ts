import { useSyncExternalStore } from "react";
// 연도 재생 헤드가 지나는 해. YearRange가 재생 중(또는 일시정지 중) 한 해를 넘을 때마다
// 쓰고, 지도와 필터 일치 집합은 이 해를 `to` 대신 상한으로 읽는다. 사용자가 정한 범위
// (`from`·`to`)는 URL에 있고 헤드는 그 안에서 도는 일시적인 값이라 URL에 넣지 않는다 —
// 새로고침하면 재생 중이 아니므로 헤드도 없어야 한다.
let year: number | undefined;
const listeners = new Set<() => void>();
export function setPlayhead(next: number | undefined) {
  if (next === year) return;
  year = next;
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => year;
export const usePlayhead = () => useSyncExternalStore(subscribe, get, get);
