---
title: 검색 바를 지도 안 상단의 유리 pill로
slug: search-pill
stage: spec
date: 2026-09-30
---

# 검색 바를 지도 안 상단의 유리 pill로 — spec

## 요구사항

1. `.explore-toolbar` 줄을 없앤다. `.analysis-stage`가 `.workspace-stage` 높이를 다 쓴다.
2. `.analysis-stage` 위쪽 가운데에 **검색 pill**과 그 오른쪽의 **컨트롤 버블**을 한 줄(`.stage-search`)로 띄운다. 모든 뷰(지도·계층 트리·갈래 흐름·인용 계보·3D)에서 같은 자리다.
3. 검색 pill: 기존 `InputGroup`(돋보기·입력·지우기)을 그대로 쓰고, 폭 `clamp(320px, 40%, 640px)`(`%`는 스테이지 폭 기준)다.
4. 컨트롤 버블: 색상 선택 `Select`(`aria-label="지도 색상"`, 현재 값 글자 표시), 결과 건수(`#search-hint`, `role="status"`), 필터가 있을 때만 필터 초기화 아이콘 버튼(`aria-label="필터 초기화"`, `Tooltip`으로 같은 글자).
5. 검색 동작(250ms 디바운스, IME 조합 중 보류, 두 글자 미만 경고, 지우기)은 그대로다. `id="paper-search"`, 라벨 "논문 검색", `aria-describedby="search-hint"`를 유지한다.
6. `.map-caption`과 겹치지 않는다. 스테이지 폭이 좁아 겹칠 수 있으면 캡션이 pill 줄 아래로 내려간다.
7. 유리 재질: 반투명 어두운 바탕 + `backdrop-filter: blur() saturate()` + 1px 밝은 테두리 + 위쪽 안쪽 하이라이트. `backdrop-filter`를 지원하지 않으면 불투명 바탕(`--map-ground`)이다. 흰 글자 대비 4.5:1 이상.

## 치수 (design-ops 코퍼스 근거)

| 항목 | 값 | 근거 |
|---|---|---|
| pill·버블 높이 | 40px | `patterns/implementation-defaults.md` Form: 데스크톱 웹 입력 높이 40 (78개 시스템 최빈값, 버튼과 같은 값) |
| 반경 | `9999px` | `tokens/scales.md` pill 반경: 큰 상수 계열(Polaris·Atlassian 9999px) |
| 스테이지 위 여백 | 18px | 기존 지도 크롭 마크·모서리 오프셋 18px과 맞춤 (제품 내부 값) |
| pill–버블 간격 | 8px | 간격 스케일 8 (`tokens/scales.md` 핵심 표: 8·16 포함이 다수) |
| 좌우 안쪽 여백 | 입력 16px, 버블 6px(내부 컨트롤이 자체 여백을 가짐) | 간격 스케일 |
| 입력 글자 | 14px (기존 `InputGroupInput` 값 유지) | Typography: 14px 캠프(shadcn/ui 컴포넌트 14px) |
| 건수 글자 | 10px mono (기존 `.filter-result` 유지) | 기존 값 |

## 설계

- `ExploreToolbar`를 `StageSearch`로 바꾼다: 같은 상태·훅을 쓰고 마크업만 pill + 버블로 나눈다. `AppShell`은 이를 `.analysis-stage` 안, 뷰들 뒤에 둔다(겹침 순서상 뷰 위).
- 컨테이너는 `pointer-events: none`, pill과 버블만 `auto`라서 둘 사이·양옆 빈 곳에서도 지도를 끌 수 있다.
- 캡션 충돌: `.analysis-stage`를 `container-type: inline-size`로 두고, 측정한 임계 폭 미만에서 `.map-caption { top: 76px }`(18 + 40 + 18).
- 좁은 폭(스테이지 < 560px): pill 폭을 `clamp` 대신 남은 폭 전부로(`left/right: 16px`).
- 유리 값: 바탕 `rgb(12 17 24 / 0.62)`, `blur(16px) saturate(140%)`, 테두리 `rgb(255 255 255 / 0.14)`, 안쪽 하이라이트 `inset 0 1px 0 rgb(255 255 255 / 0.08)`, 그림자 `0 8px 24px rgb(0 0 0 / 0.35)`. 바탕 0.62만으로 흰 바탕 위에서도 흰 글자 대비가 4.5:1 이상이 되게 한다(계산값은 plan 검증에 기록).

## 수용 기준

- 1440×950에서 지도 세로가 61px 늘어난다.
- 다섯 뷰 모두 pill·버블이 같은 자리에 있고, 캡션·확대 다이얼·연도 축과 겹치지 않는다(좁은 창 포함).
- 검색·지우기·색상 변경·필터 초기화가 전과 같이 동작하고, 기존 E2E가 통과한다.
- 데스크톱 앱(WKWebView)에서 pill 뒤 지도가 흐리게 비친다.

## 열린 질문

없음.
