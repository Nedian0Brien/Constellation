---
title: 컨스텔레이션 제품 기반 구축
slug: product-foundation
stage: plan
status: accepted
intent: .intent/intent_product-foundation.md
spec: .intent/spec_product-foundation.md
date: 2026-09-09
---

# 컨스텔레이션 제품 기반 구축 — 구현 계획

## 바뀌는 파일

| 구분 | 파일 | 변경 |
|---|---|---|
| 수정 | `backend/constellation/config.py`, `.env.example`, `README.md` | 저장소 루트와 데이터 경로 정합성, `CONSTELLATION_DATA_DIR` 선택, 실행·검증 안내 |
| 수정·신규 | `backend/constellation/api/app.py`, `backend/constellation/db/queries.py`(신규) | `/api/works` 페이지 조회, `/api/matches` 전체 일치 ID; run·검색·연도 조건 공유, 오류 구분 |
| 신규 | `backend/tests/test_queries.py`, `backend/tests/test_api.py`, `backend/tests/fixtures.py` | 임시 DB로 정렬·페이지·결측·run 격리·잘못된 입력 검증 |
| 수정 | `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.ts`, `frontend/tsconfig.app.json` | shadcn·Tailwind, TanStack Router·Query·Table, Vitest·Playwright와 경로 별칭 |
| 신규 | `frontend/components.json`, `frontend/src/lib/utils.ts`, `frontend/src/hooks/use-mobile.ts` | 공식 shadcn 레지스트리 설정과 공통 유틸리티 |
| 신규 | `frontend/src/components/ui/{sidebar,resizable,button,input,tooltip,slider,select,table,sheet,skeleton,alert,separator,field,toggle,toggle-group}.tsx` | 필요한 shadcn 컴포넌트를 추가하고 수락된 디자인 토큰 적용 |
| 수정 | `frontend/src/{main,App}.tsx`, `frontend/src/{api,store}.ts`, `frontend/src/index.css` | Provider 연결, 요청 취소·오류 타입, Zustand 일시 상태, 공통 스타일 |
| 신규 | `frontend/src/app/{router.tsx,navigation.ts}`, `frontend/src/hooks/{use-exploration,use-analysis,use-persistent-layout}.ts` | URL 검증·복원, Query 캐시, 패널 배치 저장 |
| 신규 | `frontend/src/components/{AppShell,AppSidebar,ExploreToolbar,PaperListOverlay,DataState}.tsx`, `frontend/src/styles/tokens.css` | 지도 중심 셸, 목록 오버레이, 오류·빈 상태, 디자인 시스템 적용 |
| 수정 | `frontend/src/views/{MapView,TreeView,FlowView,LineageView,SkyView}.tsx`, `frontend/src/panels/{DetailPanel,ClusterPanel}.tsx` | 기존 분석 결과 재사용, Query·URL 연동, 화면 전환 시 선택 보존 |
| 신규 | `frontend/src/views/map/{labels,regions}.ts` | 실제 계층 트리 기반 줌 라벨·가시 범위 계산과 은은한 영역 표현 |
| 신규 | `frontend/src/app/navigation.test.ts`, `frontend/src/views/map/labels.test.ts`, `frontend/playwright.config.ts`, `frontend/e2e/exploration.spec.ts`, `docs/PRODUCT-FOUNDATION-QA.md` | URL·계층 경계 검증, 실제 API 연결 브라우저 시나리오와 결과 기록 |

구현 중 파일·순서가 바뀌면 같은 커밋에서 이 계획을 갱신한다. 서브에이전트 없이 현재 작업에서 구현한다.

## 작업 순서

1. **데이터·실행 기준 확보** — 복사·해시·DB 건수 검증 완료. Windows `C:\code\Constellation\data`를 로컬 `data/`로 복사하고 SHA-256을 검증한다. 10,604편·투영 42,416행·클러스터 45개·계층 89노드·Flow 116개를 확인한다. 원본을 수정하지 않는다.
2. **조회 계약** — 동일한 run·검색·연도 조건을 목록과 지도에 사용한다. 연도 미상 포함, ID 동률 정렬, 페이지 크기 제한, 역전된 연도·1자 검색 검증을 먼저 테스트한다. API 기본 실행에는 임베딩 GPU가 필요 없도록 기존 지연 import를 유지한다.
3. **상태 분리** — TanStack Router가 탐색 상태, Query가 서버 데이터를 소유한다. 화면·논문 이동은 history push, 연속 입력은 replace로 처리한다. run 변경 때 종속 선택을 정리하고 캔버스 위치는 run별로 보존한다. 한국어 조합 중 검색을 지연한다.
4. **앱 셸과 디자인 적용** — `docs/design-system`의 차콜 표면·점/선/눈금 컨트롤을 적용한다. 좌우 패널 조절·접기·복원과 모바일 오버레이, 목록 열기·정렬·필터·선택을 구현한다. 목록은 지도를 유지한 채 겹쳐 표시한다.
5. **분석 화면 연결** — 기존 다섯 화면을 실제 결과에 연결한다. 지도는 실제 `cluster_tree`로 상위/하위 라벨을 계산하고 확대 시 가시 논문 제목을 표시한다. 외곽선 없는 영역, 영역 중심 흰색 이름, 240ms 라벨 교차 페이드와 동작 줄이기를 적용한다. HTML 표본의 가짜 좌표·배율 임계값을 분석 데이터에 그대로 적용하지 않는다.
6. **검증과 전달** — 아래 검사와 브라우저 시나리오를 실행하고 실패를 수정한다. 검증 결과·실행 방법을 기록한 뒤 작업 파일만 커밋·푸시한다. PR은 요청 시 작성한다.

## 가장 위험한 단계

URL·Query 전환 중 초기 데이터 응답이 탐색 상태를 덮거나 다른 run의 결과가 섞일 수 있다. 키에 run·조건을 포함하고 AbortSignal을 연결하며 지연 응답·새로고침·뒤로 가기 테스트로 검증한다. 실제 DB는 읽기 전용으로 조회하고 테스트는 별도 임시 DB에서 실행한다. 단계별 커밋으로 분리해 문제가 있는 코드 커밋만 되돌린다. 원본 DB·모델·기존 디자인 아티팩트는 복구 작업에서도 보존한다.

## 검증

```sh
.venv/bin/python -m unittest discover -s backend/tests -v
npm --prefix frontend run test -- --run
npm --prefix frontend run build
npm --prefix frontend run lint
.venv/bin/constellation serve
npm --prefix frontend run dev
npm --prefix frontend run test:e2e
```

브라우저: 실제 SciNCL run에서 지도→목록 오버레이→논문 선택→다른 분석 화면→뒤로 가기→새로고침. 검색 결과 건수·연도 미상·정렬·페이지, 빠른 run 전환, 패널 마우스/키보드 조절과 복원, 확대별 라벨·역방향 페이드, 모바일 가로 넘침, 산출물 없음·서버 오류·재시도를 확인한다. 다른 모델 run에 없는 클러스터·Flow는 누락 상태로 표시한다. 성능은 실제 데이터에서 조작 중 입력 지연·렌더링 정지 여부를 확인하고 QA 문서에 관찰 환경을 기록한다.

## 게이트

데이터 복사와 검증을 완료했다. 2026-09-12 사용자의 “구현 진행”으로 수락되었다.
