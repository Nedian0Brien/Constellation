---
title: 30초 홍보 티저
slug: promo-teaser
stage: plan
status: accepted
intent: .intent/intent_promo-teaser.md
spec: .intent/spec_promo-teaser.md
date: 2026-09-24
---

# 30초 홍보 티저 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `video/src/data/agent-thread.json` | 새 파일. 실제 에이전트 대화 기록(앱 localStorage 형식) |
| `video/scripts/snapshot.mjs` | 기본 run·API를 인자로, `flow`·`lineage`(씨앗 RT-1) 추가 |
| `video/scripts/sound.mjs` | 새 파일. 합성 사운드 WAV |
| `video/src/timeline.ts` | 새 파일. 장면 경계 프레임, 자막 문구 |
| `video/src/data.ts` | flow·lineage 로드 |
| `video/src/map/MapScene.tsx` | 연도 필터(`DataFilterExtension`)·영역 알파·주석 라벨 prop |
| `video/src/scenes/Teaser.tsx` | 새 파일. 7개 장면을 `<Sequence>`로 잇는다 |
| `video/src/scenes/*.tsx` | 새 파일. 장면별 컴포넌트 |
| `video/src/chat/*.tsx` | 새 파일. 채팅 패널 표시 컴포넌트 |
| `video/src/views/*.tsx` | 새 파일. 트리·흐름·계보 SVG |
| `video/src/styles.css` | 뷰·채팅·자막 CSS(앱 값 + 출처) |
| `video/src/Root.tsx` | `Teaser` 등록 |
| `video/package.json` | `@remotion/media`, `render:teaser` |
| `frontend/src/views/tree/layout.ts`, `flow/layout.ts`, `lineage/layout.ts` | 새 파일. 뷰 레이아웃 함수 |
| `frontend/src/views/TreeView.tsx`, `FlowView.tsx`, `LineageView.tsx` | 레이아웃 함수를 import로 |
| `video/STORYBOARD.md`, `README.md` | 결과와 명령 |

## 작업 순서

1. **대화 기록(관문).**
   - 에이전트 서버(8787), 피지컬 AI API(8003), 앱(5182)을 띄운다.
   - 브라우저에서 질문을 보내고, 답과 도구 호출이 끝나면 localStorage의 대화를 JSON으로 꺼낸다.
   - 확인: 기록에 `fly_to`·`annotate` 계열 도구 호출과 한국어 답이 있다. 없으면 질문을 고쳐 다시 기록한다.
2. **스냅샷.** 새 코퍼스로 map·clusters·tree·edges·flow·lineage를 받는다.
   - 확인: 파일 6개, map n=16,554
3. **뷰 레이아웃 꺼내기.** 트리·흐름·계보.
   - 확인: frontend test·build·lint, 브라우저에서 세 뷰의 모양이 같다.
   - 단독 커밋
4. **장면 1–4(지도).** 연도 재생 레이어, RT-1 카메라 경로, 자막.
   - 확인: 장면별 still
5. **장면 5(채팅).** 앱 패널 치수를 재서 표시 컴포넌트를 만들고, 기록을 재생하며 지도를 움직인다.
   - 확인: still, 앱 패널 스크린샷과 나란히 비교
6. **장면 6–7(뷰 몽타주, 엔딩).**
7. **소리.** WAV 생성, `<Audio>`로 연결.
   - 확인: md5 두 번 같음
8. **전체 렌더와 검증.** 완료 기준 전부. 스토리보드와 README를 갱신하고, 커밋·푸시·PR 본문을 갱신한다.

## 가장 위험한 단계

- **1단계:** 에이전트가 기대한 도구를 쓰지 않을 수 있다. 영상 작업 전에 관문으로 둔다. 기록이 영상에 쓸 만하지 않으면 질문만 바꿔 다시 기록한다.
- **3단계:** 앱 뷰 회귀. 단독 커밋이라 `git revert`로 되돌릴 수 있다.

## 검증

```
npm --prefix video run typecheck
npm --prefix video run render:teaser
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,nb_frames,sample_rate -of compact video/out/teaser.mp4
ffmpeg -hide_banner -i video/out/teaser.mp4 -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null - 2>&1 | grep -o "YAVG=[0-9.]*"
node video/scripts/sound.mjs && md5 -q video/public/audio/teaser.wav
npm --prefix frontend run test && npm --prefix frontend run build && npm --prefix frontend run lint
```
