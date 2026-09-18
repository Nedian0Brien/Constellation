---
title: Constellation을 Tauri 데스크톱 앱으로
slug: desktop-app
stage: intent
status: accepted
author: minjaepark
date: 2026-09-17
---

# Constellation을 Tauri 데스크톱 앱으로

## 문제

Constellation을 쓰려면 터미널 두 개에서 `constellation serve`(FastAPI)와 `npm run dev`(Vite)를 띄우고 브라우저로 `localhost:5173`을 열어야 한다. 연구자가 도구를 "켜서 쓰는" 경험이 아니다. 서빙 API(`backend/constellation/api/app.py`, 13개 엔드포인트)는 DuckDB 파일을 읽어 JSON으로 바꾸는 일만 하는데도 Python·uvicorn·pyarrow가 실행 시점에 필요하고, 그래서 앱으로 묶으려면 Python 런타임까지 같이 실어야 한다.

## 원하는 결과

- `Constellation.app`을 더블클릭하면 창 하나가 뜨고 지도·계층 트리·갈래 흐름·인용 계보·3D·논문 목록·인스펙터가 지금 브라우저에서 보이는 그대로 동작한다. 터미널·Python·Node가 실행 시점에 필요 없다.
- 앱은 DuckDB 파일을 프로세스 안에서 직접 읽는다. 서빙 질의 계층은 Rust 크레이트 하나이며, Tauri 명령(`invoke`)과 개발용 HTTP 서버가 같은 함수를 부른다. FastAPI 서빙 계층은 사라지고 Python은 수집·임베딩·클러스터링 파이프라인(CLI)만 맡는다.
- 데이터는 앱 데이터 폴더(macOS `~/Library/Application Support/Constellation/`)의 `constellation.duckdb`를 기본으로 찾는다. 없으면 빈 상태 화면에서 "데이터베이스 열기"로 파일을 고르고, 고른 경로를 기억한다.
- 개발 흐름은 `npm run tauri dev` 하나다. 브라우저 전용 확인과 Playwright E2E는 개발용 HTTP 서버(`cargo run -p constellation-serve`)와 Vite로 계속 돌릴 수 있다. 백엔드 단위 테스트는 Rust(`cargo test`)로 옮긴다.
- `npm run tauri build -- --bundles app`으로 이 Mac에서 실행되는 `.app`이 나온다. 결과물 경로와 서명 없이 실행되는지는 spec에서 실제로 확인한다.
- 기존 실데이터(논문 10,604편·투영 4개 run)에서 API 13개의 응답이 Python 버전과 같다(같은 입력에 같은 JSON). 프론트 코드는 전송 계층(`api.ts`)만 바뀐다.

## 영향 범위

`frontend/src/api.ts`(전송 계층), `frontend/package.json`·`vite.config.ts`, 신규 `src-tauri/`(Tauri 앱)와 `crates/`(질의 계층·개발 서버), `backend/constellation/api/`·`backend/tests/test_api.py`(삭제), `pyproject.toml`(`api` extra 삭제), `playwright.config.ts`(webServer 명령), `.claude/launch.json`, README·ARCHITECTURE. 사용자는 연구자 본인. 범위·수락은 본인이 정한다.

## 제약

- Tauri 2.11(crate 2.11.5 / cli 2.11.4 / api 2.11.1), duckdb-rs `~1.10505`(DuckDB 1.5.5를 정적으로 묶음 — Python duckdb 1.5.5와 같은 버전이라 저장 형식이 같다). Rust 1.97, Xcode CLT는 이미 있다. 2026-09-17 crates.io·npm·duckdb-rs README에서 확인했다.
- 프론트의 다섯 화면·패널·URL 상태·디자인은 바꾸지 않는다. `api.ts`의 함수 이름과 반환 타입을 유지한다.
- DB 스키마와 Python 파이프라인(collect·backfill·embed·project·cluster·flow·lineage·name)은 건드리지 않는다.
- 첫 빌드는 DuckDB를 소스에서 컴파일하므로 시간이 걸린다(분 단위). 이후는 캐시된다.

## 범위 밖

- 앱 안에서 수집·임베딩·클러스터링을 실행하는 것(Python 파이프라인 사이드카). 다음 변경.
- 코드 서명·공증·DMG·자동 업데이트·Windows 빌드. Tauri 설정은 크로스플랫폼으로 두되 이번엔 이 Mac의 `.app`만 만든다.
- Scopus 어댑터(M5), 분석 알고리즘 변경.

## 열린 질문

- 해결(2026-09-17, 사용자 동의): 서빙 계층은 Rust로 다시 쓴다. FastAPI를 PyInstaller 사이드카로 묶는 대안은 Python 런타임을 앱에 싣고 두 프로세스를 관리해야 해서 버렸다.
- 해결(2026-09-17, 사용자 동의): PR #3을 먼저 병합하고 그 위에서 시작한다.
- 인용 계보(`/api/lineage`)는 SQL 결과를 Python에서 후처리하는 부분이 있다(경로 계산). Rust로 옮기며 결과가 같은지 실데이터로 대조한다. 다르면 spec 단계에서 다시 묻는다.
