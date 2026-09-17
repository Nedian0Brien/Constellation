import type { MapData, ClusterInfo } from "../../api";
export const spectrum: [number, number, number][] = [
  [183, 164, 255],
  [134, 217, 240],
  [242, 203, 141],
  [141, 223, 193],
  [242, 167, 213],
  [167, 187, 255],
];
export function clusterColor(id: number): [number, number, number] {
  return id < 0 ? [130, 131, 142] : spectrum[id % spectrum.length];
}
export function regionTexture(map: MapData, clusters: ClusterInfo[]) {
  if (!clusters.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 768;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const minX = Math.min(...map.x) - 3,
    maxX = Math.max(...map.x) + 3,
    minY = Math.min(...map.y) - 3,
    maxY = Math.max(...map.y) + 3;
  const sx = 768 / (maxX - minX),
    sy = 768 / (maxY - minY);
  for (const c of clusters) {
    let sum = 0,
      n = 0;
    for (let i = 0; i < map.n; i++)
      if (map.cluster[i] === c.cluster_id) {
        sum += (map.x[i] - c.x) ** 2 + (map.y[i] - c.y) ** 2;
        n++;
      }
    const radius = Math.max(0.6, Math.sqrt(sum / Math.max(1, n)) * 1.7),
      x = (c.x - minX) * sx,
      y = (maxY - c.y) * sy;
    const color = clusterColor(c.cluster_id),
      g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(sx, sy) * radius);
    g.addColorStop(0, `rgba(${color.join(",")},0.10)`);
    g.addColorStop(0.45, `rgba(${color.join(",")},0.04)`);
    g.addColorStop(1, `rgba(${color.join(",")},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 768, 768);
  }
  return {
    image: canvas,
    bounds: [minX, minY, maxX, maxY] as [number, number, number, number],
  };
}
