import type { MapData, ClusterInfo } from "../../api";
// 레퍼런스(Starfield 갤럭시 맵)의 채도 높은 여섯 색. 초록·노랑·하늘·주황·빨강·보라.
// 바탕 #0c1118 위 대비는 unverified — 프로토타입.
export const spectrum: [number, number, number][] = [
  [96, 214, 96],
  [232, 196, 88],
  [126, 178, 214],
  [236, 142, 46],
  [230, 72, 62],
  [178, 150, 255],
];
// 피인용 모드의 서열 색: 레퍼런스의 레벨 색 순서(초록 → 노랑 → 하늘 → 주황 → 빨강).
// 적록 색각 이상에 불리하다 — 레퍼런스의 선택을 그대로 옮긴 것이고 여기서 고치지 않는다.
export const ordinal: [number, number, number][] = [
  [96, 214, 96],
  [232, 196, 88],
  [126, 178, 214],
  [236, 142, 46],
  [230, 72, 62],
];
export function ordinalColor(v: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, v)) * (ordinal.length - 1),
    k = Math.min(ordinal.length - 2, Math.floor(t)),
    f = t - k;
  return ordinal[k].map((c, i) =>
    Math.round(c + (ordinal[k + 1][i] - c) * f),
  ) as [number, number, number];
}
export function clusterColor(id: number): [number, number, number] {
  return id < 0 ? [130, 131, 142] : spectrum[id % spectrum.length];
}
// 영역 배경 하나: 중심·반지름(소속 논문 거리의 RMS × 1.7, 최소 0.6 단위)·색. 그리는
// 쪽(`RegionGradientExtension`)이 중심 0.10 → 반지름의 45%에서 0.04 → 가장자리 0으로
// 옅어지는 원을 GPU에서 픽셀마다 계산한다. 예전에는 768px 캔버스에 그려 텍스처로
// 붙였는데, 지도 전체를 768픽셀로 덮으니 확대하면 텍셀 하나가 100픽셀이 넘어 흐리고
// 각졌다.
export interface RegionBlob {
  id: number;
  position: [number, number];
  radius: number;
  color: [number, number, number];
}
export function regionBlobs(
  map: MapData,
  clusters: ClusterInfo[],
): RegionBlob[] {
  return clusters.map((c) => {
    let sum = 0,
      n = 0;
    for (let i = 0; i < map.n; i++)
      if (map.cluster[i] === c.cluster_id) {
        sum += (map.x[i] - c.x) ** 2 + (map.y[i] - c.y) ** 2;
        n++;
      }
    return {
      id: c.cluster_id,
      position: [c.x, c.y],
      radius: Math.max(0.6, Math.sqrt(sum / Math.max(1, n)) * 1.7),
      color: clusterColor(c.cluster_id),
    };
  });
}
