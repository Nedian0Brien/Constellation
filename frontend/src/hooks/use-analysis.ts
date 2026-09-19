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
  // 목록(정렬·페이지)은 서버가 거르므로 연도까지 보낸다.
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
  // 검색어 일치 id는 서버에서(두 글자 이상일 때만). 연도는 지도 데이터에 있으니
  // 클라이언트에서 거른다 — 슬라이더·재생 중에 요청이 나가지 않는다.
  const search = useMemo(
    () => ({ run: run ?? "", q: state.q }),
    [run, state.q],
  );
  const matches = useQuery({
    queryKey: ["matches", search],
    queryFn: ({ signal }) => fetchMatches(search, signal),
    enabled: !!run && !!map.data && valid && state.q.length > 0,
  });
  const ids = useMemo(() => {
    const m = map.data;
    if (!m || !valid) return new Set<string>();
    const hit = state.q ? new Set(matches.data?.ids ?? []) : null;
    if (state.q && !matches.data) return new Set<string>();
    const out = new Set<string>();
    for (let i = 0; i < m.n; i++) {
      const y = m.year[i];
      if (
        y !== null &&
        ((state.from !== undefined && y < state.from) ||
          (state.to !== undefined && y > state.to))
      )
        continue;
      if (hit && !hit.has(m.id[i])) continue;
      out.add(m.id[i]);
    }
    return out;
  }, [map.data, valid, state.q, state.from, state.to, matches.data]);
  // 지금 필터(검색어·연도)에 드는 논문 수. 검색어 응답을 기다리는 동안은 없음.
  const count = state.q && !matches.data ? undefined : ids.size;
  return {
    runs,
    run,
    map,
    clusters,
    tree,
    filters,
    matches,
    ids,
    count,
    valid,
  };
}
