---
title: 재생 중 점·영역 이름·영역 배경이 부드럽게 나타난다
slug: playhead-fade
stage: plan
status: accepted
intent: .intent/intent_playhead-fade.md
spec: .intent/spec_playhead-fade.md
date: 2026-09-22
---

# 재생 중 부드러운 등장 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `frontend/package.json`, `package-lock.json` | `@deck.gl/extensions@~9.3.10` 추가 |
| `frontend/src/hooks/use-playhead.ts` | 소수 헤드 저장, `usePlayhead()`는 floor, `usePlayheadExact()` 추가 |
| `frontend/src/components/YearRange.tsx` | 루프가 소수 헤드를 그대로 스토어에 쓴다 |
| `frontend/src/views/MapView.tsx` | `papers` 레이어를 `data: points` + `DataFilterExtension`(소프트 범위), `soft-regions`에 `transitions`, `usePlayheadExact` 구독 |
| `frontend/src/index.css` | `.region-name[data-active="true"]` 등장 animation |

## 작업 순서

1. `use-playhead.ts`·`YearRange.tsx` — `tsc` 통과, 기존 E2E "year playhead" 통과(정수 동작 유지 확인).
2. `MapView.tsx` 점 레이어 — 브라우저에서 재생 중 점이 서서히 나타나고, 정지 상태에서 범위 필터가 전과 같은지(`from`·`to` 끌기) 확인. 옅은 점 위 호버가 안 잡히는지 확인.
3. `soft-regions` transitions, `.region-name` animation — 브라우저 확인.
4. `tsc`·lint·vitest·E2E. 커밋: `feat: 재생 중 점은 헤드를 따라 서서히 나타나고, 영역 이름·배경은 240ms로 이어진다`.

## 가장 위험한 단계

2단계. `data: points`로 바꾸면서 연도 없는 논문이나 `from` 변경이 잘못 걸러지면 정지 상태의 지도가 전과 달라진다. `getFilterValue`의 `updateTriggers`와 하한 값을 확인한다. 깨지면 이 커밋만 되돌린다 — 이전 커밋(재생 헤드)은 독립이다.

## 검증

```
cd frontend && npx tsc -b && npm run lint && npm test
cd frontend && E2E_PORT=5179 npx playwright test e2e/exploration.spec.ts -g "year playhead"
```
브라우저(`web-year-playhead`): `/?from=1995&to=2020` 재생 → 점 등장이 1초 페이드, 영역 이름 페이드인, 배경 계단 없음. `/?from=2010&to=2014`에서 정지 상태 편수·점 수가 전과 같음. `to` 손잡이를 끌면 즉시 반영.
