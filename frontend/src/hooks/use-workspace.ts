import { useAnalysis } from "./use-analysis";
import { useExploration } from "./use-exploration";
import type { View } from "../app/navigation";
export function useWorkspace() {
  const a = useAnalysis(),
    { state, update } = useExploration();
  return {
    map: a.map.data ?? null,
    clusters: a.clusters.data ?? [],
    tree: a.tree.data ?? null,
    selected: state.selected ?? null,
    selectedCluster: state.cluster ?? null,
    selectedNode: state.node ?? null,
    colorBy: state.color,
    yearRange: [state.from ?? 0, state.to ?? 9999] as [number, number],
    highlighted: a.ids,
    select: (id: string | null) => update({ selected: id ?? undefined }),
    selectCluster: (id: number | null) =>
      update({
        cluster: id ?? undefined,
        node: undefined,
        selected: undefined,
      }),
    selectNode: (id: number | null) =>
      update({
        node: id ?? undefined,
        cluster: undefined,
        selected: undefined,
      }),
    setView: (view: View) => update({ view }),
  };
}
