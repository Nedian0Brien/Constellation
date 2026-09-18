import type { ClusterInfo, MapData } from "../api";
import type { LabelLevel } from "../views/map/labels";
import type { Annotation } from "../store";

/**
 * 라벨 단계 → 홈 줌에 더하는 값. `labelLevel`의 경계(1, 3)를 안쪽으로 조금
 * 넘긴 값이라 그 단계의 라벨이 확실히 보인다.
 */
export const levelOffset: Record<LabelLevel, number> = {
  field: 0,
  topic: 2,
  paper: 3.5,
};

/** 줌 한 단계. 지도 컨트롤의 +/− 버튼과 같은 0.6이다. */
export const zoomStep = 0.6;

export function paperPosition(
  map: MapData,
  id: string,
): { x: number; y: number; title: string } | null {
  const i = map.id.indexOf(id);
  if (i < 0) return null;
  return { x: map.x[i]!, y: map.y[i]!, title: map.title[i]! };
}

export function clusterPosition(
  clusters: ClusterInfo[],
  id: number,
): { x: number; y: number; label: string } | null {
  const c = clusters.find((c) => c.cluster_id === id);
  return c ? { x: c.x, y: c.y, label: c.label } : null;
}

export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export interface AnnotateItem {
  paper_id?: string;
  cluster_id?: number;
  x?: number;
  y?: number;
  label?: string;
}

/**
 * 도구 인자를 주석으로 바꾼다. 못 찾은 항목은 건너뛰고 이름을 돌려줘
 * 모델이 알 수 있게 한다.
 */
export function resolveAnnotations(
  items: AnnotateItem[],
  map: MapData,
  clusters: ClusterInfo[],
): { annotations: Annotation[]; missing: string[] } {
  const annotations: Annotation[] = [];
  const missing: string[] = [];
  items.forEach((item, i) => {
    if (item.paper_id !== undefined) {
      const p = paperPosition(map, item.paper_id);
      if (!p) return missing.push(item.paper_id);
      annotations.push({
        id: `paper:${item.paper_id}`,
        kind: "paper",
        ref: item.paper_id,
        x: p.x,
        y: p.y,
        label: item.label || truncate(p.title, 60),
      });
    } else if (item.cluster_id !== undefined) {
      const c = clusterPosition(clusters, item.cluster_id);
      if (!c) return missing.push(`cluster ${item.cluster_id}`);
      annotations.push({
        id: `cluster:${item.cluster_id}`,
        kind: "cluster",
        ref: item.cluster_id,
        x: c.x,
        y: c.y,
        label: item.label || c.label,
      });
    } else if (item.x !== undefined && item.y !== undefined) {
      annotations.push({
        id: `point:${i}:${item.x},${item.y}`,
        kind: "point",
        x: item.x,
        y: item.y,
        label: item.label || `(${item.x.toFixed(1)}, ${item.y.toFixed(1)})`,
      });
    } else missing.push(`항목 ${i + 1}: paper_id·cluster_id·좌표 중 하나가 필요`);
  });
  return { annotations, missing };
}
