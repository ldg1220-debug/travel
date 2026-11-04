# 작업 지시서 — Places 텍스트 검색 user 출처 일일 상한 소진 원인 · Autopilot 진행 규칙

작성: 2026-11-03 · Cowork

## 0. 먼저
1. 이 본문을 `docs/work-orders/2026-11-03_text-pro-user-cap.md` 로 저장
2. 완료된 지시서 중 오래된 것부터 지워 10개 유지
3. 본 작업과 같은 PR

## 0-1. 근거 (/api/health, 11/03)
- maps.text-pro.todayBySource.user = 153 = todayLimit 153 (일일 페이싱 상한 도달). warm·rebuild 는 0.
- 같은 시각 사람 방문(courseBuild.visitsHumanToday) 18, 봇 11. 사람 18명이 텍스트 검색 153회를 썼다고 보기 어렵다.
- 상한에 걸리면 실제 사용자의 장소 검색이 막히므로 원인을 찾아야 한다.

## 1. 할 것
① "user" 로 집계되는 텍스트 검색 호출 경로를 전부 나열(검색창 자동완성·코스 페이지 사람 방문 재생성·계획 화면 근처 추천 등)하고, 경로별 오늘 횟수를 health 에 남기도록 todayBySource 를 세분화(user:search / user:course-rebuild / user:nearby …). 비용 증가 없음.
② 자동완성/검색 입력에 디바운스·최소 글자 수·같은 질의 캐시(약관 허용 범위: place_id 만 장기, 그 외 짧게)가 있는지 확인, 없으면 추가.
③ 사람으로 분류됐지만 실제로는 자동화(헤드리스·프리뷰 봇·링크 미리보기)인 UA 가 user 로 잡히는지 확인 — topUserAgents 와 대조해 분류 보완.
④ docs/autopilot/DIRECTION.md 에 규칙 1줄 추가: "점검에 이상이 없으면 매 실행 '현재 단계 과제' 중 1건을 반드시 골라 작업한다(근거가 약하면 측정·계측 추가부터)."

## 2. 확인할 것
- health 에 세분화된 todayBySource · 원인 경로 보고 · tsc/eslint/vitest/build 통과
