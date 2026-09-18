---
title: 확대하면 점이 커지고, 점에 마우스를 올리면 인용 관계가 보이게
slug: map-hover
stage: plan
status: accepted
intent: .intent/intent_map-hover.md
spec: .intent/spec_map-hover.md
date: 2026-09-18
---

# 확대하면 점이 커지고, 점에 마우스를 올리면 인용 관계가 보이게 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `crates/constellation-core/src/queries/edges.rs` (새) | `EdgesData`, `edges(db, run)` |
| `crates/constellation-core/src/queries/mod.rs` | export |
| `crates/constellation-core/tests/queries.rs` | 표본에 자기 인용 행 추가, `edges` 테스트 |
| `crates/constellation-serve/src/main.rs` | `/api/edges` |
| `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/tests/commands.rs` | `edges` 명령과 검사 |
| `frontend/src/api.ts` | `EdgesData`, `fetchEdges` |
| `frontend/src/views/map/edges.ts` (새), `edges.test.ts` (새) | `citationIndex`, `linksOf`, `dotScale` |
| `frontend/src/views/MapView.tsx` | `radiusScale`·상한·고리, edges 질의, 호버 트윈, 선·강조 레이어, 다리·속성 |
| `frontend/e2e/exploration.spec.ts` | 4번 시나리오에 호버 단계 |

## 작업 순서

1. Rust: `edges.rs` + 테스트 → `cargo test -p constellation-core`. 서버 경로 → 8010에 띄워 `curl '/api/edges?run=…' | head -c 200`, `n`이 10604이고 배열 길이가 62,703 − 자기 인용인지 본다.
2. Tauri 명령 + 테스트 → `cargo test -p constellation-app`.
3. 프론트 `edges.ts` + Vitest → `npm run test -- --run`.
4. `MapView.tsx` 점 크기 → 브라우저에서 100%·3200%·6400% 점 지름 확인(캔버스 픽셀 측정).
5. `MapView.tsx` 호버 → 브라우저에서 선 색·페이드 타임라인(`data-hover-links`, 레이어 opacity) 확인, 프로덕션 RunTask 실측(호버 없음·호버 중).
6. E2E 단계 추가 → `CONSTELLATION_API=http://127.0.0.1:8010 npm run test:e2e`. 커밋 하나(또는 백엔드·프론트 둘).

## 가장 위험한 단계

5단계. 호버 상태 변경이 MapView 전체를 다시 렌더하는데, 그 안에서 제목 배열이나 색 배열이 다시 만들어지면 호버마다 수십 ms가 든다. `titles`·`colors` memo의 의존성에 호버 값이 들어가지 않게 하고, 실측으로 확인한다. 깨지면 호버 레이어만 별도 memo로 빼고 `hoverT`는 레이어 `opacity`에만 쓴다. 되돌리기는 커밋 단위 revert.

## 검증

```sh
cargo test -p constellation-core && cargo test -p constellation-app
cd frontend && npm run test -- --run && npm run lint && npm run build
CONSTELLATION_API=http://127.0.0.1:8010 npm run test:e2e
```

화면: `/?view=map`에서 `+`로 3200%까지 확대해 점 지름이 9px인지, 점에 올려 선이 나타나고 나머지가 옅어지는지, 떼면 되돌아오는지. 시스템 동작 줄이기를 켜면 즉시 바뀌는지.

## 구현 중 계획에서 더한 것 — 2026-09-18

- 호버 레이어(`hover-links`·`hover-nodes`)는 올린(또는 방금 뗀) 논문이 있을 때만 배열에 넣는다. deck은 falsy 항목을 거른다. 빈 레이어 둘을 늘 두면 휠마다 레이어 갱신 비용이 조금 더 든다.
- `__map.degree(id)`는 자료가 아직 없으면 −1, 모르는 id면 0.
- E2E는 4번 시나리오 끝에 붙였다. `degree > 0`인 제목이 나올 때까지 `expect.poll`로 기다린다(인용 자료가 지도 뒤에 따로 온다).
- 공용 8000 서버가 죽어 있어(spec 함정) 다시 띄웠다. E2E는 `E2E_PORT=5176`, `CONSTELLATION_API=http://127.0.0.1:8010`으로 돌렸다.
