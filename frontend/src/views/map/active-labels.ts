// 활성 노드(강조 노드와 그 인용 이웃)의 제목을 화면에서 겹치지 않게 고른다.
// 첫 후보(강조 노드)는 항상 놓고, 나머지는 준 순서(피인용수 내림차순)대로 이미 놓인
// 상자 — 앞선 활성 라벨과 장애물(켜져 있는 지도 제목) — 와 겹치지 않을 때만 놓는다.
// 겹침 검사는 64px 격자로 한다. 후보가 수천이어도 O(k)다.
export interface LabelBox {
  x: number; // 상자 왼쪽
  y: number; // 상자 위
  w: number;
  h: number;
}
const CELL = 64;
class Grid {
  private cells = new Map<string, LabelBox[]>();
  private key(cx: number, cy: number) {
    return cx + ":" + cy;
  }
  private range(b: LabelBox) {
    return [
      Math.floor(b.x / CELL),
      Math.floor(b.y / CELL),
      Math.floor((b.x + b.w) / CELL),
      Math.floor((b.y + b.h) / CELL),
    ];
  }
  hits(b: LabelBox): boolean {
    const [x0, y0, x1, y1] = this.range(b);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++)
        for (const o of this.cells.get(this.key(cx, cy)) ?? [])
          if (
            b.x < o.x + o.w &&
            o.x < b.x + b.w &&
            b.y < o.y + o.h &&
            o.y < b.y + b.h
          )
            return true;
    return false;
  }
  add(b: LabelBox) {
    const [x0, y0, x1, y1] = this.range(b);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(b);
        else this.cells.set(k, [b]);
      }
  }
}
/** 놓인 후보의 인덱스(입력 배열 기준)를 입력 순서대로 돌려준다. */
export function placeLabels(
  candidates: LabelBox[],
  obstacles: LabelBox[],
): number[] {
  const grid = new Grid();
  for (const o of obstacles) grid.add(o);
  const placed: number[] = [];
  candidates.forEach((b, k) => {
    if (k > 0 && grid.hits(b)) return;
    grid.add(b);
    placed.push(k);
  });
  return placed;
}
