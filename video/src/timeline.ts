// 30초 티저의 장면 경계(프레임, 30fps)와 자막. 영상과 합성 사운드(scripts/sound.mjs)가
// 이 값을 같이 읽는다 — 효과음이 장면 전환에 맞는다.
export const FPS = 30;
export const DURATION = 900;

export const SCENES = {
  growth: [0, 120], // 연도 재생
  overview: [120, 240], // 전체 지도와 상위 분야
  dive: [240, 390], // 분야 → 하위 분야 → RT-1
  cite: [390, 510], // RT-1 인용선
  chat: [510, 720], // 에이전트 채팅
  views: [720, 810], // 계층 트리 · 갈래 흐름 · 인용 계보
  end: [810, 900], // 엔딩 카드
} as const satisfies Record<string, readonly [number, number]>;

export type SceneKey = keyof typeof SCENES;

export const CAPTIONS: Record<SceneKey, string> = {
  growth: "2014–2026 · 논문 16,554편",
  overview: "분야 전체를 한 화면에",
  dive: "분야에서 논문 한 편까지",
  cite: "무엇을 인용했고, 누가 인용했는지",
  chat: "물으면 지도가 움직인다",
  views: "계층 트리 · 갈래 흐름 · 인용 계보",
  end: "논문과 인용으로 연구 분야를 읽는 지도",
};

// 초점 논문: RT-1(코퍼스 안 피인용 135, 참조 34).
export const FOCUS_PAPER = "openalex:W4385430679";
// 줌인할 상위 분야: Robot Learning(피지컬 AI 코퍼스 트리 노드 140).
export const FOCUS_FIELD = "n140";
