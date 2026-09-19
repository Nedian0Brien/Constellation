import { create } from "zustand";
import type { LabelLevel } from "./views/map/labels";
export type { ColorBy, View } from "./app/navigation";
export interface Camera {
  target: [number, number, number];
  zoom: number;
  rotationX?: number;
  rotationOrbit?: number;
}
// 에이전트 도구가 지도에 내리는 카메라 요청. MapView가 자기 run의 것만
// 소비하고 nonce로 한 번만 움직인다. level은 라벨 단계로 절대 줌을 정하고,
// steps는 현재 줌에서 상대적으로 움직인다.
export interface CameraRequest {
  run: string;
  nonce: number;
  target?: [number, number, number];
  level?: LabelLevel;
  steps?: number;
}
// 에이전트가 지도에 얹는 주석. 좌표는 도구가 해석해 두므로 MapView는
// 투영만 한다. 세션 안에서만 살고 저장하지 않는다.
export interface Annotation {
  id: string;
  kind: "paper" | "cluster" | "point";
  ref?: string | number;
  x: number;
  y: number;
  label: string;
}
interface LocalState {
  cameras: Record<string, Camera>;
  setCamera: (key: string, value: Camera) => void;
  mapLevel: LabelLevel;
  setMapLevel: (level: LabelLevel) => void;
  cameraRequest: CameraRequest | null;
  requestCamera: (request: Omit<CameraRequest, "nonce">) => void;
  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  // 논문 상세 Dialog. 선택(URL)은 지도의 선택 모드를 뜻하고, Dialog는 버튼으로만 연다.
  detailOpen: boolean;
  setDetailOpen: (open: boolean) => void;
  // "AI에게 질문하기". AppShell이 채팅을 열고 AgentSidebar가 입력창에 포커스를 둔다.
  chatRequest: number;
  requestChat: () => void;
}
// Server data belongs to Query; navigation belongs to the URL. These values live only in this session.
export const useStore = create<LocalState>((set) => ({
  cameras: {},
  setCamera: (key, value) =>
    set((s) => ({ cameras: { ...s.cameras, [key]: value } })),
  mapLevel: "field",
  setMapLevel: (mapLevel) => set({ mapLevel }),
  cameraRequest: null,
  requestCamera: (request) =>
    set((s) => ({
      cameraRequest: { ...request, nonce: (s.cameraRequest?.nonce ?? 0) + 1 },
    })),
  annotations: [],
  setAnnotations: (annotations) => set({ annotations }),
  detailOpen: false,
  setDetailOpen: (detailOpen) => set({ detailOpen }),
  chatRequest: 0,
  requestChat: () => set((s) => ({ chatRequest: s.chatRequest + 1 })),
}));
