# 제품 기반 검증 — 2026-09-12

## 결과

제품 기반 Spec의 앱 셸·조회·상태 복원·지도 표현을 구현했다. 기존 DB를 읽기 전용으로 사용하며 수집·임베딩·분석을 재실행하지 않았다.

| 검사 | 결과 |
|---|---|
| Python unittest | 8개 통과: 목록/지도 조건 일치, run 격리, 정렬·페이지, 연도 미상, 입력 검증, 상세 범위, 데이터 경로 |
| Vitest | 8개 통과: URL 정규화·모델 전환·기본 run 결정·선택 보존·계층 탐색·라벨 충돌 |
| TypeScript + Vite build | 성공 |
| Oxlint | 종료 코드 0, 경고 7개(아래 설명) |
| Playwright 실데이터 E2E | 9개 통과, 최종 실행 24.9초 |
| 원본 DB 보존 | 전송 매니페스트 SHA-256과 일치 |

## 실행 환경과 데이터

- macOS, Python 3.12 가상환경, FastAPI, React 19·Vite 8.
- 테스트 브라우저: Playwright Chromium, 데스크톱 1440×950와 모바일 390×844.
- 실제 Codex in-app browser에서도 지도·목록 오버레이·선택 논문 상세를 렌더링하여 확인했다.
- API `127.0.0.1:8000`, 앱 `127.0.0.1:5173`. API health: works 10,604 / projection_runs 4.
- SciNCL: 클러스터 45개, 계층 89노드(8/18/45 레벨), 흐름 116개. 다른 모델의 없는 산출물은 누락 상태로 표시한다.
- DB SHA-256: `fb424085a8f58eb819be948c6cd426ae47d60f5800a721bbc34636f1ed58157e`.

## 실데이터 브라우저 시나리오

1. 지도 위 목록 열기, 카메라 불변 확인, 논문 선택, 상세, 계층 트리 이동, 뒤로 가기·새로고침 복원. 상세 접힘과 키보드로 조절한 탐색 패널 너비 복원.
2. retrieval 검색과 실제 `/api/matches` 건수 대조, 페이지·정렬 전환, 빈 검색과 1자 입력 안내.
3. 갈래 흐름·인용 계보·3D 진입, specter 모델에서 흐름 산출물 없음 안내.
4. 키보드 확대 후 논문 제목, 목록 닫기 후 배율 유지, 전체 보기로 계층 라벨 복귀.
5. 모바일 가로 넘침 없음, 탐색 Sheet·논문 목록·상세 Sheet의 열기·선택·닫기.
6. 지도 API 실패 주입 후 재시도 성공, URL 검색 조건 보존.
7. 이전 모델 응답을 700ms 지연시켜 빠른 모델 전환 후 현재 모델을 덮지 않는지 확인.
8. 손상된 저장 레이아웃, 잘못된 URL 값·없는 분야·없는 논문 복구.
9. 논문을 선택한 상태에서 연구 주제를 누르면 상세가 실제 클러스터로 바뀌는지 확인.

## 구현 중 발견하고 수정한 문제

- 기본 run을 URL에 추가하면서 깊은 링크의 선택·연도가 지워졌다. 초기 run 결정과 사용자의 모델 변경을 구분하고 회귀 테스트를 추가했다.
- 실제 분야 이름이 길어 라벨이 중첩되었다. 영역 중심은 유지하고 충돌하는 라벨을 억제하며 확대하면 단계적으로 드러낸다.
- 본문 조사에서 기존 `config.py`의 `parents[2]`를 잘못 해석했다. 이는 원래 저장소 루트가 맞았다. 기존 계산을 유지하고 명시적인 데이터 경로 설정과 경로 테스트를 추가했다.
- 기본 의존성에 누락된 PyArrow를 선언했다. GPU 모델은 API 실행 시 로드하지 않는다.

## 범위와 남은 경고

- 원래 코퍼스의 검색어 충돌·혼입은 그대로다. 임의로 논문을 제거하지 않았다.
- 지도 위치는 세션 내 run별 보존, URL은 Spec에 열거한 탐색 상태를 보존한다. 새로고침 후 카메라는 전체 보기 또는 선택 논문 위치에서 시작한다.
- 라벨은 가시 범위와 겹침을 고려한다. 모든 논문 제목을 한 화면에 동시에 배치하지 않는다. 목록에서는 전체 결과를 페이지 단위로 확인한다.
- Oxlint 경고: shadcn 및 메뉴 이름 상수의 Fast Refresh export 4건, TanStack Table의 React Compiler 호환성 1건, URL에 따른 검색 입력·상세 Sheet 동기화 effect 2건. React Compiler는 사용하지 않으며 실제 동작·복원 테스트를 통과했다.
- Vite는 WebGL을 포함한 초기 JS 청크 1.31MB(gzip 약 398KB)에 대해 크기 경고를 낸다. 실행 중 입력 정지는 관찰하지 않았으며 FPS·저사양 장치 성능을 수치로 보증하지 않는다.
- backend 테스트는 현재 Starlette/httpx 조합의 deprecation 경고가 있으나 테스트는 통과한다.

## 재현

README의 환경 설치 후 아래 명령을 실행한다.

```sh
.venv/bin/python -m unittest discover -s backend/tests -v
npm --prefix frontend run test -- --run
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

제품에 적용한 기준은 `docs/design-system/index.html`과 토큰 CSS다. 탐색 명령은 기능 이름을 사용하고 우주 은유는 지도·브랜드 표현에 적용했다.
