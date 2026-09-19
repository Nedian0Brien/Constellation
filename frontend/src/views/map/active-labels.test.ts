import { describe, expect, it } from "vitest";
import { placeLabels, type LabelBox } from "./active-labels";

const box = (x: number, y: number, w = 100, h = 24): LabelBox => ({
  x,
  y,
  w,
  h,
});

describe("placeLabels", () => {
  it("always places the first candidate and skips overlapping later ones", () => {
    const placed = placeLabels(
      [box(0, 0), box(50, 10), box(200, 0), box(250, 10), box(400, 0)],
      [],
    );
    expect(placed).toEqual([0, 2, 4]);
  });
  it("places the first candidate even over an obstacle, others avoid obstacles", () => {
    const placed = placeLabels(
      [box(0, 0), box(300, 0), box(600, 0)],
      [box(10, 5), box(320, 5)],
    );
    expect(placed).toEqual([0, 2]);
  });
  it("touching edges do not count as overlap", () => {
    expect(placeLabels([box(0, 0), box(100, 0), box(0, 24)], [])).toEqual([
      0, 1, 2,
    ]);
  });
  it("handles boxes that span several grid cells", () => {
    const wide = box(-10, -10, 500, 100);
    expect(placeLabels([wide, box(300, 40), box(600, 40)], [])).toEqual([0, 2]);
  });
});
