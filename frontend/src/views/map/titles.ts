import type { MapData } from "../../api";
import { truncateTitle } from "./labels";
import {
  TITLE_GAP_X,
  TITLE_MAX_WIDTH,
  TITLE_OFFSET_X,
  TITLE_PADDING,
  VALUE_GAP,
  type TitleTypography,
} from "./style";

// TextLayer의 글꼴 아틀라스에 넣을 글자. 제목에 나오는 글자 전부와 말줄임표(133자).
// 'auto'로 두면 새 글자가 화면에 들어올 때마다 아틀라스를 다시 만든다.
export function titleCharacterSet(map: MapData): string {
  return [...new Set(map.title.join("").toUpperCase() + "0123456789…")].join(
    "",
  );
}

// 글자 폭 표로 글 폭을 잰다. TextLayer는 글자마다 잰 폭을 더해 글을 놓으므로(커닝
// 없음) 이 합이 실제 그려지는 폭이다. 제목 상자 폭과 말줄임이 모두 이 표를 쓴다.
export function titleMeasure(
  characterSet: string,
  typo: TitleTypography,
): (text: string) => number {
  const table = new Map<string, number>();
  for (const ch of characterSet) table.set(ch, typo.measureChar(ch));
  const missing = typo.measureChar("M");
  return (text: string) => {
    let w = 0;
    for (const ch of text) w += table.get(ch) ?? missing;
    return w;
  };
}

export interface TitleMetrics {
  /** 한 줄로 줄인 대문자 제목(`…`). */
  displays: string[];
  /** 제목 뒤에 붙는 값(연도). 없으면 빈 문자열. */
  values: string[];
  /** 값의 가로 픽셀 오프셋: 제목 오프셋 + 제목 폭 + 간격. */
  valueDx: number[];
  /** 겹침 계산용 상자 폭(점 중심 대칭: 오른쪽 라벨 끝까지의 두 배). */
  widths: number[];
}

// 제목 상자 폭과 한 줄로 줄인 제목. 지도마다 한 번(1만 편에 약 70ms). 필터가
// 바뀌어도 다시 재지 않는다.
export function titleMetrics(
  map: MapData,
  measure: (text: string) => number,
): TitleMetrics {
  const displays = map.title.map((t) =>
    truncateTitle(measure, t.toUpperCase(), TITLE_MAX_WIDTH - TITLE_PADDING),
  );
  const values = map.year.map((y) => (y === null ? "" : String(y)));
  const valueDx = displays.map((d) => TITLE_OFFSET_X + measure(d) + VALUE_GAP);
  const widths = displays.map(
    (_, i) =>
      2 * (valueDx[i] + measure(values[i]) + TITLE_PADDING / 2) + TITLE_GAP_X,
  );
  return { displays, values, valueDx, widths };
}
