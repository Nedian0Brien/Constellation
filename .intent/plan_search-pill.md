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

- 계획과 달라진 점: 다른 뷰의 머리줄(`.tree-head`)·3D 조망 버튼·목록 오버레이 높이를 pill 줄에 맞춰 조정했다(브라우저 확인에서 겹침 발견). 초점 표시는 사용자 지시로 보라색 링 대신 테두리 밝기로 바꿨다.
- 지도 높이: 1440×950에서 `.analysis-stage` 796 → 857px (+61).
- 겹침 확인: 1440×950·1000×700·375×812(모바일)에서 지도·계층 트리·갈래 흐름·인용 계보·3D.
- `npx tsc -b` 통과, `npm run lint` 새 경고 없음(`set-state-in-effect`는 옮기기 전 코드의 기존 경고), `npm test` 51/51.
- E2E 13/13. `semantic zoom …` 테스트는 "중앙 1/4 안의 제목" 조건이 지도 크기에 의존해 실패했다. 화면 안에서 검색 줄·가장자리에 가리지 않는 제목 중 중앙에 가장 가까운 것을 고르도록 바꿨다(main 코드에서는 같은 테스트가 통과함을 확인).
- 6단계(데스크톱 앱 빌드·교체)는 사용자 확인 후 진행한다.
