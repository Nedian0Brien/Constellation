import { create } from "zustand";
import type { ClusterInfo, MapData, RunInfo } from "./api";

export type ColorBy = "cluster" | "year" | "cited" | "abstract";

interface State {
  map: MapData | null;
  runs: RunInfo[];
  currentRun: string | null;
  clusters: ClusterInfo[];
  selectedCluster: number | null;
  loading: boolean;
  error: string | null;

  colorBy: ColorBy;
  yearRange: [number, number];
  yearBounds: [number, number];
  selected: string | null;
  hovered: number | null;
  highlighted: Set<string>;

  setMap: (m: MapData) => void;
  setRuns: (r: RunInfo[]) => void;
  setClusters: (c: ClusterInfo[]) => void;
  selectCluster: (id: number | null) => void;
  setRun: (id: string) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setColorBy: (c: ColorBy) => void;
  setYearRange: (r: [number, number]) => void;
  select: (id: string | null) => void;
  hover: (i: number | null) => void;
  setHighlighted: (ids: string[]) => void;
}

export const useStore = create<State>((set) => ({
  map: null,
  runs: [],
  currentRun: null,
  clusters: [],
  selectedCluster: null,
  loading: true,
  error: null,

  colorBy: "cluster",
  yearRange: [1945, 2026],
  yearBounds: [1945, 2026],
  selected: null,
  hovered: null,
  highlighted: new Set(),

  setMap: (m) => {
    const years = m.year.filter((y): y is number => y != null);
    const lo = years.length ? Math.min(...years) : 1945;
    const hi = years.length ? Math.max(...years) : 2026;
    set({
      map: m, currentRun: m.run_id,
      yearBounds: [lo, hi], yearRange: [lo, hi],
      loading: false, selected: null, selectedCluster: null,
    });
  },
  setRuns: (r) => set({ runs: r }),
  setClusters: (c) => set({ clusters: c }),
  selectCluster: (id) => set({ selectedCluster: id, selected: null }),
  setRun: (id) => set({ currentRun: id, loading: true, selected: null }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e, loading: false }),
  setColorBy: (c) => set({ colorBy: c }),
  setYearRange: (r) => set({ yearRange: r }),
  select: (id) => set({ selected: id }),
  hover: (i) => set({ hovered: i }),
  setHighlighted: (ids) => set({ highlighted: new Set(ids) }),
}));
