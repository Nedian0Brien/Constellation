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
| `video/motion/frames/{a,b,c}.html` | 새 파일. 스타일 프레임(`new.mjs --variants 3`) |
| `video/motion/video.html` | 새 파일. 본 제작(방향을 고른 뒤) |
| `video/motion/.gitignore` | `out/`, `*.mp4`, `frames.png`, `sheet.png` |
| `README.md` | "홍보 영상"에 JS 티저 명령 |

상위 분야 이름: spec은 원래 절단 8개를 말하지만, 스냅샷의 레벨 0은 이름 짓기가 이미 27개로 갈라 둔 상태다. 그래서 레벨 0에서 편수가 큰 순서로 8개를 쓴다.

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
