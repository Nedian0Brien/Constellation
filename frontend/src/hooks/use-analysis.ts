import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  fetchRuns,
  fetchMap,
  fetchClusters,
  fetchTree,
  fetchMatches,
} from "../api";
import { useExploration } from "./use-exploration";
export function useAnalysis() {
  const { state } = useExploration();
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: ({ signal }) => fetchRuns(signal),
  });
  const run = state.run ?? runs.data?.[0]?.run_id;
  const map = useQuery({
    queryKey: ["map", run],
    queryFn: ({ signal }) => fetchMap(run, signal),
    enabled: !!run,
  });
  const clusters = useQuery({
    queryKey: ["clusters", run],
    queryFn: ({ signal }) => fetchClusters(run!, signal),
    enabled: !!run && !!map.data,
  });
  const tree = useQuery({
    queryKey: ["tree", run],
    queryFn: ({ signal }) => fetchTree(run!, signal),
    enabled: !!run && !!map.data,
    retry: false,
  });
  const filters = useMemo(
    () => ({
      run: run ?? "",
      q: state.q,
      year_from: state.from,
      year_to: state.to,
    }),
    [run, state.q, state.from, state.to],
  );
  const valid = state.q.length !== 1;
  const matches = useQuery({
    queryKey: ["matches", filters],
    queryFn: ({ signal }) => fetchMatches(filters, signal),
    enabled: !!run && !!map.data && valid,
  });
  const ids = useMemo(() => new Set(matches.data?.ids ?? []), [matches.data]);
  return { runs, run, map, clusters, tree, filters, matches, ids, valid };
}
