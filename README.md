# Constellation

논문 초록과 인용 관계로 연구 분야의 구조와 변화를 탐색하는 로컬 웹앱.

## 제품 기반

React·Vite·shadcn/ui, TanStack Router·Query·Table, deck.gl, FastAPI·DuckDB를 사용한다.

- **연구 지도**: 논문을 별로 배치하고 확대 수준에 따라 상위 분야·하위 분야·논문 제목을 표시한다. 영역 범위는 은은한 색 면, 분야 라벨은 중심의 흰색 글자다.
- **논문 목록**: 지도를 유지한 채 오버레이로 열고 검색·연도 필터·정렬·페이지 이동·논문 선택을 제공한다.
- **계층 트리 / 갈래 흐름 / 인용 계보 / 3D**: 기존 분석 산출물에 연결된다. 모델마다 없는 산출물은 안내한다.
- **탐색 복원**: 검색·연도·선택·화면·목록 상태는 URL, 패널 크기와 접힘 상태는 로컬 저장소에 보관한다. 지도 위치는 현재 세션에서 run별로 유지한다.

## 실행

Python 3.12 이상과 Node.js가 필요하다. 기존 `data/constellation.duckdb`가 있으면 수집이나 GPU 임베딩을 다시 실행할 필요가 없다.

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -e '.[api]'
npm --prefix frontend ci

# 각각 별도 터미널에서 실행
.venv/bin/constellation serve
npm --prefix frontend run dev
```

브라우저에서 `http://localhost:5173`을 연다. 프론트는 `/api`를 사용하며 Vite가 `127.0.0.1:8000`으로 연결한다.

Windows에서는 Python 경로를 `.venv/Scripts/python.exe`, CLI 경로를 `.venv/Scripts/constellation.exe`로 바꾼다.

다른 데이터 폴더를 사용하려면 환경변수 또는 저장소 루트 `.env`에 `CONSTELLATION_DATA_DIR`을 설정한다. 상대 경로는 저장소 루트를 기준으로 해석한다. 데이터는 Git에 포함되지 않는다.

## 지도 조작

- 점 클릭: 논문 상세. 목록에서 같은 논문을 선택할 수도 있다.
- 휠·트랙패드 또는 +/−: 확대·축소. 드래그: 이동.
- 지도에 키보드 초점을 두면 방향키로 이동하고 +/−로 확대·축소한다.
- 분야 이름 클릭: 해당 분야 선택과 확대. ‘필터 초기화’ 또는 ‘지도 전체 보기’로 해제한다.
- 패널 구분선: 드래그 또는 키보드 화살표로 조절. 상단 버튼으로 접기·복원한다.
- 목록에서 Escape: 지도 상태를 유지하며 목록을 닫는다.

검색은 제목과 초록의 부분 문자열을 대상으로 한다. 두 글자 이상 입력하며 연도 미상 논문은 연도 필터에 포함한다. 지도와 목록은 같은 검색 조건을 사용한다. 클러스터·트리 선택은 지도 강조에 사용한다.

## 수집과 분석

새 코퍼스는 OpenAlex API 키를 `.env.example`을 참고해 설정한 뒤 수집한다. 임베딩 단계는 별도의 모델 의존성과 실행 장치가 필요하다.

```sh
.venv/bin/constellation sets
.venv/bin/constellation collect --set rag-ir
.venv/bin/constellation stats
.venv/bin/constellation backfill
uv pip install --python .venv/bin/python -e '.[embed]'
.venv/bin/constellation embed --model scincl --batch 128
.venv/bin/constellation project --model scincl
.venv/bin/constellation cluster
.venv/bin/constellation hierarchy
.venv/bin/constellation flow
.venv/bin/constellation lineage
```

API 조회에는 GPU가 필요 없다. 재수집·임베딩·분석은 명시적으로 실행하며 기존 데이터를 자동 변경하지 않는다. Scopus 어댑터는 후속 작업이다.

## 검증

```sh
.venv/bin/python -m unittest discover -s backend/tests -v
npm --prefix frontend run test -- --run
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

브라우저 검사는 기존 SciNCL 데이터와 다른 모델의 투영 결과를 사용한다. API 테스트는 임시 DB에서 실행한다. 상세 결과는 [검증 기록](docs/PRODUCT-FOUNDATION-QA.md)에 남긴다.

## 문서

- [디자인 시스템](docs/design-system/index.html) · [CSS 토큰](docs/design-system/constellation-tokens.css)
- [제품 Spec](.intent/spec_product-foundation.md) · [구현 Plan](.intent/plan_product-foundation.md)
- [기획서](docs/PLAN.md) · [아키텍처](docs/ARCHITECTURE.md)
- [M0 수집 결과](docs/M0-RESULTS.md) · [M1 모델 비교](docs/M1-MODEL-COMPARISON.md) · [M2 군집 결과](docs/M2-RESULTS.md)
- [데이터 소스](docs/DATA-SOURCES.md)

기존 RAG/IR 코퍼스는 10,604편이다. 수집어 충돌에 따른 다른 분야 논문이 포함되어 있으며, 과거 실험 수치와 한계는 각 결과 문서에서 확인한다.
