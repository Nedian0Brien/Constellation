---
title: 툴바·논문 목록·갈래 상세를 shadcn 부품으로 정리
slug: shadcn-views
stage: plan
status: accepted
intent: .intent/intent_shadcn-views.md
spec: .intent/spec_shadcn-views.md
date: 2026-09-17
---

# 툴바·논문 목록·갈래 상세를 shadcn 부품으로 정리 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `frontend/src/components/ui/{card,input-group,pagination,textarea}.tsx` (신규) | `npx shadcn@latest add card input-group pagination` 결과. `cn` import 정렬 |
| `frontend/src/panels/WorkList.tsx` (신규) | 피인용 상위 목록 `ItemGroup`+`Item` |
| `frontend/src/panels/ClusterPanel.tsx` | `WorkList` 사용, `.cl-*` → `.eyebrow` |
| `frontend/src/components/ExploreToolbar.tsx` | 검색창 `InputGroup`, 연도 필터 레이아웃 클래스 |
| `frontend/src/components/PaperListOverlay.tsx` | `Card`·`Badge`·`Pagination`·제목 `Button link` |
| `frontend/src/views/FlowView.tsx` | `ToggleGroup`, 상세 `Card`, `WorkList` |
| `frontend/src/index.css` | 스펙의 셀렉터 제거, 숫자 입력 스핀 버튼 전역 규칙 |
| `frontend/e2e/exploration.spec.ts` | region·testid 선택자 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. **WorkList + ClusterPanel** — 목록 공유 컴포넌트를 만들고 `ClusterPanel`이 쓰게 한다. `npx tsc -b`.
2. **ExploreToolbar** — `InputGroup`. 브라우저에서 검색·지우기·1자 안내·연도 입력 확인.
3. **PaperListOverlay** — `Card`·`Pagination`. 브라우저에서 열기·정렬·페이지·선택·Escape 확인.
4. **FlowView** — `ToggleGroup`·`Card`·`WorkList`. 브라우저에서 신호 토글·노드 선택·논문 클릭 확인.
5. **CSS** — 셀렉터 제거 후 `grep` 0건. `npm run build`.
6. **E2E·검증** — 선택자 갱신, 전체 명령 실행. 커밋은 1·2·3·4·5–6 단위. `git add`는 파일 지정.

## 가장 위험한 단계

3단계. 논문 목록의 위치·크기 규칙을 CSS에서 Tailwind 클래스로 옮기면서 모바일(≤959px) 배치가 어긋날 수 있다. 390×844에서 가로 넘침을 확인하고, 깨지면 3단계 커밋만 `git revert`한다.

## 검증

```sh
cd frontend
npm run test -- --run
npm run build
npm run lint
npm run test:e2e
```

브라우저 경로는 spec 완료 기준과 같다.

## 구현 중 계획에서 더한 것 — 2026-09-17

- 4·5단계를 한 커밋으로 묶었다. 지운 셀렉터의 마지막 사용처가 Flow 상세라 분리하면 중간 커밋에서 스타일이 깨진다.
- Slider의 `data-horizontal:w-full`이 `w-28`을 이겨 연도 입력이 30px로 눌렸다. 같은 변형으로 `data-horizontal:w-28`을 줘 해결했다.
- 반응형 클래스는 shadcn의 `md`(768px) 대신 셸 기준 `max-[960px]:`을 썼다. 모바일 판정 훅과 같은 폭이다.
- `CardTitle`은 `render`를 받지 않아 `h2` 대신 `div`에 id를 둔다. `aria-labelledby`는 그대로 동작한다.
