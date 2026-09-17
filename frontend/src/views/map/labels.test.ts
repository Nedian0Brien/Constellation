import { describe, it, expect } from "vitest";
import {
  descendants,
  labelLevel,
  visibleTitles,
  paperLabelOpacity,
  clampRegionLabel,
  regionRadii,
  PAPER_LABEL_ZOOM,
} from "./labels";
import type { TreeData, MapData, ClusterInfo } from "../../api";
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
describe("region persistence and zoom ramp", () => {
  it("ramps paper label opacity with zoom instead of switching", () => {
    expect(paperLabelOpacity(PAPER_LABEL_ZOOM - 0.5)).toBe(0);
    expect(paperLabelOpacity(PAPER_LABEL_ZOOM)).toBeCloseTo(0.5);
    expect(paperLabelOpacity(PAPER_LABEL_ZOOM + 0.5)).toBe(1);
    expect(paperLabelOpacity(9)).toBe(1);
  });
  it("clamps a region label into the viewport", () => {
    expect(clampRegionLabel(-300, 20, 100, 23, 800, 600)).toEqual([66, 66.5]);
    expect(clampRegionLabel(400, 900, 100, 23, 800, 600)).toEqual([
      400, 513.5,
    ]);
  });
  it("measures a region radius from its members", () => {
    const map = {
      n: 4,
      x: [0, 1, 0, 5],
      y: [0, 0, 2, 5],
      cluster: [0, 0, 0, 1],
    } as unknown as MapData;
    const radii = regionRadii(map, null, [
      { cluster_id: 0, x: 0, y: 0 } as ClusterInfo,
      { cluster_id: 1, x: 5, y: 5 } as ClusterInfo,
    ]);
    expect(radii.get("c0")).toBe(2);
    expect(radii.get("c1")).toBe(0);
  });
});
