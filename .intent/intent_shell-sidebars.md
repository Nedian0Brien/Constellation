---
title: 앱 셸 좌우 사이드바를 shadcn Sidebar로 전환
slug: shell-sidebars
stage: intent
status: accepted
author: minjaepark
date: 2026-09-17
---

# 앱 셸 좌우 사이드바를 shadcn Sidebar로 전환

## 문제

좌측 탐색 사이드바는 shadcn `Sidebar`를 쓰지만 `collapsible="none"`으로 고정하고 접기·폭 조절을 `ResizablePanel`과 헤더의 별도 토글 버튼이 맡는다. shadcn Sidebar가 제공하는 아이콘 레일 접기, `⌘B` 단축키, 모바일 Sheet 내장, `SidebarMenuBadge`·`SidebarInput` 같은 부품을 쓰지 않고 커스텀 CSS(`app-sidebar`, `cluster-count`, `topic-dot`, `sidebar-note`)로 흉내 낸다.

우측 인스펙터는 shadcn 컴포넌트가 아예 없다. `div.inspector-content` 안에 `DetailPanel`과 `ClusterPanel`이 각자 `<aside className="detail">`과 ✕ 버튼을 중복 렌더링하고, 태그·빈 상태·목록 행·구분선을 커스텀 셀렉터 54개(`.detail`, `.tag`, `.cl-works`, `.close`, `.spark`, `.inspector-empty` …)로 그린다. shadcn 규칙(기존 컴포넌트 우선, `Badge`·`Empty`·`Item`·`Separator`·`Skeleton` 사용, `data-icon`)에 어긋난다.

결과로 셸 코드가 두 벌의 접기 로직(데스크톱 Resizable + 모바일 Sheet)을 들고 있고, 새 화면·패널을 추가할 때 따라 할 기준이 없다.

## 원하는 결과

- 좌측 탐색은 shadcn `Sidebar collapsible="icon"`이다. 접으면 아이콘 레일이 남고, `SidebarRail` 클릭·`SidebarTrigger`·`⌘B`로 열고 닫는다. 좁은 창에서는 Sidebar가 내장한 Sheet로 열린다.
- 우측 인스펙터는 shadcn `Sidebar side="right" collapsible="offcanvas"`다. 논문·주제를 선택하면 열리고 선택을 지우면 닫힌다. 헤더 버튼으로도 여닫는다.
- 두 패널의 열림 상태는 새로고침 뒤에도 유지된다.
- 인스펙터 내용(논문 상세·주제 상세·빈 상태)은 `Badge`·`Empty`·`Item`·`Separator`·`Skeleton`·`Button`으로 구성한다. ✕ 버튼과 `<aside>` 래퍼는 셸이 한 번만 그린다.
- 좌측 주제 목록(45개)은 `SidebarInput`으로 이름을 걸러 볼 수 있고, 개수는 `SidebarMenuBadge`로 표시한다.
- `ResizablePanelGroup`과 `use-persistent-layout`의 폭 저장, 헤더의 수동 토글 분기(`mobile ? … : …`)를 제거한다. 지도·목록 오버레이·URL 상태 복원은 그대로 동작한다.
- 기존 E2E 9개가 새 구조에 맞춰 갱신된 채로 통과하고, 패널 폭 조절 시나리오는 접기·복원 시나리오로 바뀐다.

## 영향 범위

`frontend/src/components/{AppShell,AppSidebar}.tsx`, `panels/{DetailPanel,ClusterPanel}.tsx`, `hooks/use-persistent-layout.ts`, `index.css`의 셸·인스펙터 셀렉터, `components/ui/`에 추가하는 shadcn 컴포넌트(badge, item 등), `e2e/exploration.spec.ts`. 사용자는 다섯 분석 화면을 쓰는 연구자 본인이며 범위 결정도 본인이 한다.

## 제약

- shadcn 스킬의 규칙을 따른다. `components.json`은 `frontend/`에 있고 `base-nova` 스타일, `base` 프리미티브, lucide 아이콘, `@/` 별칭이다. 컴포넌트 추가는 `npx shadcn@latest add`로 한다.
- 디자인 토큰은 `docs/design-system/constellation-tokens.css`와 `src/styles/tokens.css`를 유지한다. 치수는 `design-ops` 측정 프로필에서 고른다.
- 패널 폭은 고정이다. 마우스 폭 조절은 2026-09-17 사용자가 "양쪽 다 shadcn 네이티브"를 골라 포기했다.
- 분석 화면 다섯 개, 지도 라벨·영역 로직, API, DB는 건드리지 않는다.

## 범위 밖

- 상단 헤더(브랜드·모델 선택·논문 목록 버튼)의 재설계. 토글 버튼만 `SidebarTrigger`로 바꾼다.
- 논문 목록 오버레이(`PaperListOverlay`)와 `ExploreToolbar`의 shadcn 정리는 다음 변경으로 미룬다.
- 주제 상세의 연도 분포 막대를 shadcn `Chart`(Recharts)로 바꾸는 일. 이번에는 현재 막대를 유지한다.
- 다크·라이트 테마 전환, 사이드바 자유 도킹.

## 열린 질문

- 두 Sidebar를 하나의 `SidebarProvider`가 다룰 수 없다(상태 하나). Provider를 두 개 겹치면 `⌘B`가 양쪽에 걸린다. spec에서 shadcn 문서를 확인해 우측은 단축키를 끄거나 별도 키를 쓰는 방식으로 정한다.
- 우측 인스펙터의 ✕는 "패널 닫기"와 "선택 해제" 중 무엇인가. 현재는 선택 해제다. 그대로 두는 것을 전제로 한다.
