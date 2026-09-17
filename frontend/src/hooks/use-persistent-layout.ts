import { useState, useCallback } from "react";
// v1은 Resizable 패널의 폭 비율을 저장했다. 사이드바 폭이 고정된 v2에서는
// 열림 상태만 남기고 v1 값은 읽지 않는다.
const key = "constellation.layout.v2";
export interface Preferences {
  navOpen: boolean;
  detailOpen: boolean;
}
export function readPreferences(hasSelection: boolean): Preferences {
  // 딥링크로 논문·주제가 이미 선택된 채 열리면 인스펙터를 보여 준다.
  const fallback = { navOpen: true, detailOpen: hasSelection };
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!raw || raw.version !== 2) return fallback;
    return {
      navOpen: typeof raw.navOpen === "boolean" ? raw.navOpen : true,
      detailOpen:
        typeof raw.detailOpen === "boolean" ? raw.detailOpen : hasSelection,
    };
  } catch {
    return fallback;
  }
}
export function usePersistentLayout(hasSelection: boolean) {
  const [prefs, setPrefs] = useState(() => readPreferences(hasSelection));
  const save = useCallback((patch: Partial<Preferences>) => {
    setPrefs((old) => {
      const next = { ...old, ...patch };
      try {
        localStorage.setItem(key, JSON.stringify({ ...next, version: 2 }));
      } catch {
        /* The workspace remains usable with storage disabled. */
      }
      return next;
    });
  }, []);
  return { prefs, save };
}
