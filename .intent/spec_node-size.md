---
title: 지도의 점 크기가 어떤 색 모드에서든 피인용수를 보여 주게
slug: node-size
stage: spec
status: accepted
intent: .intent/intent_node-size.md
date: 2026-09-19
---

# 지도의 점 크기가 어떤 색 모드에서든 피인용수를 보여 주게 — 명세

## 요구사항

- [x] 점의 기본 반지름(px, 기준 배율) = `dotRadius(c)` = `DOT_RADIUS_MIN + (DOT_RADIUS_BASE_MAX − DOT_RADIUS_MIN) · clamp(log1p(c) / log1p(DOT_CITED_CAP), 0, 1)^DOT_RADIUS_GAMMA`, `c = map.cited[i]`. 색 모드와 무관하다. 시작값 `DOT_RADIUS_MIN = 1.5`, `DOT_RADIUS_BASE_MAX = 5`, `DOT_CITED_CAP = 10_000`, `DOT_RADIUS_GAMMA = 2`. 이 run에서:

  | 피인용수 | 0 | 1 | 18 (q25) | 28 (q50) | 60 (q75) | 209 (q90) | 1,000 | ≥ 10,000 (189편, 1.8%) |
  |---|---|---|---|---|---|---|---|---|
  | 반지름 px | 1.5 | 1.52 | 1.86 | 1.97 | 2.20 | 2.68 | 3.47 | 5.0 |

  중앙값 2.0 · 상위 10% 2.7 · 상위 5%(1,000) 3.5 · 상위 2% 5.0 — 넓이 비 1 : 1.8 : 3.1 : 6.4. 절반의 점은 2px 안쪽에 남아 100%의 빽빽한 영역이 지금보다 크게 두꺼워지지 않는다. `γ = 2`는 로그 정규화 값의 제곱으로, 꼬리를 자른 뒤에도 남는 중간(18~209) 뭉침을 아래로 눌러 상위 10%부터 벌어지게 한다. 화면에서 보고 이 네 상수만 바꾼다.
- [x] `dotScale(Δ)`·`radiusMaxPixels: 7`·`radiusMinPixels: 1.3`은 그대로. 상위 2% 점은 Δ = 1(약 141%)부터 7px에 걸린다.
- [x] 선택 고리 = `max(10, 점 반지름 px + 5)` — 식은 그대로, 5px 점이면 기준 배율에서 10px.
- [x] `papers`·`hover-nodes` 레이어의 `getRadius`는 지도마다 한 번 만든 `radii: Float32Array`를 읽고 `updateTriggers.getRadius = [radii]`. `state.color`가 바뀌어도 반지름 속성을 다시 채우지 않는다.
- [x] 각주: 모든 모드에 "점 크기: 피인용수(로그)"가 들어가고, "피인용수" 모드의 문구는 "피인용수 · 색 로그 척도"가 된다.
- [x] `docs/design-system/index.html` "논문의 크기와 선택" 견본의 코드 라벨과 본문이 "STAR / 3–10 px diameter", "크기는 항상 피인용수를 따른다. log(1 + 인용수)를 10,000에서 잘라 정규화하고 제곱해 3–10px로 놓는다. 최소 크기 3px" 로 바뀐다. 견본 점은 3·5·10px. `README.md`의 변경 이력에 한 줄.
- [x] Vitest `dotRadius`: 0 → 1.5, 10,000 이상 → 5, 단조 증가, 28 ≈ 1.97(소수 둘째 자리).
- [x] 확대·이동 비용은 지금과 같다(빽빽한 3200% 화면 휠 한 단계 RunTask ≤ 12ms).

## 설계

- `frontend/src/views/map/edges.ts`: `dotScale` 옆에 상수 넷과 `dotRadius(cited: number): number`. 순수 함수.
- `MapView.tsx`: `maxLog`는 색 계산(`state.color === "cited"`)에만 남긴다. `radii = useMemo(() => Float32Array.from(map.cited, dotRadius), [map])`. `baseRadius = (p) => radii[p.i]`, `radiusPx`·`haloRadius`는 그대로 `baseRadius`를 거친다. 두 레이어의 `updateTriggers.getRadius`를 `[radii]`로.
- 각주 문자열과 디자인 시스템 문서 문구.

## 버린 대안

- 최대값 정규화 유지(`log1p(c)/log1p(max)`): 최대 353,396 한 편이 범위를 독차지해 상위 10%가 중앙값과 0.5px 차이. intent의 문제 그 자체.
- 순위(백분위) 척도: 18과 60의 차이(둘 다 보통 논문)까지 벌려 잡음을 크기로 바꾼다. 척도가 run마다 달라져 같은 논문이 run에 따라 다르게 보인다.
- 넓이 ∝ 값(`sqrt`): 최대 594px. 꼬리가 긴 분포에는 로그가 필요하다.
- `γ = 1`(로그 선형): 중앙값 2.8 · 상위 10% 3.5 — 절반의 점이 지금 지름의 두 배 가까이 되어 100%에서 빽빽한 영역이 뭉친다. 크기 차이도 상위 10%에서 시작하지 않고 1~18 사이에서 낭비된다.
- 픽셀 상한을 올리고 제목을 내리기: intent 범위 밖.
- 참고한 규격: `dataviz` `references/marks-and-anatomy.md` 표식 표는 "Marker ≥ 8px(r ≥ 4)"만 있고 크기 부호화(버블) 척도는 없다. `design-ops` 코퍼스(`patterns/*.md`)에도 데이터 표식 크기 축은 없다 — 이 값들은 코퍼스가 아니라 위 표의 분포 계산으로 정한 것이다(unverified against any corpus).

## 함정

- `colors`의 `maxLog`는 남긴다 — "피인용수" 색 모드는 여전히 최대값 정규화다(색은 연속 척도라 상한을 자를 이유가 덜하고, intent 범위 밖).
- `radiusMinPixels: 1.3`은 배율 1 미만(축소)에서의 하한. 새 식의 최소 1.5와 별개.
- 큰 점이 늘어나므로 100%에서 호버 픽킹이 큰 점에 더 잘 걸린다 — 의도한 부작용.
- E2E는 반지름을 보지 않는다. `data-*` 속성도 바뀌지 않는다.
- 디자인 시스템 `index.html`은 한 줄짜리 긴 HTML이다. 해당 문자열만 바꾸고 포매터를 돌리지 않는다.

- 화면(개발 서버 5177, API 8000): 100%에서 상위 2% 허브(대개 미분류 회색)가 뚜렷이 크고, 456%에서 큰 점 7px·보통 점 3.7px로 계층이 읽힌다. "연구 주제"와 "피인용수" 색 모드에서 같은 점이 같은 크기다. 2763%(제목 켜짐)에서 큰 점이 7px에 걸려 제목과 겹치지 않는다. 각주에 "· 점 크기: 피인용수(로그)". 시작값 넷은 화면에서 그대로 두었다.
- 확대·이동 비용은 따로 재지 않았다 — 프레임마다 도는 코드는 바뀌지 않았고(반지름 속성은 지도당 한 번, 배율은 uniform), 전 spec의 실측 구조가 그대로다.

## 완료 기준

```sh
cd frontend && npm run test -- --run && npm run lint && npm run build   # 50/50, 경고 없음(손댄 파일), 빌드 통과
E2E_PORT=5177 npm run test:e2e                                      # 12/12 — 호버·클릭 대상 점이 커져도 같은 점을 집는다
```

브라우저(100%, 주제 색): 상위 2% 허브가 지름 10px, 보통 논문은 4px 안팎으로 보인다. 색 모드를 바꿔도 크기가 같다. 3200%에서는 지금과 같이 큰 점 7px·작은 점 4.5px. 각주에 "점 크기: 피인용수(로그)".
