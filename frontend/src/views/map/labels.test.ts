import { describe, it, expect } from "vitest";
import { descendants, labelLevel, avoidCollisions } from "./labels";
import type { TreeData } from "../../api";
describe("semantic map labels", () => {
  it("selects hierarchy and paper scales", () => {
    expect(labelLevel(0.9)).toBe("field");
    expect(labelLevel(1)).toBe("topic");
    expect(labelLevel(3)).toBe("paper");
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
  it("prioritizes the selected paper and suppresses offscreen/overlapping text", () => {
    const labels = avoidCollisions(
      [
        { id: "a", text: "A repeated title", x: 200, y: 100 },
        {
          id: "b",
          text: "Selected research paper",
          x: 200,
          y: 100,
          selected: true,
        },
        { id: "c", text: "Offscreen", x: -50, y: 100 },
      ],
      600,
      400,
    );
    expect(labels.map((l) => l.id)).toEqual(["b"]);
  });
});
