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
- [x] 선택한 논문의 고리 반지름 = `max(10, 선택한 점의 반지름 px + 5)`. 기준 배율에서 지금과 같다. (식과 형 검사로만 확인 — 선택은 상세 Dialog를 열고 그 뒤 지도는 블러라 고리를 화면으로 볼 수 없다.)
- [x] `/api/edges?run=` 과 Tauri 명령 `edges({run})`이 `{run_id, n, citing: number[], cited: number[]}`를 준다. `citing[k]`·`cited[k]`는 `/map` 배열의 인덱스(같은 `ORDER BY work_id`). 자기 인용과 run 밖 논문으로 가는 인용은 뺀다. `(citing, cited)` 오름차순. run에 투영이 없으면 404.
- [x] 프론트는 지도마다 한 번 `edges`를 받아(`useQuery(["edges", run])`) 인접 표(CSR)를 만든다. `n !== map.n`이거나 인덱스가 범위를 벗어나면 표를 만들지 않고 `console.error`를 남긴다(선은 안 그린다).
- [x] 점이나 제목에 마우스를 올리면 `t`가 0 → 1로 240ms ease-out(`useTween`, 동작 줄이기면 즉시). 떠나면 1 → 0. 그동안: 기본 점 레이어 `opacity = 1 − 0.5·t`, 연결선 레이어와 강조 점 레이어 `opacity = t`.
- [x] 연결선은 `LineLayer`, 굵기 2px(`dataviz` 표식 규격 "Line 2px"). 색: 참조(올린 논문 → 이웃) `[57,135,229]`(#3987e5), 피인용(이웃 → 올린 논문) `[230,103,103]`(#e66767). `dataviz` 기준 팔레트의 다크 모드 blue·red 발산 쌍. 지도 바탕 `#0e1319` 위에서 검증기 통과(CVD ΔE 19.2, 정상 시각 ΔE 29.0, 대비 ≥ 3:1).
- [x] 강조 점 레이어는 올린 점(흰색 `[255,255,255,255]`, 지금의 autoHighlight 색)과 이웃(`colors[j]` 그대로 — 필터 밖이면 지금처럼 옅다)을 그린다. 반지름 규칙은 기본 레이어와 같다. 픽킹은 하지 않는다(호버는 기본 레이어·제목 레이어가 낸다).
- [x] 마우스가 떠나 옅어지는 240ms 동안 마지막 호버의 선·강조 점이 남아 있다가 사라진다. 지도 밖(사이드바·도구 막대)으로 바로 나가도 거둔다(`onPointerLeave`). 실측: 보통 217ms까지 남고 262ms에 0, 동작 줄이기면 즉시 0.
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
- deck은 캔버스 안에서 빈 곳으로 옮겨야 호버를 거둔다. 사이드바로 바로 나가면 `onHover(null)`이 안 와서 툴팁(기존)과 인용 선이 남았다 — 컨테이너 `onPointerLeave`에서 거둔다. E2E도 캔버스 오른쪽 가장자리 안쪽 대신 위 도구 막대로 나간다(가장자리 안쪽에도 점이 있을 수 있다).
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

## 두 번째 지시 — 2026-09-18: 호버 지연·활성 라벨·선택 모드

### 요구사항

- [x] 호버 강조는 같은 점(또는 제목) 위에 1000ms 머문 뒤 켜진다(`HOVER_DELAY_MS`, 사용자 지정값). 그 전에 떠나거나 다른 점으로 옮기면 켜지지 않는다. 켜진 뒤 다른 점으로 옮기면 즉시 꺼지고(240ms 페이드) 새 점은 다시 1000ms 뒤에 켜진다.
- [x] 점 위 툴팁이 없다. 강조가 켜지면 활성 노드(강조 노드 + 인용 이웃, 로컬 그래프면 2홉까지)의 제목이 `TextLayer`(같은 글꼴·크기·점 아래 9px)로 나타난다. 강조 노드의 제목은 항상, 나머지는 피인용수 내림차순으로 화면 상자(폭 `widths[i]`, 높이 24px)가 이미 놓인 상자 — 앞서 놓인 활성 라벨과 이 칸의 지도 제목 배열(활성 노드 것 제외; 켜졌는지는 보지 않는다 — 배율마다 다시 재지 않으려고) — 와 겹치지 않을 때만 놓는다. 지도 제목이 있는 노드는 그 자리(쌓인 줄)를 그대로 쓴다. 카메라 칸(240px·반 단계)이 바뀌면 다시 놓는다. 활성 노드의 지도 제목은 알파 0으로 감춰 이중으로 그리지 않는다.
- [x] 점·제목 클릭은 `update({selected: id, local: undefined})`만 한다 — 상세 Dialog가 열리지 않는다. 선택된 노드는 마우스와 무관하게 강조(연결선·이웃·활성 라벨)를 유지한다. 호버가 켜지면 그 노드의 강조로 바뀌고, 꺼지면 선택 노드로 돌아온다.
- [x] 선택 인디케이터: 기존 `selected-halo`(점 반지름 + 5px, 1px 선). 버튼 셋: 노드 중심에서 36px 떨어진 원의 위쪽 호 −150°·−90°·−30°(아래는 노드의 제목이 차지한다 — 처음 −90°·30°·150°로 두니 아래 두 버튼이 제목을 가렸다)에 지름 32px 원형 아이콘 버튼(shadcn `Button size="icon"` = 32px, `variant="secondary"`, `rounded-full`). 접근성 이름 "노드 상세정보"·"AI에게 질문하기"·"로컬 그래프 보기", 같은 글의 shadcn Tooltip. 아이콘 lucide `Info`·`MessageSquareText`·`Waypoints`. 노드가 화면 밖이면 버튼도 없다.
- [x] 선택 해제: 컨테이너에서 Escape, deck `onClick`에 객체가 없을 때(빈 곳 클릭), 다른 점 클릭(교체). 해제하면 `local`도 지운다.
- [x] 선택 시 노드가 지도 가장자리 90px 안쪽이면 중앙으로 옮긴다(기존 70px → 90px).
- [x] 논문 목록·에이전트 `select`·3D 별자리에서 논문을 고르면 `view: "map"`으로 함께 바꾼다. 인용 계보 화면의 노드 클릭은 그대로(씨앗 교체)이고 Dialog는 열리지 않는다.
- [x] 상세 Dialog는 `useStore.detailOpen`(세션, 기본 false)이 true이고 `selected`가 지도에 있을 때 연다. "노드 상세정보"가 true로, 닫기(✕·Escape·바깥)는 false로만 바꾸고 `selected`는 그대로다. 주제·분야 Dialog는 지금 그대로.
- [x] 지도에 없는 `selected`(딥링크 `selected=missing`)는 Dialog 대신 `.invalid-region` 안내("선택한 논문을 찾을 수 없습니다" + 선택 해제)를 보인다.
- [x] "AI에게 질문하기": `useStore.requestChat()`(카운터). AppShell이 이를 보고 `save({chatOpen: true})`, AgentSidebar가 입력창(`textarea`)에 포커스를 둔다.
- [x] "로컬 그래프 보기"(`aria-pressed`): URL `local=1` 토글. 켜지면 활성 집합 = 선택 노드 + 1홉 + 2홉, 선 = 선택 노드에 닿는 선(지금 색) + 활성 집합 안의 나머지 run 안 인용선(`--ink-soft` #93a3b4, 1px, 알파 110/255). 카메라는 활성 집합의 좌표 범위가 80px 여백을 두고 들어오도록 옮긴다(`fitCamera`, `home.zoom − 2 ~ home.zoom + ZOOM_RANGE`). 끄면 켜기 전 카메라로 돌아간다(선택이 바뀌어 꺼진 경우는 그대로). `selected`가 바뀌면 `local`을 지운다.
- [x] 에이전트 `select` 도구 설명과 시스템 프롬프트의 select 규칙이 "지도에서 선택 모드"로 바뀐다.
- [x] 컨테이너 속성 `data-hover-id`(강조 노드 = 켜진 호버 또는 선택), `data-hover-links`, `data-active-labels`(놓인 활성 라벨 수), `data-local`. E2E: 점에 마우스를 올리고 300ms 안에는 `data-hover-id`가 없고 1초 뒤엔 있다; 클릭하면 Dialog가 없고 버튼 셋이 보인다; "노드 상세정보"로 Dialog가 열리고 닫으면 `selected`가 남는다; "로컬 그래프 보기"로 `local=1`과 `data-hover-links` 증가; 목록에서 고르면 지도 선택 모드; `selected=missing`은 `.invalid-region`.
- [x] Vitest: `localGraph(index, i)`(2홉 집합·선 분류), `placeLabels`(항상 첫 라벨, 겹침 배제, 순서), `fitCamera`.

### 설계

- `map/edges.ts`: `localGraph(index, i): { nodes: number[]; links: {a, b, seed: boolean, incoming}[] }` — BFS 2단계, 선은 활성 집합 안에서 한 번씩(a→b 인용 방향), `seed`는 i에 닿는 선.
- `map/active-labels.ts`(새): `placeLabels(candidates: {i, x, y, w, h, rank}[], first: number, obstacles: box[]): number[]` — 균일 격자(셀 64px)로 겹침 검사.
- `map/labels.ts`: `fitCamera(xs, ys, width, height, padding, zoomMin, zoomMax)`.
- `MapView.tsx`: `pointer`(deck 호버, 즉시) → `useEffect` 타이머 1000ms → `active`. `focus = active ?? selected`. `hoverT = useTween(focus >= 0 ? 1 : 0)`. `graph = local ? localGraph : 1홉`. 레이어: papers(불투명도) → hover-links(1홉 색·2홉 옅은 색) → hover-nodes → selected-halo → paper-titles(활성 노드 알파 0) → active-titles. DOM: `.node-menu`(map-labels 안, pointer-events auto) 버튼 셋. deck `onClick` 빈 곳 → 해제. 키 Escape → 해제.
- `store.ts`: `detailOpen` 기본 false, `chatRequest`·`requestChat`.
- `navigation.ts`: `local: boolean`(`local=1`).
- `InspectorDialog.tsx`·`AppShell.tsx`·`AgentSidebar.tsx`·`PaperListOverlay.tsx`·`SkyView.tsx`·`agent/tools.ts`·`agent/context.ts`.

### 버린 대안

- 켜진 상태에서 다른 점으로 옮기면 즉시 바꾸기: 지나가는 점마다 선이 번쩍인다. 사용자가 "너무 민감"을 지적했다.
- 활성 라벨을 DOM으로: 이미 제목을 GPU로 옮긴 이유와 같다. 같은 `TextLayer` 설정(아틀라스·글꼴 렌더러)을 재사용한다.
- 로컬 그래프를 인용 계보 화면으로: 사용자가 지도 위 오버레이를 골랐다.
- Dialog 열림을 URL에: 새로고침 시 Dialog가 다시 덮인다. 사용자 지시는 "선택 모드"가 기본이므로 세션 상태로 둔다.

### 함정

- `titles` 배열(지도 제목)은 카메라 칸마다 다시 만들지만 활성 노드를 감추는 것은 `getColor`의 updateTrigger로만 한다 — 배열을 다시 만들면 글자 전체를 다시 놓는다.
- 활성 라벨은 카메라 칸이 바뀔 때마다 다시 놓는다. 2홉 집합이 수천이면 격자 없이 O(k²)는 느리다.
- deck `onClick`은 드래그 뒤에는 오지 않는다(mjolnir가 구분). 빈 곳 클릭 해제는 그 위에서만 동작한다.
- `usePersistentLayout`은 AppShell의 지역 상태라 MapView가 직접 채팅을 열 수 없다 — 스토어 카운터로 부탁한다.
- 상세 Dialog 안의 Escape는 Dialog가 먼저 받는다(선택은 남는다). 지도의 Escape는 컨테이너에 포커스가 있을 때만.
- `.node-menu`는 0×0 상자라 Playwright가 hidden으로 본다. E2E는 안의 "노드 상세정보" 버튼으로 본다.
- 실측(프로덕션, 빽빽한 3200% 화면 휠 한 단계 RunTask): 강조 없음 11.5ms(main과 같은 자릿수) · 호버 켜짐(이웃 35) 7.6ms · 로컬 그래프(선 1,586) 8.0ms, 이동 2.75ms. 활성 라벨은 배율 단계마다만 다시 놓는다.
- 호버 지연 실측: 올린 뒤 300ms에 `data-hover-id` 없음, 1200ms에 있음. 지도 밖으로 나가도 선택은 남고 강조도 남는다. 상세 Dialog를 Escape로 닫으면 `selected`가 남는다. "AI에게 질문하기" 뒤 `document.activeElement`가 textarea.
- 활성 노드의 지도 제목을 켜지는 순간 알파 0으로 두면 이미 켜져 있던 제목이 한 프레임 꺼졌다 활성 라벨로 다시 켜진다(반대로 꺼질 때도). 지도 제목 알파에 `1 − hoverT`를 곱해 활성 라벨과 교차 페이드한다. 실측(제목 상자 평균 밝기): 켜지기 전 37 → 켜진 뒤 40ms 60 → 120ms 76 → 77, 떼고 60ms 65 → 37. 아래로 꺼지는 순간이 없다.
- Escape는 버튼 셋에 포커스가 있어도 선택을 지운다(`e.target !== e.currentTarget` 검사보다 앞에 둔다).
- 허브(이웃 408편)의 로컬 그래프: 선 26,575·활성 라벨 20, 켜는 데 143ms(클릭 왕복 포함), 이후 휠·이동 프레임 16.7ms 유지(개발 서버). 캡은 두지 않았다.
- 세 번째 지시(2026-09-18): 로컬 그래프는 1홉(`LOCAL_HOPS = 1`) — 이웃과 이웃끼리의 인용선. 2홉은 선이 너무 많았다.
