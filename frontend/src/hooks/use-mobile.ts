import { useSyncExternalStore } from "react";
// 셸의 모바일 기준(≤959px). 이 폭 아래에서는 두 사이드바가 Sheet로 열린다.
const query = "(max-width: 959px)";
const subscribe = (listener: () => void) => {
  const media = matchMedia(query);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => false,
  );
}
