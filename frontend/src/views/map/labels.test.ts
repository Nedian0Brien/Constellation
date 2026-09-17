import { describe, it, expect } from "vitest";
import {
  descendants,
  labelLevel,
  visibleTitles,
  PAPER_LABEL_ZOOM,
} from "./labels";
import type { TreeData } from "../../api";
describe("semantic map labels", () => {
  it("selects hierarchy and paper scales", () => {
    expect(labelLevel(0.9)).toBe("field");
    expect(labelLevel(1)).toBe("topic");
    expect(labelLevel(PAPER_LABEL_ZOOM - 0.1)).toBe("topic");
    expect(labelLevel(PAPER_LABEL_ZOOM)).toBe("paper");
  });
  it("traverses a hierarchy including sparse IDs without looping", () => {
    const tree = {
      nodes: [
        { id: 10, left: 7, right: 40, cluster_id: null },
        { id: 7, left: null, right: null, cluster_id: 2 },
        { id: 40, left: 10, right: null, cluster_id: 9 },
      ],
      levels: {},
    } as TreeData;
    expect([...descendants(tree, 10)].sort()).toEqual([2, 9]);
    expect(descendants(tree, 100).size).toBe(0);
  });
  it("keeps every on-screen title in order, overlapping or not, and drops offscreen ones", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      id: `p${i}`,
      text: "Same spot",
      x: 200,
      y: 100,
    }));
    const labels = visibleTitles(
      [
        ...many,
        { id: "far", text: "Offscreen", x: -200, y: 100 },
        { id: "edge", text: "Just past the edge", x: 700, y: 100 },
        { id: "below", text: "Below", x: 200, y: 500 },
      ],
      600,
      400,
    );
    expect(labels.length).toBe(151);
    expect(labels.slice(0, 3).map((l) => l.id)).toEqual(["p0", "p1", "p2"]);
    expect(labels.at(-1)?.id).toBe("edge");
  });
});
