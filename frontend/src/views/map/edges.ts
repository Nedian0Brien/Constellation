// 마우스를 올린 논문의 인용 이웃을 바로 찾기 위한 인접 표. `/edges`가 주는 인덱스 쌍을
// CSR로 묶는다 — 논문 i의 이웃은 `neighbors[offsets[i] .. offsets[i+1])`, 같은 자리의
// `incoming`이 1이면 그 이웃이 i를 인용한 것(피인용), 0이면 i가 그 이웃을 인용한 것(참조).
export interface CitationIndex {
  offsets: Uint32Array;
  neighbors: Uint32Array;
  incoming: Uint8Array;
}
export interface Link {
  j: number;
  incoming: boolean;
}
// 쌍의 길이가 다르거나 인덱스가 n을 벗어나면 표를 만들지 않는다 — 어긋난 자료로 엉뚱한
// 선을 긋느니 안 긋는다.
export function citationIndex(
  n: number,
  citing: ArrayLike<number>,
  cited: ArrayLike<number>,
): CitationIndex | null {
  const e = citing.length;
  if (cited.length !== e) return null;
  const degree = new Uint32Array(n + 1);
  for (let k = 0; k < e; k++) {
    const a = citing[k],
      b = cited[k];
    if (!(a >= 0 && a < n && b >= 0 && b < n) || a === b) return null;
    degree[a + 1]++;
    degree[b + 1]++;
  }
  const offsets = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i + 1];
  const neighbors = new Uint32Array(offsets[n]),
    incoming = new Uint8Array(offsets[n]),
    fill = new Uint32Array(n);
  for (let k = 0; k < e; k++) {
    const a = citing[k],
      b = cited[k];
    const ka = offsets[a] + fill[a]++,
      kb = offsets[b] + fill[b]++;
    neighbors[ka] = b;
    neighbors[kb] = a;
    incoming[kb] = 1;
  }
  return { offsets, neighbors, incoming };
}
export function degreeOf(index: CitationIndex, i: number): number {
  return index.offsets[i + 1] - index.offsets[i];
}
export function linksOf(index: CitationIndex, i: number): Link[] {
  const out: Link[] = [];
  for (let k = index.offsets[i]; k < index.offsets[i + 1]; k++)
    out.push({ j: index.neighbors[k], incoming: index.incoming[k] === 1 });
  return out;
}
// 점 반지름 배수. 기준 배율에서 1, 다섯 단계(3200%) 위에서 3, 그 위는 3 고정. 점마다
// 반지름을 다시 재지 않고 레이어의 `radiusScale` 하나로 곱한다.
export const DOT_SCALE_MAX = 3,
  DOT_SCALE_ZOOM = 5;
export function dotScale(relativeZoom: number): number {
  const t = Math.min(1, Math.max(0, relativeZoom / DOT_SCALE_ZOOM));
  return 1 + (DOT_SCALE_MAX - 1) * t;
}
