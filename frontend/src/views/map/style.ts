import type { TextLayerProps } from "@deck.gl/layers";
import { MAX_ROWS } from "./labels";
// 연구 지도의 시각 규격. 점·인용선·제목의 치수와 색, 제목 글꼴 아틀라스. MapView와
// 홍보 영상(video/)이 같은 값으로 그리도록 여기 하나에 둔다.
// 라벨이 켜지고 꺼지는 시간. `.region-name`의 transition과 같다. 호버 연결선과
// 옅어짐도 같은 시간에 맞춘다.
export const LABEL_FADE_MS = 240;
// 점 반지름의 픽셀 상한. 제목이 점 중심 아래 9px에서 시작하므로 그 안에 둔다. 선택한
// 논문의 고리는 점보다 5px 밖, 기준 배율에서는 지금처럼 10px.
export const DOT_RADIUS_MAX = 7,
  HALO_GAP = 5,
  HALO_MIN = 10;
// 레퍼런스 시각 언어(프로토타입). 영역 블롭은 두고, 점은 기본 1.5px에 상위 피인용 논문만
// 크게(3px) 흰 테두리로 강조한다. 강조 문턱은 피인용수 98분위.
export const SHOW_REGION_BLOBS = true as boolean,
  DOT_RADIUS = 1.5,
  DOT_RADIUS_TOP = 3,
  TOP_CITED_QUANTILE = 0.98;
// 마우스를 올린 논문의 인용 관계. 참조(올린 논문 → 이웃)는 파랑, 피인용(이웃 → 올린
// 논문)은 빨강 — dataviz 기준 팔레트의 다크 모드 발산 쌍(#3987e5·#e66767)으로, 지도
// 바탕 #0e1319 위에서 검증기를 통과한다(CVD ΔE 19.2, 정상 시각 29.0, 대비 3:1 이상).
// 굵기 2px는 같은 규격의 선 표식. 나머지 점은 절반으로 옅어진다(shadcn `opacity-50`).
export const LINK_OUT: [number, number, number] = [57, 135, 229],
  LINK_IN: [number, number, number] = [230, 103, 103],
  LINK_WIDTH = 2,
  HOVER_DIM = 0.5;
// 로컬 그래프에서 선택 노드에 닿지 않는 선(이웃끼리의 인용). `--ink-soft` #93a3b4, 1px, 옅게.
export const LINK_FAR: [number, number, number, number] = [147, 163, 180, 110],
  LINK_FAR_WIDTH = 1;
// 강조가 켜지면 연결선이 강조 노드에서 이웃으로 초당 이만큼(화면 픽셀) 일정한 속도로
// 뻗어 나온다 — 가까운 이웃에 먼저 닿는다. 이웃의 점·라벨은 선이 닿은 순간부터 240ms
// 페이드인(앞머리가 그 뒤로 `LINK_SPEED × 0.24s`만큼 더 나아가는 동안). 꺼지면 선과
// 라벨이 그 자리에서 240ms 페이드아웃한다.
export const LINK_SPEED = 1200,
  LINK_FADE_PX = (LINK_SPEED * LABEL_FADE_MS) / 1000;
// 논문 제목 상자. 본문 글꼴 11px, 220px 최대 폭(안쪽 여백 2px 4px를 뺀 212px에
// 글자), 이웃과의 간격은 가로 8px·세로 4px(간격 스케일 4·8). 높이는 쌓을 때의 줄
// 간격이기도 하다. 글자는 점 아래 9px(위 여백 7 + 안쪽 2)에서 시작한다.
// 프로토타입: 10px 대문자 모노, 자간 0.8px, 점 오른쪽(점 상한 반지름 + 6px)에 왼쪽
// 정렬, 세로는 점 중심. 제목 뒤 5px에 점 색으로 연도. 줄 간격 16px.
// 겹침 계산(`revealZooms`·`placeLabels`)은 점 중심의 상자를 전제하므로 상자 폭을
// 2·(오프셋 + 제목 + 연도)로 넣어 오른쪽 라벨을 안에 가둔다 — 안전하지만 같은 배율에서
// 켜지는 제목이 준다.
export const TITLE_FONT_SIZE = 10,
  TITLE_TRACKING = 0.8,
  TITLE_MAX_WIDTH = 240,
  TITLE_PADDING = 8,
  TITLE_GAP_X = 8,
  TITLE_HEIGHT = 16,
  TITLE_OFFSET_X = DOT_RADIUS_MAX + 6,
  VALUE_GAP = 5,
  // 화면 밖이어도 이만큼 안이면 그린다: 가로는 라벨 전체 폭, 세로는 쌓인 줄까지.
  TITLE_MARGIN_X = TITLE_OFFSET_X + TITLE_MAX_WIDTH + 60,
  TITLE_MARGIN_Y = TITLE_HEIGHT * (MAX_ROWS + 1),
  // 제목 배열을 다시 만드는 카메라 칸: 중심 240px, 배율 반 단계. `titles` 참고.
  TITLE_TILE = 240,
  TITLE_ZOOM_STEP = 0.5;
// 기준 배율 위로 확대할 수 있는 단계. 25600%.
export const ZOOM_RANGE = 8;
// 제목 글꼴·색. 본문의 글꼴 문자열과 글자색을 한 번 읽는다 — 글자 폭 재기와
// TextLayer(글꼴 아틀라스)가 같은 글꼴을 쓴다. 테마 변수가 oklch라 색은 캔버스에
// 넣었다 꺼내 sRGB로 읽는다. 캔버스가 없으면 글자 수로 어림한다.
export type RGB = [number, number, number];
export interface TitleTypography {
  fontFamily: string;
  color: RGB;
  measureChar: (char: string) => number;
}
export function titleTypography(): TitleTypography {
  const ctx =
    typeof document === "undefined"
      ? null
      : document.createElement("canvas").getContext("2d");
  // 실측 기본값: 어두운 테마의 글자색(#e8e8ec)과 본문 글꼴.
  const fallback: TitleTypography = {
    fontFamily: "monospace",
    color: [232, 232, 236],
    measureChar: () => 6 + TITLE_TRACKING,
  };
  if (!ctx) return fallback;
  const style = getComputedStyle(document.body);
  const mono = style.getPropertyValue("--font-mono").trim() || "monospace";
  const rgb = (css: string, or: RGB): RGB => {
    ctx.fillStyle = css;
    const hex = ctx.fillStyle;
    return /^#[0-9a-f]{6}$/i.test(hex)
      ? ([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB)
      : or;
  };
  ctx.font = `${TITLE_FONT_SIZE}px ${mono}`;
  return {
    fontFamily: mono,
    color: rgb(style.color, fallback.color),
    measureChar: (char) => ctx.measureText(char).width + TITLE_TRACKING,
  };
}
// 글꼴 아틀라스의 글리프를 DOM과 같은 래스터로 만든다. deck 기본 방식은 아틀라스
// 크기(여기서는 22px)의 글꼴을 그려 절반으로 줄이는 셈이라, 시스템 글꼴의 광학
// 크기 때문에 11px 글자보다 4% 좁게 나왔다. 그래서 11px 글꼴을 기기 픽셀 비율만큼
// 키운 캔버스에 그린다. 캔버스 글자는 macOS의 글꼴 다듬기(획 굵히기)를 받아 본문의
// `-webkit-font-smoothing: antialiased`보다 3할 굵어지는데, `textRendering`을
// geometricPrecision으로 두면 같은 잉크 양이 나온다(실측: 같은 제목에서 1644 대
// 2188). 치수는 아틀라스 픽셀(= 기기 픽셀)로 돌려준다. `_getFontRenderer`는 deck
// 9.3의 실험 API다(text-layer.d.ts).
export type FontRenderer = ReturnType<
  NonNullable<TextLayerProps["_getFontRenderer"]>
>;
export function titleFontRenderer(
  fontFamily: string,
  dpr: number,
): FontRenderer {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // 캔버스 크기를 바꾸면 컨텍스트가 초기화되므로 그릴 때마다 다시 잡는다.
  const style = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${TITLE_FONT_SIZE}px ${fontFamily}`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.textRendering = "geometricPrecision";
    ctx.fillStyle = "#fff";
  };
  style();
  const measure = (char?: string) => {
    const m = ctx.measureText(char ?? "A");
    return char === undefined
      ? {
          advance: 0,
          width: 0,
          ascent: Math.ceil(m.fontBoundingBoxAscent * dpr),
          descent: Math.ceil(m.fontBoundingBoxDescent * dpr),
        }
      : {
          advance: (m.width + TITLE_TRACKING) * dpr,
          width: Math.ceil(
            (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) * dpr,
          ),
          ascent: Math.ceil(m.actualBoundingBoxAscent * dpr),
          descent: Math.ceil(m.actualBoundingBoxDescent * dpr),
        };
  };
  return {
    measure,
    draw(char) {
      const g = measure(char),
        left = ctx.measureText(char).actualBoundingBoxLeft,
        pad = Math.ceil(dpr);
      canvas.width = g.width + pad * 2;
      canvas.height = g.ascent + g.descent + pad * 2;
      style();
      ctx.fillText(char, pad / dpr + left, (pad + g.ascent) / dpr);
      return {
        data: ctx.getImageData(0, 0, canvas.width, canvas.height),
        left: pad,
        top: pad,
      };
    },
  };
}
