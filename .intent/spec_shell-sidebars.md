---
title: 앱 셸 좌우 사이드바를 shadcn Sidebar로 전환
slug: shell-sidebars
stage: spec
status: accepted
intent: .intent/intent_shell-sidebars.md
date: 2026-09-17
---

# 앱 셸 좌우 사이드바를 shadcn Sidebar로 전환 — 명세

## 요구사항

- [x] 좌측 탐색은 `SidebarProvider` 하나 아래의 `Sidebar collapsible="icon"`이다. 접으면 48px 아이콘 레일에 다섯 화면 아이콘이 남고 각 아이콘에 `tooltip`으로 이름이 뜬다. `SidebarRail`, 헤더의 `SidebarTrigger`, `⌘B`/`Ctrl+B`로 여닫는다.
- [x] 좌측 주제 목록은 `SidebarInput`으로 라벨을 대소문자 구분 없이 걸러 보고, 항목마다 `SidebarMenuBadge`로 논문 수를 표시한다. 그룹 라벨 옆에 전체 개수를 `Badge`로 표시한다. 걸러서 0개거나 분석 결과가 없으면 `Empty`를 표시한다. 아이콘 레일 상태에서는 주제 그룹과 푸터를 숨긴다.
- [x] 우측 인스펙터는 `Sidebar side="right" collapsible="none"`이며 `data-testid="inspector"`를 가진다. `detailOpen`이 참일 때만 렌더링한다. 논문·주제·분야 선택이 생기거나 바뀌면 `detailOpen`이 참이 되고, 선택이 모두 지워지면 거짓이 된다. 헤더 버튼 "상세 패널 전환"(`aria-pressed`)으로도 토글한다.
- [x] 인스펙터 헤더는 셸이 한 번만 그린다. eyebrow(논문 / 연구 주제 / 연구 분야 / INSPECTOR)와 ✕ `Button variant="ghost" size="icon"`(aria-label "선택 해제")가 있고, ✕는 선택을 지운다.
- [x] `DetailPanel`·`ClusterPanel`은 `<aside>`와 ✕ 없이 내용만 돌려준다. 연도·유형·피인용·논문 수·중앙연도는 `Badge`, 코퍼스 내 참고문헌·피인용 통계와 하위 주제·피인용 상위 목록은 `ItemGroup`+`Item`, 초록 없음은 `Alert`, 주제 태그는 `Badge variant="outline"`, 절 구분은 `Separator`, 원문 링크는 `Button variant="link"`+`ExternalLink data-icon="inline-end"`다. 빈 상태는 `Empty`+`EmptyMedia variant="icon"`.
- [x] 두 패널의 열림 상태는 `localStorage["constellation.layout.v2"]` = `{version:2, navOpen, detailOpen}`에 저장하고 새로고침 뒤 복원한다. 값이 깨졌거나 없으면 `navOpen=true`, `detailOpen=(로드 시 URL에 selected·cluster·node 중 하나라도 있음)`으로 복구한다. v1 키는 읽지 않는다.
- [x] 좁은 창(≤959px)에서 좌측은 Sidebar 내장 Sheet로 열리고 항목을 고르면 닫힌다. 우측은 `Sheet side="right"`로 열리고 `SheetTitle`을 가진다. 가로 넘침이 없다.
- [x] `ResizablePanelGroup`, `react-resizable-panels` 의존, `components/ui/resizable.tsx`, `AppShell`의 `mobile ? … : …` 토글 분기와 `matchMedia` 상태, `index.css`의 `.app-sidebar*`·`.inspector-*`·`.corpus-links`·`.sidebar-note`·`.cluster-count`·`.topic-dot`·`[data-slot=resizable-handle]` 셀렉터를 제거한다. `.detail`·`.close`·`.tag`·`.meta-row`·`.cl-*`·`.topic*`·`.spark*`·`.eyebrow`는 `FlowView`의 갈래 상세와 다른 화면이 아직 쓰므로 남긴다. `FlowView` 상세의 shadcn 정리는 후속 변경이다.
- [x] 폭·높이는 design-ops `patterns/navigation.md` Implementation defaults를 따른다: 좌측 펼침 16rem, 접힘 3rem, 모바일 18rem, 항목 높이 32px(shadcn 기본). 우측 20rem은 코퍼스에 인스펙터 표본이 없어 현재 값 320px를 유지한 제품 결정이다(unverified). 헤더 높이 62px는 `--header-height`로 노출한다.
- [x] 지도·목록 오버레이·URL 복원·다섯 화면 전환·모델 전환은 변경 전과 같이 동작한다.

## 설계

- `AppShell.tsx`: `SidebarProvider open={prefs.navOpen} onOpenChange={navOpen => save({navOpen})} className="flex-col"` 안에 `header` → `div.flex.flex-1.min-h-0` → `AppSidebar` + `main`(stage) + (`detailOpen && !isMobile` ? `InspectorSidebar` : null). `useIsMobile()`(`hooks/use-mobile.ts`, 쿼리를 959px로 맞춤)이 유일한 모바일 판정이다. 우측 모바일은 기존 `Sheet`를 유지하되 내용은 같은 `Inspector` 컴포넌트다.
- `AppSidebar.tsx`: `Sidebar collapsible="icon" className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"`. 화면 메뉴 `SidebarMenuButton tooltip={name} isActive`. 주제 그룹은 `SidebarInput`(로컬 `useState`)으로 걸러 `SidebarMenuButton`+`SidebarMenuBadge`. 모바일 닫기는 `useSidebar().setOpenMobile(false)`로 처리하고 `onNavigate` prop을 없앤다.
- `components/Inspector.tsx`(신규): `Sidebar side="right" collapsible="none"` + `SidebarHeader`(eyebrow·✕) + `SidebarContent`. 선택 종류에 따라 `DetailPanel`·`ClusterPanel`·`Empty`를 고른다. ✕는 `update({selected, cluster, node: undefined})`.
- `panels/DetailPanel.tsx`, `panels/ClusterPanel.tsx`: 요구사항의 컴포넌트로 내용만 구성. `useWorkspace` 조회는 그대로. `ClusterPanel`의 연도 막대(`.spark`)는 유지.
- `hooks/use-persistent-layout.ts`: v2 스키마와 선택 기반 기본값. `readPreferences(hasSelection: boolean)`.
- 추가 컴포넌트: `npx shadcn@latest add badge item` (`frontend/`에서). 추가 후 파일을 읽어 base-nova 규칙을 확인한다.
- 헤더 좌측 토글은 `SidebarTrigger`에 `aria-label="탐색 패널 전환" aria-pressed={open}`을 넘긴다(`useSidebar().open`).

## 버린 대안

- 우측을 `collapsible="offcanvas"`로 두고 `SidebarProvider`를 겹치는 방식. 단축키·쿠키가 양쪽에 걸리고 헤더 토글이 안쪽 컨텍스트만 보므로 `sidebar.tsx`를 세 군데 고쳐야 한다. 공식 `sidebar-15` 블록의 `collapsible="none"` 패턴을 따른다.
- `sidebar.tsx`의 쿠키 저장을 그대로 두고 localStorage를 버리는 방식. 쿠키는 사이드바 하나만 기억하고 우측 상태를 담을 자리가 없다.
- 슬라이드 애니메이션을 위해 우측을 항상 렌더링하고 폭만 0으로 접는 방식. 지도 캔버스가 폭 변화에 다시 크기를 잡아야 해 렌더링 비용이 든다. 조건부 렌더링으로 둔다.

## 함정

- `Sidebar` 데스크톱 컨테이너는 `position: fixed`라 헤더 아래로 밀려면 `--header-height` 오프셋이 필수다. 안 그러면 헤더를 덮는다.
- `SidebarProvider`의 `setOpen`은 controlled여도 `sidebar_state` 쿠키를 쓴다. 무해하지만 상태의 근거는 localStorage다.
- `AppShell`의 `selectionRef` 효과는 마운트 시 선택을 "변화 없음"으로 보고 열지 않는다. 그래서 딥링크 기본값을 `readPreferences(hasSelection)`에서 정한다.
- `MapView`는 `hidden` 속성으로 숨겨 두고 다른 화면과 겹쳐 렌더링한다. 우측 패널이 렌더링·제거될 때 deck.gl 캔버스가 resize를 받는지 확인한다.
- E2E가 `.detail h2`, `separator[name="탐색 패널 크기 조절"]`, `constellation.layout.v1`을 참조한다. 새 구조의 `data-testid`와 v2 키로 바꾼다.
- `FlowView`가 `.topic.topic--facet`를 쓰므로 `.topic` 계열 CSS는 남긴다.

## 완료 기준

```sh
cd frontend
npm run test -- --run        # navigation·labels + use-persistent-layout 테스트 통과
npm run build                # tsc + vite 종료 코드 0
npm run lint                 # 종료 코드 0
npm run test:e2e             # 9개 통과 (실데이터)
```

브라우저(실데이터, 1440×950과 390×844): `⌘B`로 좌측 접힘·펼침, 레일 아이콘 툴팁, 주제 필터, 논문 선택 시 우측 열림·✕로 닫힘, 새로고침 뒤 두 패널 상태 유지, 모바일 두 Sheet. 콘솔 오류 0.

구현·검증 완료: 2026-09-17. Vitest 11, build, lint(경고 7), Playwright 9/9 통과. 브라우저(1021×1127, 375×812)에서 접기·레일 툴팁·주제 필터·인스펙터 열림/닫힘·새로고침 복원·모바일 Sheet를 확인했다.
