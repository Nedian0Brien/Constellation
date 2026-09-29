---
title: 검색 바를 지도 안 상단의 유리 pill로
slug: search-pill
stage: plan
date: 2026-09-30
---

# 검색 바를 지도 안 상단의 유리 pill로 — plan

## 순서

1. `frontend/src/components/ExploreToolbar.tsx` → `StageSearch.tsx`로 이름을 바꾸고 마크업을 `.stage-search > .search-pill + .search-bubble`로 나눈다. 필터 초기화는 `Button size="icon-sm" variant="ghost"` + `X` 아이콘 + `Tooltip`.
2. `AppShell.tsx`: `<ExploreToolbar />`를 지우고 `.analysis-stage` 안의 뷰·`YearRange` 뒤에 `<StageSearch />`를 둔다(에러·빈 상태 화면에서는 두지 않는다 — 검색할 대상이 없다).
3. `index.css`: `.explore-toolbar` 규칙(기본·모바일) 삭제, `.stage-search`·`.search-pill`·`.search-bubble`·유리 재질·`@supports not (backdrop-filter)` 대체, `.analysis-stage { container-type: inline-size }`, 캡션 이동과 좁은 폭 규칙을 `@container`로.
4. 브라우저(1440×950, 1100, 800, 모바일)에서 다섯 뷰의 겹침을 확인하고 캡션 임계 폭을 실측으로 정한다.
5. `npm run build`, `npx tsc -b`, E2E(`E2E_PORT` 지정) 실행.
6. 데스크톱 앱을 빌드해 WKWebView에서 blur 동작을 확인하고 `/Applications`의 앱을 교체한다(사용자 확인 후).

## 검증

- 지도 높이 전후 비교(`.analysis-stage` clientHeight).
- 대비: 바탕 `rgb(12 17 24 / .62)`를 흰 바탕에 합성하면 약 `#686b70`, 흰 글자 대비 약 5.4:1.
- E2E 결과를 이 절에 적는다.

## 결과

(구현 후 채운다)
