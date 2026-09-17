---
title: 툴바·논문 목록·갈래 상세를 shadcn 부품으로 정리
slug: shadcn-views
stage: spec
status: accepted
intent: .intent/intent_shadcn-views.md
date: 2026-09-17
---

# 툴바·논문 목록·갈래 상세를 shadcn 부품으로 정리 — 명세

## 요구사항

- [x] 검색창은 `InputGroup` > `InputGroupInput`(id `paper-search`, `aria-invalid`, `aria-describedby`) + `InputGroupAddon`(검색 아이콘) + `InputGroupAddon align="inline-end"` > `InputGroupButton`(aria-label "검색 지우기", 입력이 있을 때만). `Field data-invalid`와 sr-only `FieldLabel`을 유지한다. 한글 조합 중 지연과 250ms 디바운스는 그대로다.
- [x] 연도 필터는 `Field`+`Input type="number"` 둘과 `Slider` 하나를 `flex items-center gap-2`로 놓는다. `.year-filter`·`.search-control`·`.search-field` 셀렉터를 지운다. 스핀 버튼 숨김은 `[data-slot="input"][type="number"]` 전역 규칙으로 옮긴다.
- [x] 논문 목록은 `Card`(`section` 역할 유지: `render` 대신 `Card`를 `aria-labelledby`로 연결)다. `CardHeader`에 `.eyebrow` "PAPER INDEX"·`CardTitle`(id `paper-list-heading`, "논문 목록" + 건수 `Badge`)·`CardAction`(닫기 `Button`, aria-label "논문 목록 닫기", 열릴 때 포커스), `CardContent`에 `Table`, `CardFooter`에 "연도 미상 논문 포함" 텍스트와 `Pagination`. 제목은 `Button variant="link"`(`data-testid="paper-title"`)다.
- [x] `Pagination`은 `PaginationPrevious`/`PaginationNext`(text "이전"/"다음", aria-label "이전 페이지"/"다음 페이지")와 가운데 "n / N" 텍스트만 쓴다. 링크는 `href`에 실제 페이지 URL을 넣고 클릭은 `preventDefault` 후 `update({page}, true)`다. 경계에서는 `aria-disabled`·`tabIndex=-1`·`pointer-events-none opacity-50`이다.
- [x] Flow 신호 선택은 `ToggleGroup`(단일 선택, `variant="outline" size="sm"`, aria-label "흐름 신호") > `ToggleGroupItem` 4개다. 선택 해제로 빈 값이 오면 이전 값을 유지한다.
- [x] Flow 갈래 상세는 `Card`(`absolute right-3 top-3 w-80`)다. `CardHeader`에 `.eyebrow`(창 연도)·`CardTitle`(라벨)·`CardAction`(✕ "갈래 선택 해제"), `CardContent`에 `Badge`(편 수)·키워드 `Badge variant="outline"`·`Separator`·`.eyebrow` "피인용 상위"·`WorkList`. 오류는 `DataState`, 빈 목록은 `Empty`.
- [x] `panels/WorkList.tsx`(신규)가 `{id,title,year,cited}[]`를 `ItemGroup`+`Item`(button)으로 그리고 `ClusterPanel`과 `FlowView`가 함께 쓴다.
- [x] `ClusterPanel`의 `.cl-eyebrow`·`.cl-sec`는 `.eyebrow`로 바꾼다.
- [x] `index.css`에서 `.detail*`(266행 블록과 `!important` 덮어쓰기 블록 모두)·`.detail--empty`·`.close*`·`.tag`·`.meta-row`·`.topics`·`.topic*`·`.cl-eyebrow`·`.cl-sec`·`.cl-works*`·`.seg*`·`.flow-seg`·`.search-field`·`.search-control*`·`.year-filter*`·`.paper-overlay`·`.overlay-header*`·`.paper-table*`·`.paper-title-button*`·`.overlay-pagination*`·`.flow-detail`·`.abstract`·`.venue`·`.authors`·`.no-abstract`·`.doi`를 지운다. 지운 뒤 `grep`으로 각 클래스의 참조가 0임을 확인한다. `.explore-toolbar`·`.filter-result`·`.tree-head`·`.dim`·`.flow-tip*`·`.fv-*`·`.spark*`·`.eyebrow`는 남긴다.
- [x] E2E는 `.paper-overlay` → `getByRole("region", {name: "논문 목록"})`, `.paper-title-button` → `getByTestId("paper-title")`, `.overlay-header` → 같은 region의 header 텍스트로 바꾸고 9개 통과한다.
- [x] 치수: 컨트롤 높이 32px(shadcn 기본 `h-8`, 툴바의 Select·Button과 같음), 간격 8·12·16px(web-compact spacing sm·md·lg), 카드 반경 `--radius-lg`. 논문 목록 카드 폭 `min(610px, 100% - 44px)`과 위치는 현재 값 유지.

## 설계

- `ExploreToolbar.tsx`: `InputGroup` 도입. 나머지 컨트롤(Select·Slider·Button)은 그대로. 레이아웃은 `.explore-toolbar`(flex wrap) 유지.
- `PaperListOverlay.tsx`: 바깥 `section.paper-overlay`를 `Card`로 바꾸고 `.paper-overlay`의 위치·크기 규칙은 `.paper-overlay` 대신 Tailwind 레이아웃 클래스(`absolute left-5 bottom-5 z-10 flex max-h-[min(520px,calc(100%-75px))] w-[min(610px,calc(100%-44px))] flex-col`)로 옮긴다. 열림 시 포커스·Escape·페이지 보정 효과는 유지.
- `FlowView.tsx`: 헤더의 `.seg` → `ToggleGroup`. `aside.detail.flow-detail` → `Card`. 목록은 `WorkList`.
- `ClusterPanel.tsx`: 목록 두 곳 중 피인용 상위를 `WorkList`로, 라벨 클래스를 `.eyebrow`로.
- 추가 컴포넌트: `card`·`input-group`·`pagination`(+의존 `textarea`)은 이미 CLI로 추가했다. `cn` import만 기존 파일과 같이 `@/lib/utils`.

## 버린 대안

- 논문 목록을 `Dialog`/`Sheet`로: 모달이 되어 지도 조작이 막힌다. 스펙(product-foundation)의 비모달 오버레이를 유지한다.
- `Pagination`에 페이지 번호 링크: 425페이지를 번호로 늘어놓을 이유가 없다.
- Flow 갈래 상세를 우측 인스펙터로: 시간 창 클러스터는 지도 클러스터와 의미가 다르다(intent 범위 밖).
- 리본 hover 툴팁을 `Tooltip`으로: SVG path 트리거와 위치 계산이 별도 작업이다.

## 함정

- `PaginationLink`는 `<a>`라 `disabled`가 없다. `aria-disabled`와 포인터 차단으로 막고 키보드 초점도 뺀다.
- `InputGroupAddon`은 DOM에서 `InputGroupInput` 뒤에 둬야 초점 관리가 맞다(문서). `align`으로 시각 위치를 정한다.
- 한글 조합: `InputGroupInput`은 `Input`을 감싸므로 `onCompositionStart/End`가 그대로 통한다.
- `Card`는 `--card-spacing`으로 패딩을 잡는다. 목록 카드는 표가 가장자리까지 닿아야 하므로 `CardContent className="px-0"`.
- `.paper-overlay`를 지우면 모바일 미디어 쿼리 안의 `.paper-overlay` 규칙(왼쪽 10px 등)도 같이 지우고 Tailwind 반응형 클래스로 옮긴다.
- E2E 시나리오 2가 `.overlay-header` 텍스트로 건수를 대조한다. `CardHeader` 안의 `Badge`가 같은 숫자를 보이게 한다.

## 완료 기준

```sh
cd frontend
npm run test -- --run
npm run build
npm run lint
npm run test:e2e
grep -rn "paper-overlay\|paper-title-button\|overlay-header\|search-control\|year-filter\|flow-detail\|\"seg\|cl-works\|cl-sec\|cl-eyebrow\|className=\"detail\|className=\"close\|className=\"tag\|className=\"topics" src   # 0건
```

브라우저: 검색 "retrieval" → 건수·지우기 버튼, 1자 안내, 연도 슬라이더·숫자 입력, 논문 목록 열기→정렬→다음 페이지→제목 클릭→인스펙터, 갈래 흐름 → 신호 토글 4개 → 노드 클릭 → 카드 상세 → 논문 클릭 → 인스펙터. 390×844 목록 카드 가로 넘침 없음. 콘솔 오류 0.

구현·검증 완료: 2026-09-17. Vitest 11, build, lint(경고 7), Playwright 9/9 통과. 브라우저(1021×1127, 375×812)에서 검색·지우기·1자 안내·연도 입력, 목록 카드의 정렬·페이지·제목 클릭, 갈래 흐름의 신호 토글·노드 선택·카드 상세·논문 클릭을 확인했다. `grep`으로 제거한 클래스의 참조 0건.
