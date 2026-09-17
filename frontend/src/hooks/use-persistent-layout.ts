import { useState, useCallback } from "react";
// v1은 Resizable 패널의 폭 비율을, v2는 인스펙터 열림을 저장했다. 인스펙터가
// 선택에 따라 열리는 Dialog가 된 v3에서는 좌측 탐색과 우측 에이전트 채팅의
// 열림만 남기고 이전 키는 읽지 않는다.
const key = "constellation.layout.v3";
export interface Preferences {
  navOpen: boolean;
  chatOpen: boolean;
}
const fallback: Preferences = { navOpen: true, chatOpen: false };
export function readPreferences(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!raw || raw.version !== 3) return fallback;
    return {
      navOpen: typeof raw.navOpen === "boolean" ? raw.navOpen : true,
      chatOpen: typeof raw.chatOpen === "boolean" ? raw.chatOpen : false,
    };
  } catch {
    return fallback;
  }
}
export function usePersistentLayout() {
  const [prefs, setPrefs] = useState(readPreferences);
  const save = useCallback((patch: Partial<Preferences>) => {
    setPrefs((old) => {
      const next = { ...old, ...patch };
      try {
        localStorage.setItem(key, JSON.stringify({ ...next, version: 3 }));
      } catch {
        /* The workspace remains usable with storage disabled. */
      }
      return next;
    });
  }, []);
  return { prefs, save };
}
