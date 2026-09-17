---
title: 앱 셸 좌우 사이드바를 shadcn Sidebar로 전환
slug: shell-sidebars
stage: plan
status: accepted
intent: .intent/intent_shell-sidebars.md
spec: .intent/spec_shell-sidebars.md
date: 2026-09-17
---

# 앱 셸 좌우 사이드바를 shadcn Sidebar로 전환 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `frontend/src/components/ui/{badge,item}.tsx` (신규) | `npx shadcn@latest add badge item`으로 추가하고 읽어서 base-nova 규칙 확인 |
| `frontend/src/components/ui/resizable.tsx` (삭제), `frontend/package.json`, `package-lock.json` | `react-resizable-panels` 제거 |
| `frontend/src/hooks/use-mobile.ts` | 모바일 쿼리를 `(max-width: 959px)`로 |
| `frontend/src/hooks/use-persistent-layout.ts` | v2 스키마 `{navOpen, detailOpen}`, `readPreferences(hasSelection)` 기본값 |
| `frontend/src/hooks/use-persistent-layout.test.ts` (신규) | 깨진 값·v1 값·선택 유무 기본값 |
| `frontend/src/components/Inspector.tsx` (신규) | `Sidebar side="right" collapsible="none"`, 헤더(eyebrow·✕), 내용 선택 |
| `frontend/src/panels/DetailPanel.tsx`, `panels/ClusterPanel.tsx` | `<aside>`·✕ 제거, `Badge`·`Item`·`Alert`·`Separator`·`Button link`로 내용 구성 |
| `frontend/src/components/AppSidebar.tsx` | `collapsible="icon"`, `tooltip`, `SidebarInput` 필터, `SidebarMenuBadge`, `Empty`, `SidebarRail`, `useSidebar().setOpenMobile` |
| `frontend/src/components/AppShell.tsx` | controlled `SidebarProvider`, 헤더 `SidebarTrigger`, 행 레이아웃, 우측 조건부 렌더, 우측 모바일 `Sheet`, `useIsMobile` |
| `frontend/src/index.css` | 스펙의 셀렉터 제거, `--header-height: 62px`, `.product-shell` 행 레이아웃 |
| `frontend/e2e/exploration.spec.ts` | 폭 조절 → 접기·`⌘B`·복원, `.detail` → `[data-testid=inspector]`, v2 키 |
| `README.md`, `docs/ARCHITECTURE.md` | 패널 조작 문구(구분선 → 접기·⌘B), Resizable 언급 삭제 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. **부품 추가** — `frontend/`에서 `npx shadcn@latest add badge item`. 추가된 두 파일을 읽고 export 이름(`Badge`, `Item`, `ItemGroup`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemMedia`)을 확인한다. `git status`로 다른 파일이 바뀌지 않았는지 본다.
2. **훅** — `use-mobile` 쿼리, `use-persistent-layout` v2와 테스트. `npm run test -- --run` 통과.
3. **인스펙터** — `Inspector.tsx`와 두 패널을 내용 전용으로 바꾼다. `npx tsc -b` 통과.
4. **좌측 사이드바** — `AppSidebar.tsx`. `npx tsc -b` 통과.
5. **셸** — `AppShell.tsx`에서 Resizable·`matchMedia`·수동 토글을 걷어내고 Provider·트리거·행 레이아웃으로 바꾼다. `resizable.tsx`와 의존을 지운다. `npm run build` 통과.
6. **CSS** — 스펙의 셀렉터를 지우고 `--header-height`를 넣는다. 브라우저(1440×950)에서 좌측 접힘·레일 툴팁·주제 필터·우측 열림/닫힘·새로고침 복원, 390×844에서 두 Sheet와 가로 넘침 없음을 확인한다. 콘솔 오류 0.
7. **E2E·문서** — 시나리오 갱신 후 `npm run test:e2e` 9개 통과. README·ARCHITECTURE 문구 수정.
8. 커밋은 2·3–4·5–6·7 단위로 나눈다. `git add`는 파일을 지정한다.

## 가장 위험한 단계

5–6단계. shadcn `Sidebar`의 데스크톱 컨테이너는 `position: fixed`라 `--header-height` 오프셋과 행 레이아웃(`flex-1 min-h-0`)이 어긋나면 헤더를 덮거나 지도가 세로로 넘친다. 우측 패널의 조건부 렌더링으로 deck.gl 캔버스 폭이 바뀔 때 지도가 다시 그려지는지 확인한다. 깨지면 5–6 커밋만 `git revert`하고 3–4(패널 내용)는 유지한다.

## 검증

```sh
cd frontend
npm run test -- --run
npm run build
npm run lint
npm run test:e2e
```

브라우저 경로(실데이터): 지도 → `⌘B` 두 번(접힘·펼침) → 레일 아이콘 hover 툴팁 → 주제 필터에 "LLM" → 논문 목록에서 논문 선택 → 우측 열림 → ✕ → 닫힘 → 주제 클릭 → 우측 열림 → 새로고침 → 두 패널 상태 유지. 390×844: 헤더 트리거 → 좌측 Sheet → 화면 선택 → 닫힘 → 논문 선택 → 우측 Sheet.
