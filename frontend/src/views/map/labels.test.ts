import { describe, it, expect } from "vitest";
import {
  descendants,
  labelLevel,
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
    expect([...r.zoom]).toEqual([-Infinity, -Infinity]);
    expect([...r.row]).toEqual([0, 0]);
  });
  it("makes the lower-priority neighbour wait until the labels separate", () => {
    // 100px 상자 둘이 0.5단위 떨어져 있다: 가로로 떨어지려면 200px/단위 = 2^7.64.
    const r = revealZooms([box(0, 0, 1), box(0.5, 0, 5)], 0, H).zoom;
    expect(r[1]).toBe(-Infinity);
    expect(r[0]).toBeCloseTo(Math.log2(200), 5);
    // 세로로 먼저 떨어지면 그쪽이 이긴다: 24px/0.2단위 = 120px/단위.
    const v = revealZooms([box(0, 0, 1), box(0.5, 0.2, 5)], 0, H).zoom;
    expect(v[0]).toBeCloseTo(Math.log2(120), 5);
  });
  it("ignores separations below the floor and ties by input order", () => {
    expect([...revealZooms([box(0, 0, 1), box(0.5, 0, 1)], 8, H).zoom]).toEqual(
      [-Infinity, -Infinity],
    );
    const r = revealZooms([box(0, 0, 1), box(0.5, 0, 1)], 0, H).zoom;
    expect(r[0]).toBe(-Infinity);
    expect(r[1]).toBeCloseTo(Math.log2(200), 5);
  });
  it("never reveals a label sitting on a higher-priority one without a max zoom", () => {
    const r = revealZooms([box(1, 1, 9), box(1, 1, 3)], 0, H);
    expect([...r.zoom]).toEqual([-Infinity, Infinity]);
    expect(r.unresolved).toBe(1);
  });
  it("shows a label as soon as it has room, even if a bigger neighbour is still blocked", () => {
    // X(0)가 A(0.5)를 2^7.64까지 막는다. B(0.9)는 X와 2^6.80에서 떨어지고 A와는
    // 2^7.97에서 떨어진다. B는 자리가 나는 6.80에서 켜지고, A는 켜진 B와 떨어지는
    // 7.97까지 기다린다 — 피인용이 많아도 먼저 자리를 잡은 쪽이 남는다.
    const r = revealZooms(
      [box(0, 0, 100), box(0.5, 0, 50), box(0.9, 0, 0)],
      0,
      H,
    ).zoom;
    expect(r[0]).toBe(-Infinity);
    expect(r[2]).toBeCloseTo(Math.log2(100 / 0.9), 5);
    expect(r[1]).toBeCloseTo(Math.log2(100 / 0.4), 5);
  });
  it("lets a label appear before a neighbour that is still blocked", () => {
    // k(0) ← j(0.5) ← i(1.0): j는 k와 2^7.64에서 떨어지고, i는 j가 켜질 때 이미
    // 떨어져 있으므로 k와 떨어지는 2^6.64에서 켜진다 — j보다 먼저.
    const r = revealZooms(
      [box(0, 0, 9), box(0.5, 0, 5), box(1, 0, 1)],
      0,
      H,
    ).zoom;
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
    const floor = 4,
      maxZoom = 11;
    const r = revealZooms(boxes, floor, H, maxZoom);
    let prev = new Set<number>();
    for (let z = floor; z <= maxZoom; z += 0.5) {
      const on = new Set<number>();
      boxes.forEach((_, i) => {
        if (Math.max(r.zoom[i], floor) <= z) on.add(i);
      });
      expect([...prev].every((i) => on.has(i))).toBe(true);
      const list = [...on],
        scale = 2 ** z;
      // 줄을 내린 라벨은 세로로 줄 수 × H만큼 아래에 있다.
      const collide = (i: number, j: number, ri = r.row[i]) =>
        Math.abs(boxes[i].x - boxes[j].x) * scale <
          (boxes[i].width + boxes[j].width) / 2 &&
        Math.abs((boxes[i].y - boxes[j].y) * scale + H * (ri - r.row[j])) < H;
      let overlaps = 0,
        hiddenWithRoom = 0;
      for (let a = 0; a < list.length; a++)
        for (let b = a + 1; b < list.length; b++)
          if (collide(list[a], list[b])) overlaps++;
      // 안 켜진 라벨은 점 바로 아래(0줄)로는 켜진 라벨 하나와 반드시 겹친다 —
      // 자리가 있으면 켜진다.
      boxes.forEach((_, i) => {
        if (!on.has(i) && !list.some((j) => collide(i, j, 0))) hiddenWithRoom++;
      });
      expect(overlaps).toBe(0);
      expect(hiddenWithRoom).toBe(0);
      prev = on;
    }
    // 최대 배율 한 단계 아래에서는 전부 켜져 있다.
    expect(prev.size).toBe(boxes.length);
    expect(r.unresolved).toBe(0);
    expect([...r.zoom].filter((z) => z > floor).length).toBeGreaterThan(50);
    expect([...r.row].filter((row) => row > 0).length).toBeGreaterThan(0);
  });
  it("stacks a label under a neighbour it can never leave, by the nearest free row", () => {
    // 같은 자리 둘: 0줄로는 영원히 못 떨어지니 1줄로 내려 바닥에서 켠다.
    const pair = revealZooms([box(1, 1, 9), box(1, 1, 3)], 0, H, 8);
    expect([...pair.zoom]).toEqual([-Infinity, -Infinity]);
    expect([...pair.row]).toEqual([0, 1]);
    // 셋이면 세 줄. 1줄은 앞선 1줄과 같은 자리라 2줄로.
    const three = revealZooms(
      [box(1, 1, 9), box(1, 1, 3), box(1, 1, 1)],
      0,
      H,
      8,
    );
    expect([...three.row]).toEqual([0, 1, 2]);
    expect(three.unresolved).toBe(0);
    // 아래 점의 라벨을 1줄로 내리면 위 점의 0줄과 어떤 배율에서도 안 겹친다.
    const below = revealZooms([box(0, 0, 9), box(0, 0.001, 3)], 0, H, 8);
    expect([...below.row]).toEqual([0, 1]);
    expect(below.zoom[1]).toBe(-Infinity);
    // 위 점의 라벨은 1줄로 내리면 아래 점의 0줄과 두 배(48px)로 벌어져야 하므로
    // 최대 배율(256px/단위)에서 못 벗어난다. 2줄은 겹치는 구간(24000~72000)이
    // 최대 배율 너머라 범위 안에서 안 겹친다.
    const above = revealZooms([box(0, 0.001, 9), box(0, 0, 3)], 0, H, 8);
    expect([...above.row]).toEqual([0, 2]);
    expect(above.zoom[1]).toBe(-Infinity);
    // 최대 배율이 없으면 어떤 줄로도 못 벗어나니 가장 일찍 켜지는 0줄에 둔다.
    const open = revealZooms([box(0, 0.001, 9), box(0, 0, 3)], 0, H);
    expect([...open.row]).toEqual([0, 0]);
    expect(open.zoom[1]).toBeCloseTo(Math.log2(24 / 0.001), 5);
    // 0줄로 최대 배율까지 켜지면 내리지 않는다.
    const fine = revealZooms([box(0, 0, 9), box(0.5, 0, 3)], 0, H, 10);
    expect([...fine.row]).toEqual([0, 0]);
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
