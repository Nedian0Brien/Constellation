---
title: 툴바·논문 목록·갈래 상세를 shadcn 부품으로 정리
slug: shadcn-views
stage: intent
status: accepted
author: minjaepark
date: 2026-09-17
---

# 툴바·논문 목록·갈래 상세를 shadcn 부품으로 정리

## 문제

앱 셸의 좌우 사이드바는 shadcn Sidebar로 바꿨지만(PR #2), 지도 위에 얹히는 세 화면은 아직 커스텀 마크업이다.

- `ExploreToolbar`: 검색창이 `div.search-control` 안에 아이콘·`Input`·지우기 버튼을 손으로 배치한다. shadcn은 입력 안의 아이콘·버튼에 `InputGroup`+`InputGroupAddon`을 쓰라고 한다. 연도 필터도 `div.year-filter`에 숫자 입력 두 개와 슬라이더를 커스텀 CSS로 붙였다.
- `PaperListOverlay`: `section.paper-overlay`·`header.overlay-header`·`footer.overlay-pagination`을 직접 그린다. 제목 버튼은 `button.paper-title-button`이고 페이지 이동은 아이콘 버튼 두 개다. shadcn `Card`(Header·Title·Action·Content·Footer)와 `Pagination`이 있는 자리다.
- `FlowView`: 신호 선택(결합·인용만·의미만·저자만)이 `div.seg` 안의 버튼 4개에 `on` 클래스를 손으로 붙인다. shadcn 규칙은 2–7개 선택지에 `ToggleGroup`을 쓰라고 하며 `toggle-group.tsx`는 이미 설치돼 있는데 아무 데서도 안 쓴다. 갈래 상세는 `aside.detail.flow-detail`에 ✕·`.tag`·`.topics`·`.cl-works`를 그려 PR #2 이전의 `ClusterPanel`과 같은 모양이고, 그 때문에 `.detail`·`.close`·`.tag`·`.meta-row`·`.cl-*` 레거시 셀렉터를 지우지 못했다.

## 원하는 결과

- 검색창은 `InputGroup`+`InputGroupInput`+`InputGroupAddon`(검색 아이콘, 지우기 버튼)이다. 1자 입력 안내와 한글 조합 지연은 그대로 동작한다.
- 연도 필터는 `Field`+`Input`+`Slider`로 구성하고 커스텀 `.year-filter`·`.search-control` 셀렉터 없이 레이아웃 클래스만 쓴다.
- 논문 목록은 `Card`다. `CardHeader`에 eyebrow·제목·건수·`CardAction`(닫기), `CardContent`에 `Table`, `CardFooter`에 `Pagination`. 제목은 `Button variant="link"`다. Escape·포커스 복귀·정렬·페이지 동작은 그대로다.
- Flow 신호 선택은 `ToggleGroup type="single"`이다. 갈래 상세는 `Card`(Header·Title·Action ✕·Content)이고 내용은 `Badge`·`ItemGroup`+`Item`으로 `ClusterPanel`과 같은 부품을 쓴다. 피인용 상위 목록 렌더링은 `ClusterPanel`과 공유한다.
- `index.css`에서 `.detail`·`.close`·`.tag`·`.meta-row`·`.topics`·`.topic*`·`.cl-*`·`.seg*`·`.search-*`·`.year-filter*`·`.paper-overlay`·`.overlay-*`·`.paper-title-button`·`.flow-detail` 셀렉터를 제거한다. 남은 참조가 0이다.
- E2E 9개가 새 선택자로 통과한다. 기존 시나리오(검색 건수 대조·정렬·페이지·1자 안내·Escape·갈래 흐름 진입)는 유지한다.

## 영향 범위

`frontend/src/components/{ExploreToolbar,PaperListOverlay}.tsx`, `views/FlowView.tsx`, `panels/ClusterPanel.tsx`(목록 공유), `components/ui/`에 추가하는 `card`·`input-group`·`pagination`, `index.css`, `e2e/exploration.spec.ts`. 사용자는 연구자 본인.

## 제약

- shadcn 스킬 규칙. `frontend/components.json`(base-nova, base, lucide, `@/`). 추가는 `npx shadcn@latest add`.
- `className`은 레이아웃에만. 타이포·색 변경은 토큰이나 `data-slot` 전역 CSS로.
- 검색·연도 조건의 해석, `/api/works`·`/api/matches` 계약, TanStack Table의 서버 정렬·페이지 방식, Flow의 SVG 레이아웃과 리본 hover 툴팁(`.flow-tip`)은 건드리지 않는다.
- 치수는 design-ops 측정 프로필(web-compact)에서 고른다.

## 범위 밖

- `TreeView`·`LineageView`·`SkyView`의 상단 헤더(`.tree-head`)와 상태 표시. Flow 헤더도 `.seg`만 바꾸고 나머지는 둔다.
- Flow 리본 hover 툴팁의 shadcn `Tooltip`/`HoverCard` 전환.
- Flow 갈래 선택을 우측 인스펙터로 옮기는 일. 시간 창 클러스터는 지도 클러스터와 의미가 달라 화면 안에 둔다.
- 헤더·지도 컨트롤·범례.

## 열린 질문

- 논문 목록 `Pagination`은 페이지 번호 링크 대신 이전/다음 + "n / N" 표기를 유지한다. 425페이지를 번호로 늘어놓을 이유가 없다. `PaginationPrevious`/`PaginationNext`만 쓴다.
- 없음 외 추가 질문 없음.
