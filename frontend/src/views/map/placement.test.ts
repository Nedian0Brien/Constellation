import { describe, it, expect } from "vitest";
import { placeRegionLabels, PAPER_LABEL_ZOOM } from "./labels";
import { titleMetrics } from "./titles";
import { TITLE_GAP_X, TITLE_OFFSET_X, TITLE_PADDING, VALUE_GAP } from "./style";
import type { MapData } from "../../api";

// 지도 좌표 = 화면 좌표인 뷰포트.
const identity = {
  project: (p: number[]) => [p[0], p[1]],
  unproject: (p: number[]) => [p[0], p[1]],
};
const size = { width: 800, height: 600 };
const item = (id: string, x: number, y: number, s: number) => ({
  id,
  label: "Dense retrieval",
  x,
  y,
  cluster: undefined,
  node: 0,
  size: s,
});

describe("region label placement", () => {
  it("keeps the larger region when two labels overlap", () => {
    const items = [item("small", 400, 300, 5), item("big", 410, 305, 50)];
    const out = placeRegionLabels(
      items,
      identity,
      size,
      new Map(),
      new Set(["small", "big"]),
      0,
    );
    expect([...out.keys()]).toEqual(["big"]);
  });
  it("skips regions with no drawn papers", () => {
    const out = placeRegionLabels(
      [item("a", 400, 300, 5)],
      identity,
      size,
      new Map(),
      new Set(),
      0,
    );
    expect(out.size).toBe(0);
  });
  it("pins an off-screen region to the edge while the view center is inside it", () => {
    const out = placeRegionLabels(
      [item("a", 1200, 300, 5)],
      identity,
      size,
      new Map([["a", 900]]),
      new Set(["a"]),
      0,
    );
    const [x] = out.get("a")!;
    expect(x).toBeLessThan(size.width);
  });
  it("hides every region label half a step past the paper threshold", () => {
    const out = placeRegionLabels(
      [item("a", 400, 300, 5)],
      identity,
      size,
      new Map(),
      new Set(["a"]),
      PAPER_LABEL_ZOOM + 0.5,
    );
    expect(out.size).toBe(0);
  });
});

describe("title metrics", () => {
  it("measures the title box from the offset, title, gap and year", () => {
    const map = {
      title: ["Dense passage retrieval"],
      year: [2020],
    } as unknown as MapData;
    const measure = (t: string) => t.length * 6;
    const m = titleMetrics(map, measure);
    expect(m.displays).toEqual(["DENSE PASSAGE RETRIEVAL"]);
    expect(m.values).toEqual(["2020"]);
    expect(m.valueDx[0]).toBe(TITLE_OFFSET_X + 23 * 6 + VALUE_GAP);
    expect(m.widths[0]).toBe(
      2 * (m.valueDx[0] + 4 * 6 + TITLE_PADDING / 2) + TITLE_GAP_X,
    );
  });
});
