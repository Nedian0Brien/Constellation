import { describe, it, expect } from "vitest";
import {
  descendants,
  labelLevel,
  visibleTitles,
  labelOpacity,
  paperLabelOpacity,
  clampRegionLabel,
  regionRadii,
  revealZooms,
  PAPER_LABEL_ZOOM,
  type LabelBox,
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
    expect(clampRegionLabel(400, 900, 100, 23, 800, 600)).toEqual([400, 513.5]);
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
describe("per-paper reveal zoom", () => {
  const H = 24;
  const box = (
    x: number,
    y: number,
    priority: number,
    width = 100,
  ): LabelBox => ({
    x,
    y,
    width,
    priority,
  });
  it("leaves far-apart labels unconstrained", () => {
    const r = revealZooms([box(0, 0, 1), box(50, 50, 2)], 0, H);
    expect([...r]).toEqual([-Infinity, -Infinity]);
  });
  it("makes the lower-priority neighbour wait until the labels separate", () => {
    // 100px 상자 둘이 0.5단위 떨어져 있다: 가로로 떨어지려면 200px/단위 = 2^7.64.
    const r = revealZooms([box(0, 0, 1), box(0.5, 0, 5)], 0, H);
    expect(r[1]).toBe(-Infinity);
    expect(r[0]).toBeCloseTo(Math.log2(200), 5);
    // 세로로 먼저 떨어지면 그쪽이 이긴다: 24px/0.2단위 = 120px/단위.
    const v = revealZooms([box(0, 0, 1), box(0.5, 0.2, 5)], 0, H);
    expect(v[0]).toBeCloseTo(Math.log2(120), 5);
  });
  it("ignores separations below the floor and ties by input order", () => {
    expect([...revealZooms([box(0, 0, 1), box(0.5, 0, 1)], 8, H)]).toEqual([
      -Infinity,
      -Infinity,
    ]);
    const r = revealZooms([box(0, 0, 1), box(0.5, 0, 1)], 0, H);
    expect(r[0]).toBe(-Infinity);
    expect(r[1]).toBeCloseTo(Math.log2(200), 5);
  });
  it("never reveals a label sitting on a higher-priority one", () => {
    const r = revealZooms([box(1, 1, 9), box(1, 1, 3)], 0, H);
    expect([...r]).toEqual([-Infinity, Infinity]);
  });
  it("shows a label as soon as it has room, even if a bigger neighbour is still blocked", () => {
    // X(0)가 A(0.5)를 2^7.64까지 막는다. B(0.9)는 X와 2^6.80에서 떨어지고 A와는
    // 2^7.97에서 떨어진다. B는 자리가 나는 6.80에서 켜지고, A는 켜진 B와 떨어지는
    // 7.97까지 기다린다 — 피인용이 많아도 먼저 자리를 잡은 쪽이 남는다.
    const r = revealZooms(
      [box(0, 0, 100), box(0.5, 0, 50), box(0.9, 0, 0)],
      0,
      H,
    );
    expect(r[0]).toBe(-Infinity);
    expect(r[2]).toBeCloseTo(Math.log2(100 / 0.9), 5);
    expect(r[1]).toBeCloseTo(Math.log2(100 / 0.4), 5);
  });
  it("lets a label appear before a neighbour that is still blocked", () => {
    // k(0) ← j(0.5) ← i(1.0): j는 k와 2^7.64에서 떨어지고, i는 j가 켜질 때 이미
    // 떨어져 있으므로 k와 떨어지는 2^6.64에서 켜진다 — j보다 먼저.
    const r = revealZooms([box(0, 0, 9), box(0.5, 0, 5), box(1, 0, 1)], 0, H);
    expect(r[1]).toBeCloseTo(Math.log2(200), 5);
    expect(r[2]).toBeCloseTo(Math.log2(100), 5);
  });
  it("is monotone, overlap-free, and hides a label only behind a shown one", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    // 바닥 배율 4(16px/단위)에서 격자 칸은 가로 13.75·세로 1.5단위. 60단위 정사각형에
    // 600개면 칸 경계를 여러 번 넘고, 4단계 위에서도 겹치는 쌍이 남는다.
    const boxes = Array.from({ length: 600 }, () =>
      box(rand() * 60, rand() * 60, Math.floor(rand() * 50), 60 + rand() * 160),
    );
    const floor = 4;
    const r = revealZooms(boxes, floor, H);
    let prev = new Set<number>();
    for (let z = floor; z <= 12; z += 0.5) {
      const on = new Set<number>();
      boxes.forEach((_, i) => {
        if (Math.max(r[i], floor) <= z) on.add(i);
      });
      expect([...prev].every((i) => on.has(i))).toBe(true);
      const list = [...on],
        scale = 2 ** z;
      const collide = (p: LabelBox, q: LabelBox) =>
        Math.abs(p.x - q.x) * scale < (p.width + q.width) / 2 &&
        Math.abs(p.y - q.y) * scale < H;
      let overlaps = 0,
        hiddenWithRoom = 0;
      for (let a = 0; a < list.length; a++)
        for (let b = a + 1; b < list.length; b++)
          if (collide(boxes[list[a]], boxes[list[b]])) overlaps++;
      // 안 켜진 라벨은 켜진 라벨 하나와는 반드시 겹친다 — 자리가 있으면 켜진다.
      boxes.forEach((p, i) => {
        if (!on.has(i) && !list.some((j) => collide(p, boxes[j])))
          hiddenWithRoom++;
      });
      expect(overlaps).toBe(0);
      expect(hiddenWithRoom).toBe(0);
      prev = on;
    }
    expect(prev.size).toBeGreaterThan(500);
    expect([...r].filter((z) => z > floor).length).toBeGreaterThan(50);
  });
  it("fades each label in over one zoom step above its reveal or the floor", () => {
    expect(labelOpacity(5, -Infinity, 4.5)).toBeCloseTo(0.5);
    expect(labelOpacity(5, 6, 4.5)).toBe(0);
    expect(labelOpacity(6.25, 6, 4.5)).toBeCloseTo(0.25);
    expect(labelOpacity(9, 6, 4.5)).toBe(1);
    expect(labelOpacity(3, -Infinity, -Infinity)).toBe(1);
    expect(labelOpacity(9, -Infinity, Infinity)).toBe(0);
  });
});
