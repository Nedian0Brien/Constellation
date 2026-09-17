import { useSyncExternalStore } from "react";
const query = "(max-width: 767px)";
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
