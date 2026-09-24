# Constellation

논문 초록과 인용 관계로 연구 분야의 구조와 변화를 탐색하는 데스크톱 앱.

## 제품 기반

Tauri 2(Rust) 데스크톱 앱이 DuckDB 파일을 프로세스 안에서 직접 읽는다. 화면은 React·Vite·shadcn/ui, TanStack Router·Query·Table, deck.gl이고, 질의 계층은 Rust 크레이트 `constellation-core`다. Python은 수집·임베딩·클러스터링 파이프라인(CLI)만 맡는다.

- **연구 지도**: 논문을 별로 배치하고 확대 수준에 따라 상위 분야·하위 분야·논문 제목을 표시한다. 영역 범위는 은은한 색 면, 분야 라벨은 중심의 흰색 글자다. 점에 0.5초 머물면 run 안 인용 관계(참조 파랑·피인용 빨강)와 이웃의 제목이 나타나고, 점을 클릭하면 선택 모드 — 노드 둘레의 버튼으로 상세, AI 질문, 로컬 그래프(이웃끼리의 인용까지)를 연다.
- **논문 목록**: 지도를 유지한 채 오버레이로 열고 검색·연도 필터·정렬·페이지 이동·논문 선택을 제공한다.
- **계층 트리 / 갈래 흐름 / 인용 계보 / 3D**: 기존 분석 산출물에 연결된다. 모델마다 없는 산출물은 안내한다.
- **에이전트 채팅**: 우측 패널에서 자연어로 코퍼스를 묻고 지도를 움직인다. 논문·주제 검색과 상세, 필터, 카메라 이동·확대, 라벨·지시선, 논문·주제 선택까지 도구로 실행하며 대화는 run별로 저장돼 새로고침 뒤에도 이어진다.
- **탐색 복원**: 검색·연도·선택·화면·목록 상태는 URL, 좌우 패널의 열림 상태는 로컬 저장소에 보관한다. 지도 위치는 현재 세션에서 run별로 유지한다.

## 데스크톱 앱

Rust 1.97 이상과 Node.js가 필요하다. 첫 빌드는 DuckDB를 소스에서 컴파일하므로 몇 분 걸리고, 이후는 캐시된다.

```sh
npm --prefix frontend ci
npx --prefix frontend tauri dev                    # 개발: Vite + Rust 앱 창
npx --prefix frontend tauri build --bundles app    # 배포: target/release/bundle/macos/Constellation.app
```

앱은 `~/Library/Application Support/io.github.nedian0brien.constellation/constellation.duckdb`를 찾고, 없으면 화면의 **데이터베이스 열기**로 파이프라인이 만든 `.duckdb` 파일을 고른다. 고른 경로는 같은 폴더의 `settings.json`에 남는다. 빌드한 `.app`은 ad-hoc 서명이라 이 Mac에서 바로 실행되고, 다른 Mac에 배포하려면 서명·공증이 필요하다.

`tauri` 명령은 저장소 루트에서 `npx --prefix frontend tauri …`로 부른다. `src-tauri/`가 루트에 있고 Tauri CLI는 현재 폴더 아래에서 그것을 찾는다.

## 브라우저에서 확인

Playwright E2E와 브라우저 확인은 개발용 HTTP 서버가 같은 질의 계층을 `/api/*`로 노출한다.

```sh
cargo run -p constellation-serve -- --db data/constellation.duckdb   # 127.0.0.1:8000
npm --prefix frontend run dev                                        # http://localhost:5173, /api를 8000으로 프록시
```

## 에이전트 채팅

우측 패널의 채팅은 [agent-chat-framework](../framework/agent-chat-framework) 위에 있다. 화면은 그 레지스트리(`@acf/thread-aui` 계열)로 그리고, 백엔드는 `agent/`의 Node 서버가 Claude Agent SDK로 `claude` CLI를 띄운다. 기계에 Claude 로그인(`claude login`) 또는 `ANTHROPIC_API_KEY`가 있어야 한다.

```sh
npm --prefix agent ci
npm --prefix agent start        # 127.0.0.1:8787. Vite가 /api/agent 를 여기로 프록시한다
```

`frontend/components.json`의 `@acf` 레지스트리는 `http://127.0.0.1:3100`을 가리킨다. 설치본을 갱신하려면 프레임워크의 `public/`을 그 포트로 띄우고(`python3 -m http.server 3100`) `npx shadcn@latest add @acf/thread-aui`를 돌린다. 평소 실행에는 필요 없다.

에이전트의 도구는 전부 웹뷰 안에서 실행된다. 서버는 도구 이름과 스키마만 알고 호출을 웹뷰에 중계한 뒤 결과를 모델에 돌려준다. 그래서 브라우저(`/api`)와 데스크톱(`invoke`) 어느 쪽에서도 같은 코드가 돈다. 브라우저는 Vite 프록시로, 데스크톱 앱(설치본과 `tauri dev`)은 웹뷰가 `http://127.0.0.1:8787`을 직접 불러 서버에 닿는다. 어느 쪽이든 서버를 띄워 두면 된다. `.app`에 서버를 사이드카로 묶는 일은 아직 하지 않았다.

에이전트가 할 수 있는 일:

- 코퍼스 읽기 — 주제 목록·상세, 논문 검색·상세, 한 논문의 참고문헌·피인용(`get_citations`), 분석의 메인패스와 씨앗 논문 주변 계보(`get_lineage`), 논문 2–6편 비교표(`compare_papers`: 상호 인용·같은 주제·지도 거리).
- 지도 조작 — 필터, 카메라 이동·확대, 라벨·지시선, 논문·주제 상세 열기, 화면·색 기준 전환.
- 웹 — Agent SDK 내장 `WebSearch`·`WebFetch`. 코퍼스 밖 후속 연구·저자·최신 피인용을 찾을 때 쓰고, 답에 출처 URL을 적는다. 파일·셸 도구는 열지 않는다.

여러 워크트리가 각자 Rust 서버를 띄울 때는 `CONSTELLATION_API=http://127.0.0.1:8002 npm --prefix frontend run dev` 처럼 Vite 프록시 대상을 바꾼다.

## 파이프라인 (Python)

수집·임베딩·클러스터링은 Python CLI다. 기존 `data/constellation.duckdb`가 있으면 다시 돌릴 필요가 없다.

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -e '.[embed]'
.venv/bin/constellation --help
```

Windows에서는 Python 경로를 `.venv/Scripts/python.exe`, CLI 경로를 `.venv/Scripts/constellation.exe`로 바꾼다.

다른 데이터 폴더를 사용하려면 환경변수 또는 저장소 루트 `.env`에 `CONSTELLATION_DATA_DIR`을 설정한다. 상대 경로는 저장소 루트를 기준으로 해석한다. 데이터는 Git에 포함되지 않는다.

영역 이름은 `constellation name`이 붙인다. 로컬 모델 대신 기계에 로그인된 `codex`(기본, `gpt-6-luna`) 또는 `claude`(`--backend claude`, `opus`) CLI를 부르므로 API 키가 필요 없다. 잎 45개와 내부 노드 44개를 각각 한 호출로 짓고, 서로 다른 분야가 지도에서 이웃이라는 이유로 한 노드에 묶인 경우는 `A · B` 이름을 주고 지도 레벨에서 자식 둘로 갈라 보인다(`tree_levels`). 원래 절단으로 되돌리려면 `constellation hierarchy`를 다시 돌린다. 프롬프트와 출력은 `naming_audit` 테이블에 남는다.

## 지도 조작

- 점 클릭: 논문 상세. 목록에서 같은 논문을 선택할 수도 있다.
- 휠·트랙패드 또는 +/−: 확대·축소. 드래그: 이동.
- 지도에 키보드 초점을 두면 방향키로 이동하고 +/−로 확대·축소한다.
- 분야 이름 클릭: 해당 분야 선택과 확대. ‘필터 초기화’ 또는 ‘지도 전체 보기’로 해제한다.
- 탐색 패널: 상단 버튼, 패널 가장자리 레일, `⌘B`(Windows `Ctrl+B`)로 접고 편다. 접으면 아이콘 레일이 남는다.
- 논문·주제 상세: 지도 점·목록 행·분야 이름·트리 노드를 고르면 창이 열린다. ✕·Escape·바깥 클릭으로 닫으면 선택이 지워진다.
- 에이전트 패널: 헤더의 로봇 아이콘으로 여닫는다. "새 대화"는 현재 run의 대화를 비운다.
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

임베딩은 CUDA, Apple GPU(MPS), CPU 순으로 장치를 고른다.

### 코퍼스를 하나 더 만들기

파이프라인의 각 단계는 DB 전체를 읽는다. 다른 분야 코퍼스는 데이터 폴더를 따로 두어야 기존 지도와 섞이지 않는다. 피지컬 AI 코퍼스([결과](docs/PHYSICAL-AI-RESULTS.md))는 이렇게 만들었다.

```sh
export CONSTELLATION_DATA_DIR=data/physical-ai     # 명령마다 같은 폴더. .env에는 넣지 않는다
export PYTORCH_ENABLE_MPS_FALLBACK=1              # MPS가 지원하지 않는 연산은 CPU로
.venv/bin/constellation collect --set physical-ai            # 로봇·체화 AI, 연 800편
.venv/bin/constellation collect --set physical-ai-driving    # 자율주행, 연 400편
.venv/bin/constellation backfill --max 1500
.venv/bin/constellation enrich
.venv/bin/constellation embed --model scincl --batch 128
.venv/bin/constellation project --model scincl
.venv/bin/constellation cluster
.venv/bin/constellation hierarchy
.venv/bin/constellation name
.venv/bin/constellation flow
.venv/bin/constellation lineage
cargo run -p constellation-serve -- --db data/physical-ai/constellation.duckdb --port 8003
```

데스크톱 앱에서는 **데이터베이스 열기**로 `data/physical-ai/constellation.duckdb`를 고른다.

## 검증

```sh
npm --prefix agent test
.venv/bin/python -m unittest discover -s backend/tests -v
npm --prefix frontend run test -- --run
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

브라우저 검사는 기존 SciNCL 데이터와 다른 모델의 투영 결과를 사용한다. API 테스트는 임시 DB에서 실행한다. 상세 결과는 [검증 기록](docs/PRODUCT-FOUNDATION-QA.md)에 남긴다.

## 홍보 영상

`video/`는 Remotion 프로젝트다. 연구 지도와 분석 뷰를 앱과 같은 배치 코드(`frontend/src/views/map/`, `views/{tree,flow,lineage}/layout.ts`)로 프레임마다 그려 MP4로 낸다. 1280×720 컴포지션을 기기 픽셀 비율 1.5로 렌더해 1920×1080이 나온다. 30초 티저(`Teaser`)는 피지컬 AI 코퍼스를 쓴다.

```sh
npm --prefix frontend ci && npm --prefix video ci
cargo run -p constellation-serve -- --db data/physical-ai/constellation.duckdb --port 8003
CONSTELLATION_API=http://127.0.0.1:8003 CONSTELLATION_RUN=project-scincl-20260923T165703Z npm --prefix video run snapshot
npm --prefix video run studio          # 미리보기
npm --prefix video run render:teaser   # 합성 사운드 + video/out/teaser.mp4
```

스냅샷(`video/public/data/`)과 사운드(`video/public/audio/`)는 git 밖이다. 사운드 스크립트는 `src/timeline.ts`를 직접 import하므로 Node 23.6 이상(TS 타입 제거 기본 지원)이 필요하다. 채팅 장면은 실제 에이전트 대화 기록(`video/src/recording/agent-thread.json`)을 재생한다. `npm --prefix video run typecheck`는 frontend 파일의 타입을 `frontend/node_modules`에서 읽는다. 장면 구성과 앱과 다르게 그린 부분은 [스토리보드](video/STORYBOARD.md)에 있다. 개인·3인 이하 조직은 Remotion을 무료로 쓰고, 그보다 큰 회사는 [회사 라이선스](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)가 필요하다.

`video/motion/`은 같은 데이터로 만든 30초 앱 쇼케이스다. 실행 중인 앱 창을 찍은 화면(`assets/`) 위에 앱 지도 모듈을 묶은 `app-map.js`로 지도를 프레임마다 그리고, 그 창을 WebGL 원근으로 무대에 띄운다. `video.html`을 브라우저로 열면 재생된다(`app-map.js`, `data.js`, `assets/`를 옆에 둔다). 추출은 js-motion-video 스킬의 `render.mjs`(헤드리스 Chrome → ffmpeg)로 한다. 캡처는 피지컬 AI API(8003)와 프런트엔드(5181)를 띄운 상태에서 돌린다.

```sh
node video/motion/capture/capture.mjs     # 실행 중인 앱 → video/motion/assets/ (창 화면, 입력 과정, 대화)
node video/motion/build-data.mjs          # 스냅샷·대화 기록·캡처 위치 → video/motion/data.js
node video/motion/src/build-app-map.mjs   # frontend/src/views/map → video/motion/app-map.js (video 패키지의 esbuild)
python3 video/motion/src/assemble.py      # src/video.js → video/motion/video.html
node ~/.claude/skills/js-motion-video/tool/render.mjs video/motion/video.html video   # video/motion/video.mp4
```

## 문서

- [디자인 시스템](docs/design-system/index.html) · [CSS 토큰](docs/design-system/constellation-tokens.css)
- [제품 Spec](.intent/spec_product-foundation.md) · [구현 Plan](.intent/plan_product-foundation.md)
- [기획서](docs/PLAN.md) · [아키텍처](docs/ARCHITECTURE.md)
- [M0 수집 결과](docs/M0-RESULTS.md) · [M1 모델 비교](docs/M1-MODEL-COMPARISON.md) · [M2 군집 결과](docs/M2-RESULTS.md)
- [데이터 소스](docs/DATA-SOURCES.md)

기존 RAG/IR 코퍼스는 10,604편이다. 수집어 충돌에 따른 다른 분야 논문이 포함되어 있으며, 과거 실험 수치와 한계는 각 결과 문서에서 확인한다.
