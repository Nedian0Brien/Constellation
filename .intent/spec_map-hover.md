---
title: 확대하면 점이 커지고, 점에 마우스를 올리면 인용 관계가 보이게
slug: map-hover
stage: spec
status: accepted
intent: .intent/intent_map-hover.md
date: 2026-09-18
---

# 확대하면 점이 커지고, 점에 마우스를 올리면 인용 관계가 보이게 — 명세

## 요구사항

- [x] 점 반지름(px) = 지금의 점별 반지름 × `dotScale(Δ)`, `Δ = camera.zoom − home.zoom`, `dotScale = 1 + 2·clamp(Δ/5, 0, 1)`. 기준 배율에서 1배, 3200%에서 3배, 그 위는 3배 고정. 상한 7px(`radiusMaxPixels`; 제목이 점 중심 아래 9px에서 시작한다). 기본 색에서 3200% 이상은 지름 9px — `dataviz` 표식 규격 "Marker ≥ 8px(r ≥ 4)"를 넘는다.
- [x] 선택한 논문의 고리 반지름 = `max(10, 선택한 점의 반지름 px + 5)`. 기준 배율에서 지금과 같다.
- [x] `/api/edges?run=` 과 Tauri 명령 `edges({run})`이 `{run_id, n, citing: number[], cited: number[]}`를 준다. `citing[k]`·`cited[k]`는 `/map` 배열의 인덱스(같은 `ORDER BY work_id`). 자기 인용과 run 밖 논문으로 가는 인용은 뺀다. `(citing, cited)` 오름차순. run에 투영이 없으면 404.
- [x] 프론트는 지도마다 한 번 `edges`를 받아(`useQuery(["edges", run])`) 인접 표(CSR)를 만든다. `n !== map.n`이거나 인덱스가 범위를 벗어나면 표를 만들지 않고 `console.error`를 남긴다(선은 안 그린다).
- [x] 점이나 제목에 마우스를 올리면 `t`가 0 → 1로 240ms ease-out(`useTween`, 동작 줄이기면 즉시). 떠나면 1 → 0. 그동안: 기본 점 레이어 `opacity = 1 − 0.5·t`, 연결선 레이어와 강조 점 레이어 `opacity = t`.
- [x] 연결선은 `LineLayer`, 굵기 2px(`dataviz` 표식 규격 "Line 2px"). 색: 참조(올린 논문 → 이웃) `[57,135,229]`(#3987e5), 피인용(이웃 → 올린 논문) `[230,103,103]`(#e66767). `dataviz` 기준 팔레트의 다크 모드 blue·red 발산 쌍. 지도 바탕 `#0e1319` 위에서 검증기 통과(CVD ΔE 19.2, 정상 시각 ΔE 29.0, 대비 ≥ 3:1).
- [x] 강조 점 레이어는 올린 점(흰색 `[255,255,255,255]`, 지금의 autoHighlight 색)과 이웃(`colors[j]` 그대로 — 필터 밖이면 지금처럼 옅다)을 그린다. 반지름 규칙은 기본 레이어와 같다. 픽킹은 하지 않는다(호버는 기본 레이어·제목 레이어가 낸다).
- [x] 마우스가 떠나 옅어지는 240ms 동안 마지막 호버의 선·강조 점이 남아 있다가 사라진다.
- [x] 이웃이 없는 논문: 선 0개, 올린 점만 강조, 나머지는 옅어진다.
- [x] 확대·이동 비용: 호버 중이 아닐 때 프로덕션 빽빽한 3200% 화면 휠 한 단계 RunTask가 지금(7~9ms)을 넘지 않는다. 호버 중 확대도 같은 자릿수.
- [x] 컨테이너에 `data-hover-id`(올린 논문 id 또는 없음)·`data-hover-links`(그려진 선 수). `__map` 다리에 `degree(id): number`.
- [x] Rust 테스트: 표본 DB에서 `edges("a")` = `n 4, citing [1,2], cited [0,0]`(3→1, 2→1; 1→x-outside는 빠짐), 자기 인용 행은 빠짐, `edges("nope")` 404. Tauri 테스트: `edges({run:"a"})`의 `n`. Vitest: `citationIndex`(CSR 구성, 방향, 범위 검사)·`dotScale`(0·2.5·5·8). E2E: 제목이 켜진 배율에서 이웃이 있는 점에 마우스를 올리면 `data-hover-links > 0`, 떼면 0.

## 설계

- `crates/constellation-core/src/queries/edges.rs`(새) `edges(db, run) -> EdgesData`. `WITH p AS (SELECT work_id, row_number() OVER (ORDER BY work_id) − 1 AS i FROM projections WHERE run_id = ?) SELECT a.i, b.i FROM citations c JOIN p a ON a.work_id = c.citing_id JOIN p b ON b.work_id = c.cited_id WHERE c.citing_id <> c.cited_id ORDER BY 1, 2`. `map.rs`와 같은 `ORDER BY work_id`(같은 DuckDB 정렬). `mod.rs`에 export. `constellation-serve/main.rs`에 `/api/edges`(`required(run)`), `src-tauri/src/commands.rs`·`lib.rs`에 `edges` 명령(목록 끝에).
- `frontend/src/api.ts`: `EdgesData`, `fetchEdges(run)` = `call("edges", "/edges?" + params({run}), {run})`.
- `frontend/src/views/map/edges.ts`(새): `citationIndex(n, citing, cited): CitationIndex | null`(`offsets: Uint32Array(n+1)`, `neighbors: Uint32Array(2E)`, `incoming: Uint8Array(2E)` — 1이면 이웃이 올린 논문을 인용), `linksOf(index, i)`, `dotScale(Δ)`.
- `MapView.tsx`: `useQuery(["edges", map.run_id])` → `index`. `hoverT = useTween(hover ? 1 : 0, LABEL_FADE_MS, reduced)`. `held = hover ?? (hoverT > 0 ? lastHover : null)`(RegionName처럼 이전 렌더의 값을 state에 남긴다). `links = useMemo(linksOf(index, held.i))`. 레이어 순서: soft-regions → papers(`radiusScale: scale`, `radiusMaxPixels: 7`, `opacity: 1 − 0.5·hoverT`) → hover-links(`LineLayer`) → hover-nodes(`ScatterplotLayer`, pickable false) → selected-halo(반지름 계산) → paper-titles. 기존 `getRadius`는 그대로 두고 `radiusScale`만 바꾼다(점별 속성 재계산 없음 — deck 9.3 `scatterplot-layer-vertex.glsl`의 `radiusScale * instanceRadius`, `layer.opacity`는 알파에 선형으로 곱한다).
- 툴팁·클릭·선택 이동은 그대로.

## 버린 대안

- 호버마다 `/citations`를 부르기: 왕복 지연이 매번 생기고 limit 20이라 이웃 최대 408을 못 받는다.
- 점마다 `getRadius`를 배율에 따라 다시 계산: 반 단계마다 1만 개 속성 갱신 + 크기 점프. `radiusScale` uniform 하나로 매끈하고 비용 0.
- 점마다 색 알파를 바꿔 옅게 하기: 호버마다 1만 개 색 속성 갱신. 레이어 `opacity` uniform이면 비용 0.
- 참조·피인용을 한 색으로: 사용자 지시로 두 색.
- 진입 150ms·이탈 100ms(`design-ops` `patterns/motion.md` Implementation defaults: 작은 요소 150, 이탈은 더 짧게): 제품 안의 라벨 페이드·영역 이름 transition이 240ms 대칭이라 그에 맞춘다(83개 표본 중 대칭 진영 12). intent에서 수락된 값.
- 옅어짐 0.3 진영(Audi·Grommet·Kaizen 등, `patterns/color.md` "disabled — it is opacity, not colour", 16개 표본 0.26~0.5): 이 제품의 시스템 shadcn/ui가 `opacity-50`이라 0.5로 시작한다. 다크 바탕에서는 옅어짐을 덜 주는 표본(Ring UI 0.7·Braid 0.6)도 있어 0.5는 강한 쪽이다. 화면에서 보고 바꿀 수 있는 상수 하나.

## 함정

- `colors`는 이미 알파를 품는다(필터 적중 205·아닌 것 18·선택 흰색 255). 레이어 `opacity`는 그 위에 곱해진다.
- 상호 인용 쌍(이 run에 143쌍)은 같은 자리에 선 두 개가 겹친다. 뒤에 그리는 피인용 색이 보인다.
- 실데이터 자기 인용 98건 — 질의에서 뺀다. PK 때문에 중복은 없다.
- E2E의 API는 8000의 기존 바이너리를 재사용한다(`reuseExistingServer`). 새 경로가 없으므로 이 워크트리의 서버를 8010에 띄우고 `CONSTELLATION_API=http://127.0.0.1:8010`으로 Vite 프록시를 돌린다. DB 경로는 절대 경로(`data/`는 워크트리에 없다). DuckDB는 읽기 전용 다중 접속이 된다.
- 다른 워크트리(desktop-app)가 지워져 cargo 캐시가 없다. duckdb 번들 컴파일이 오래 걸린다.
- 호버 중 카메라를 움직이면 deck이 `onHover(null)`을 내지 않을 수 있다 — `hover` 상태는 지금도 그렇게 둔다.
- 8000의 공용 API는 지워진 워크트리(desktop-app)의 바이너리가 그 폴더를 cwd로 잡고 돌던 것이라, 폴더가 사라진 뒤 모든 질의가 "Could not get working directory" 503을 냈다. 죽이고 `.claude/launch.json`의 `constellation-api`(`cargo run -p constellation-serve`, 메인 체크아웃)로 다시 띄웠다.
- 실측(프로덕션, 1440×950 DPR 2, 빽빽한 3200% 화면, main과 번갈아 3회): 휠 한 단계 RunTask main 9.9~12.1ms · 이 브랜치 10.2~12.4ms — 회차 간 잡음(±1ms) 안. 호버 중(이웃 35편) 휠 7.9~8.2ms·이동 1.9~2.1ms. 처음엔 빈 호버 레이어 둘을 늘 두었는데, 올린 것이 없으면 레이어를 아예 빼도록 바꿨다.
- 브라우저 패널의 합성 `PointerEvent`로는 deck 호버가 안 잡힌다. 패널의 실제 `hover` 동작(좌표는 CSS × 800/1024)이나 Playwright `mouse.move`를 쓴다.
- prettier가 프로젝트 의존성이 아니라 `npx`로 받아 쓴다. 파일 전체에 돌리면 손대지 않은 긴 줄(api.ts의 `fetchClusters`, E2E의 에이전트 채팅 검사)까지 접으므로 내가 바꾼 줄만 남기고 되돌렸다.
- `ScatterplotLayer` `radiusMaxPixels`는 픽셀 상한이라 피인용 색의 큰 점은 264%(4.5×1.56 = 7)부터 7px에 걸린다. 제목과 겹치지 않는 값이 우선이다.

## 완료 기준

```sh
cargo test -p constellation-core                          # edges 테스트 포함 통과
cargo test -p constellation-app                            # Tauri 명령 edges 통과
cd frontend && npm run test -- --run && npm run lint && npm run build
CONSTELLATION_API=http://127.0.0.1:8010 npm run test:e2e   # 10/10
```

브라우저: 100%에서 점 크기 그대로, 3200% 이상에서 지름 9px. 점에 올리면 파란(참조)·붉은(피인용) 선이 240ms에 걸쳐 나타나고 나머지 점이 절반으로 옅어진다. 떼면 되돌아온다.
