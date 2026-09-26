---
title: Constellation 소개 영상 (30초)
slug: intro-video
stage: plan
status: accepted
date: 2026-09-26
---

# Plan — Constellation 소개 영상 (30초)

1. `export_map.py` 확장: 점마다 잎 분야 번호, DPR 주변 논문 12편의 제목·좌표.
2. A(관측) 본 영상 작성 → stills·lint·determinism·video 통과.
3. A의 `COPY`·`T`·장면 순서를 B(성도), C(색면)로 옮기고 `STYLE`과 그리기만 바꾼다. 각각 같은 검사.
4. 편마다 MP4에서 한 장을 뽑아 확인하고, 세 편을 사용자에게 보낸다.
5. `docs/intro-video/` 소스 파일만 커밋한다(`feat:`), MP4·스틸은 제외(`.gitignore`에 `docs/intro-video/**/*.mp4`, `*.stills/`).

검증 명령: `node ~/.claude/skills/js-motion-video/tool/render.mjs docs/intro-video/<x>.html {stills …|lint|determinism <t>|video}`
