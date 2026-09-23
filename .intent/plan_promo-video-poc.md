---
title: Remotion 홍보 영상 PoC
slug: promo-video-poc
stage: plan
status: accepted
intent: .intent/intent_promo-video-poc.md
spec: .intent/spec_promo-video-poc.md
date: 2026-09-24
---

# Remotion 홍보 영상 PoC — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `video/package.json`, `video/package-lock.json` | 새 파일. remotion·@remotion/cli, react 19, deck.gl 9.3(frontend와 같은 범위). 스크립트는 `snapshot`·`studio`·`render`·`typecheck` |
| `video/tsconfig.json` | 새 파일. `../frontend/src/views/map`·`../frontend/src/api.ts`·`../frontend/src/store.ts`를 include |
| `video/remotion.config.ts` | 새 파일. ANGLE, scale 1.5, `@deck.gl/*` alias |
| `video/.gitignore` | 새 파일. `public/data/`, `out/`, `node_modules/` |
| `video/scripts/snapshot.mjs` | 새 파일. API JSON을 `public/data/`에 저장 |
| `video/src/index.ts`, `video/src/Root.tsx` | 새 파일. 컴포지션 등록 |
| `video/src/data.ts` | 새 파일. `staticFile` JSON 로드(`useDelayRender`), 대상 분야·논문 선택 |
| `video/src/map/MapScene.tsx` | 새 파일. deck.gl 장면과 영역 이름 오버레이, 프레임 동기화 |
| `video/src/scenes/MapDive.tsx` | 새 파일. 프레임 → 카메라·인용선 앞머리 |
| `video/src/styles.css` | 새 파일. `tokens.css` import, `.region-name` 값(transition 없음) |
| `video/STORYBOARD.md` | 새 파일. 30초 티저 장면 구성 초안 |
| `frontend/src/views/map/style.ts` | 새 파일. `MapView.tsx`의 점·인용선·제목 상수와 `titleTypography`·`titleFontRenderer`를 그대로 옮긴다 |
| `frontend/src/views/map/titles.ts` | 새 파일. `titleMetrics(map, measure, characterSet)` |
| `frontend/src/views/map/labels.ts` | `placeRegionLabels` 추가 |
| `frontend/src/views/MapView.tsx` | 옮긴 것을 import로 바꾼다. 동작은 바꾸지 않는다 |
| `README.md` | "홍보 영상" 절 추가(스냅샷·렌더 명령) |

## 작업 순서

1. **렌더 검증(spike, 관문).** 이 단계를 통과하기 전에는 앱 코드를 건드리지 않는다.
   - `video/` 골격을 만든다.
   - `constellation-api`(main 설정, 8000)를 띄우고 `npm --prefix video run snapshot`으로 스냅샷을 받는다.
   - 임시 `Spike` 컴포지션을 만든다. 점 1만 개를 그리는 `ScatterplotLayer` 하나와 30프레임 줌, 그리고 프레임 동기화만 넣는다.
   - `--scale=1.5`로 렌더한다.
   - 확인: `ffprobe`가 1920×1080·30프레임을 보고하고, YAVG에 빈 프레임이 없고, 뽑은 프레임에 점이 보인다.
   - 실패하면 ANGLE → `swangle` → `preserveDrawingBuffer` 순으로 바꿔 본다. 셋 다 실패하면 여기서 멈추고 사용자에게 보고한다.
2. **앱 상수 꺼내기.** `style.ts`로 상수 블록과 두 함수를 **본문 그대로** 옮기고, `MapView`는 import만 바꾼다. 형태는 바꾸지 않는다. `feat/node-size` 병합 때 충돌을 작게 하기 위해서다.
   - 확인: frontend의 `test`·`build`·`lint` 통과. 이 단계는 단독 커밋(`refactor:`)으로 남긴다.
3. **제목·영역 배치 꺼내기.** `titles.ts`의 `titleMetrics`와 `labels.ts`의 `placeRegionLabels`를 만들고 `MapView`가 이를 쓰게 한다.
   - 확인: frontend의 `test`·`build`·`lint` 통과. 추가로 브라우저(`constellation-web`, 5173)에서 지도 확대 시 영역 이름과 제목이 전과 같게 켜지는지 본다.
4. **앱의 계산값 재기.** 실행 중인 앱에서 `--font-mono`, `--font-region`, `body` 글자색, 지도 바탕색을 `getComputedStyle`로 잰다.
   - `video/src/styles.css`는 `tokens.css`를 import하고, `index.css`가 덮어쓰는 값만 잰 값으로 적고 출처 주석을 단다.
5. **MapScene.** 레이어 6개와 영역 이름 오버레이를 만들고, `Spike`를 `MapDive`로 바꾼다. `Spike`는 지운다.
   - 확인: `npx remotion still`로 0·2·4초 프레임을 뽑아 앱 스크린샷과 나란히 비교한다(같은 카메라에서 점 색·반지름, 제목 글꼴·위치, 영역 이름).
6. **MapDive 카메라와 인용선.** 5초 전체를 렌더한다.
   - 확인: 완료 기준 전부(아래 검증).
7. **STORYBOARD.md와 README 절.**

## 가장 위험한 단계

- **1단계.** 헤드리스 Chrome의 WebGL이 deck.gl을 못 그리면 PoC 전체가 막힌다. 그래서 앱 코드를 건드리기 전에 관문으로 둔다. 실패하면 `video/`만 버리면 된다.
- **2·3단계.** 앱 회귀 위험이 있다. 각각 단독 커밋이라 `git revert`로 되돌릴 수 있다.

## 검증

```
npm --prefix video run snapshot
npm --prefix video run typecheck
npm --prefix video run render
npx --prefix video remotion ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=width,height,r_frame_rate,nb_read_frames -of csv=p=0 video/out/map-dive.mp4
npx --prefix video remotion ffmpeg -i video/out/map-dive.mp4 -vf signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=- -f null -
npx --prefix video remotion ffmpeg -i video/out/map-dive.mp4 -vf fps=1 video/out/still-%d.png
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix frontend run lint
```

화면 확인: 앱에서 지도를 전체 → 상위 분야 → 하위 분야 → 논문 제목까지 확대했을 때, 리팩터링 전과 라벨이 같게 나오는지 본다(2·3단계).
