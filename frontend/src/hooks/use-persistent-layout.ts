import { useState, useCallback } from "react";
const key = "constellation.layout.v1";
interface Preferences {
  navOpen: boolean;
  detailOpen: boolean;
  layout: Record<string, number>;
}
export function readPreferences(): Preferences {
  const fallback = {
    navOpen: true,
    detailOpen: false,
    layout: { nav: 19, workspace: 81, detail: 0 },
  };
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!raw || raw.version !== 1) return fallback;
    const layout = raw.layout;
    const valid =
      layout &&
      ["nav", "workspace", "detail"].every(
        (k) =>
          typeof layout[k] === "number" &&
          Number.isFinite(layout[k]) &&
          layout[k] >= 0 &&
          layout[k] <= 100,
      ) &&
      Math.abs(layout.nav + layout.workspace + layout.detail - 100) < 1;
    return {
      navOpen: typeof raw.navOpen === "boolean" ? raw.navOpen : true,
      detailOpen: typeof raw.detailOpen === "boolean" ? raw.detailOpen : false,
      layout: valid ? layout : fallback.layout,
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
        localStorage.setItem(key, JSON.stringify({ ...next, version: 1 }));
      } catch {
        /* The workspace remains usable with storage disabled. */
      }
      return next;
    });
  }, []);
  return { prefs, save };
}
