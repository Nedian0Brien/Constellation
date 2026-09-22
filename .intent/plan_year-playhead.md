---
title: 연도 재생을 동영상 재생 헤드처럼 — 빨간 세로선이 연속으로 움직이고 위에 현재 연도
slug: year-playhead
stage: plan
status: accepted
intent: .intent/intent_year-playhead.md
spec: .intent/spec_year-playhead.md
date: 2026-09-22
---

# 연도 재생 헤드 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `frontend/src/hooks/use-playhead.ts` (새) | 모듈 스토어 + `usePlayhead()`·`setPlayhead()` |
| `frontend/src/hooks/use-analysis.ts` | `yearTo = playhead ?? state.to`; `ids`가 이를 쓰고 훅이 내보낸다 |
| `frontend/src/views/MapView.tsx` | `inYears`가 `state.to` 대신 `a.yearTo` |
| `frontend/src/components/YearRange.tsx` | 재생 루프를 rAF 헤드로 교체, `.year-playhead` 렌더, 멈춤 지점 정리, 헤더 주석 |
| `frontend/src/index.css` | `.year-playhead*` 스타일, `[data-head]`일 때 손잡이 라벨 숨김 |
| `frontend/e2e/exploration.spec.ts` | "year playhead" 테스트 추가 |

## 작업 순서

1. `use-playhead.ts` 작성, `use-analysis.ts`·`MapView.tsx` 연결 — `npx tsc -b` 통과.
2. `YearRange.tsx` 재생 로직 교체 + 렌더 — `tsc`·`lint` 통과, 브라우저에서 재생·일시정지·끝·범위 변경 확인.
3. `index.css` — 헤드 선·라벨·채움이 손잡이·표식과 겹쳐도 읽히는지 확인.
4. E2E 추가 후 실행.
5. 커밋: `feat: 연도 재생을 두 손잡이 사이의 재생 헤드로 — 빨간 세로선이 연속 이동, 위에 현재 연도`.

## 가장 위험한 단계

2단계. rAF 루프가 오래된 `edges`·`to`를 잡으면 선이 엉뚱한 자리에 서거나 끝에서 멈추지 않는다. 모든 값을 ref로 읽고, 멈춤 지점마다 `stopPlay()` 하나를 부른다. 깨지면 이 커밋 하나를 되돌리면 된다(다른 파일은 `yearTo` 한 줄씩).

## 검증

```
cd frontend && npx tsc -b && npm run lint && npm test
cd frontend && npx playwright test e2e/exploration.spec.ts -g "year playhead"
```
브라우저(`constellation-web` 미리보기): `/?from=2010&to=2014`에서 재생 → 빨간 선이 2010 칸 왼쪽에서 2014 칸 오른쪽까지 5초에 걸쳐 이동, 위 연도가 2010→2014, 지도 점이 해마다 늘고, 끝에서 선이 사라지며 지도가 전체 범위로. 일시정지 → 선이 멈추고 재개 가능. 손잡이 끌기 → 선 사라짐.
