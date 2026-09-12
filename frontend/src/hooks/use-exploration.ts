import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { changeSearch, parseSearch, type Exploration } from "../app/navigation";
export function useExploration() {
  const search = useSearch({ strict: false });
  const state = parseSearch(search as Record<string, unknown>);
  const navigate = useNavigate();
  const update = useCallback(
    (patch: Partial<Exploration>, replace = false) => {
      void navigate({
        to: "/",
        search: (previous: Record<string, unknown>) =>
          changeSearch(parseSearch(previous), patch),
        replace,
        resetScroll: false,
      });
    },
    [navigate],
  );
  return { state, update };
}
