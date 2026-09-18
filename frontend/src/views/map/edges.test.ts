import { describe, expect, it } from "vitest";
import { citationIndex, degreeOf, dotScale, linksOf } from "./edges";

describe("citationIndex", () => {
  it("builds both directions of every edge", () => {
    // 1→0, 2→0, 2→3 (인덱스). 0의 이웃은 1·2(둘 다 피인용), 2의 이웃은 0·3(둘 다 참조).
    const index = citationIndex(4, [1, 2, 2], [0, 0, 3])!;
    expect(index).not.toBeNull();
    expect(linksOf(index, 0)).toEqual([
      { j: 1, incoming: true },
      { j: 2, incoming: true },
    ]);
    expect(linksOf(index, 2)).toEqual([
      { j: 0, incoming: false },
      { j: 3, incoming: false },
    ]);
    expect(linksOf(index, 1)).toEqual([{ j: 0, incoming: false }]);
    expect([0, 1, 2, 3].map((i) => degreeOf(index, i))).toEqual([2, 1, 2, 1]);
  });
  it("keeps mutual citations as two links", () => {
    const index = citationIndex(2, [0, 1], [1, 0])!;
    expect(linksOf(index, 0)).toEqual([
      { j: 1, incoming: false },
      { j: 1, incoming: true },
    ]);
  });
  it("refuses mismatched or out-of-range data", () => {
    expect(citationIndex(3, [0, 1], [1])).toBeNull();
    expect(citationIndex(3, [0, 3], [1, 0])).toBeNull();
    expect(citationIndex(3, [0, -1], [1, 0])).toBeNull();
    expect(citationIndex(3, [1], [1])).toBeNull();
    expect(citationIndex(3, [], [])).not.toBeNull();
  });
});

describe("dotScale", () => {
  it("grows from 1 at home to 3 at five steps and stays there", () => {
    expect(dotScale(0)).toBe(1);
    expect(dotScale(2.5)).toBe(2);
    expect(dotScale(5)).toBe(3);
    expect(dotScale(8)).toBe(3);
    expect(dotScale(-2)).toBe(1);
  });
});
