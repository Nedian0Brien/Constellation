---
title: JS 모션그래픽 30초 티저
slug: motion-teaser
stage: plan
status: accepted
intent: .intent/intent_motion-teaser.md
spec: .intent/spec_motion-teaser.md
date: 2026-09-24
---

# JS 모션그래픽 30초 티저 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `video/motion/build-data.mjs` | 새 파일. 스냅샷·대화 기록 → `data.js` |
| `video/motion/data.js` | 새 파일(생성물, 커밋). `window.DATA` |
| `video/motion/frames/{a,b,c}.html` | 스타일 프레임(`new.mjs --variants 3`). 2D 전환 뒤 삭제(옛 `data.js` 형식에 묶여 있다) |
| `video/motion/src/video.js` | 새 파일. 본 제작 장면 코드(방향을 고른 뒤) |
| `video/motion/src/assemble.py` | 새 파일. `new.mjs`가 만든 엔진 포함 `video.html`에 `src/video.js`, `app-map.js`, `data.js`를 끼운다 |
| `video/motion/src/app-map.entry.ts`, `src/build-app-map.mjs` → `app-map.js` | 새 파일. 앱 지도 모듈을 esbuild로 묶은 전역 `AppMap`(생성물, 커밋) |
| `video/motion/video.html` | 새 파일(조립 결과, 커밋). 파일 하나로 열린다 |
| `video/motion/.gitignore` | `out/`, `*.mp4`, `frames.png`, `sheet.png` |
| `README.md` | "홍보 영상"에 JS 티저 명령 |

상위 분야 이름: spec은 원래 절단 8개를 말하지만, 스냅샷의 레벨 0은 이름 짓기가 이미 27개로 갈라 둔 상태다. 그래서 레벨 0에서 편수가 큰 순서로 8개를 쓴다.

~~3D 우주 방향~~(2D 전환으로 대체): `data.js`에 z와 분야별 3D 중심을 더했다. 별·빛줄기·라벨은 엔진 카메라(`cam.at`·`cam.project`)로 투영해 캔버스에 직접 그린다. 입자 시스템 대신 직접 그리는 이유는, 흩어진 상태에서 실제 좌표로 모이는 전환과 인용선 끝점을 같은 투영으로 다루기 위해서다.

확대 다이얼(사용자 요청): 앱 `ZoomDial.tsx`와 `index.css` `.zoom-*`의 비율(배율 1단계 48px, 0.25단계 눈금, 정수 단계 % 라벨, 고정 바늘, 위아래 마스크)과 색을 그대로 옮겨 오른쪽에 둔다. 2D 전환 뒤에는 앱과 같이 카메라 zoom과 기준 배율(`homeCamera`)의 차이로 %를 낸다.

2D 연구 지도(spec "변경"): 앱 지도 모듈(labels·regions·edges·style·titles)을 `app-map.js`로 묶어 영상이 그대로 부른다. `data.js`는 앱 API와 같은 모양(map·clusters·tree, 좌표는 소수 5자리)이다. deck.gl 레이어는 캔버스로 옮긴다: 영역 배경은 방사형 그러데이션, 점은 색별 Path2D, 제목은 `letterSpacing`을 쓴 모노 글자, 영역 이름의 두 겹 그림자는 화면 밖 글자의 그림자로 그린다. 1280×720 CSS 화면을 1.5배로 그린다(Remotion 버전과 같다). 앱 CSS 값은 실행 중인 앱에서 `getComputedStyle`로 읽었다.

새 연출(spec "연출 새로 짜기"): 카메라 상태는 {target, zoom, pitch, bearing}이다. 지도 점은 target 기준 화면 픽셀 오프셋을 bearing으로 돌리고, 화면 가로축을 중심으로 pitch만큼 기울인 평면에 원근 투영한다(초점거리는 STYLE). 앱 함수는 이 투영을 viewport로 받아 그대로 쓴다. 점·고리 반지름은 앱 픽셀값 × 깊이 배율, 영역 배경은 세로를 cos(pitch)로 누른 타원이다. 먼 쪽 제목·영역 이름은 깊이 배율로 옅게 한다.

## 작업 순서

1. `build-data.mjs` 작성 → `data.js` 생성
   - 확인: n=16,554, RT-1 참조 34·피인용 135, 라벨 3개의 id가 지도에 있다
2. 스타일 프레임 3개. t=16 인용선 장면.
   - 확인: `render.mjs compare frames/*.html --at 16`의 `frames.png`
   - 사용자 선택을 기다린다
3. `video.html` 본 제작
   - 확인: `stills` 시트, `determinism`
4. `render.mjs video` 추출. 확인: 마지막 줄 `OK`, `audio=aac`, 음량
5. README, 커밋·푸시, PR 본문 갱신

## 가장 위험한 단계

- 3단계의 재생 성능(점 16,554개 × 30fps). 추출은 프레임 단위라 결과는 같지만, 브라우저 재생이 끊기면 입자 대신 캔버스 직접 그리기로 바꾼다.

## 검증

```
node video/motion/build-data.mjs
node ~/.claude/skills/js-motion-video/tool/render.mjs compare video/motion/frames/*.html --at 16
node ~/.claude/skills/js-motion-video/tool/render.mjs video/motion/video.html stills 2 7 12 16 22 25 28
node ~/.claude/skills/js-motion-video/tool/render.mjs video/motion/video.html determinism 16
node ~/.claude/skills/js-motion-video/tool/render.mjs video/motion/video.html video
```
