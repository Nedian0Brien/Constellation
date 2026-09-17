import { create } from "zustand";
export type { ColorBy, View } from "./app/navigation";
export interface Camera {
  target: [number, number, number];
  zoom: number;
  rotationX?: number;
  rotationOrbit?: number;
}
interface LocalState {
  cameras: Record<string, Camera>;
  setCamera: (key: string, value: Camera) => void;
  detailOpen: boolean;
  setDetailOpen: (open: boolean) => void;
}
// Server data belongs to Query; navigation belongs to the URL. These values live only in this session.
export const useStore = create<LocalState>((set) => ({
  cameras: {},
  setCamera: (key, value) =>
    set((s) => ({ cameras: { ...s.cameras, [key]: value } })),
  detailOpen: true,
  setDetailOpen: (detailOpen) => set({ detailOpen }),
}));
