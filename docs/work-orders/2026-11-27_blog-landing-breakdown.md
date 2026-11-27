# 작업 지시서 — 블로그 유입을 코스별·7일로 보이게 (측정만)

작성: 2026-11-27 20시 · Cowork · 이슈 #447

## 요약
- `/api/health` `courseBuild` 에 추가(기존 필드 유지): `blogLanding7d`(최근 7일 블로그 사람 방문 합계), `blogLandingByCourseToday`(오늘 코스별 상위 10 `{course,count,indexed,kind}`), `blogLandingSyncBuildToday`(블로그 유입이 그 자리 코스 생성으로 이어진 수).
- 사람(human) 방문만 센다 — 기존 `classifyVisit` 기준 그대로(bot·internal·TraduleCowork 점검 제외).
- 테스트: 세 필드 집계·정렬·indexed 표시, bot UA 미집계.
- 확인: tsc · eslint · vitest · next build. 배포 후 `/api/health` 에 세 필드가 보이고, `TraduleCowork/1.0` UA 로 `/course/도쿄/2박3일?utm_source=maeilg` 를 열어도 숫자가 늘지 않음.

## 하지 말 것
- COURSE_ALGO_VERSION 올리기 · 특정 호텔 추천
- 색인 코스 추가·워밍 횟수 증가·새 유료 호출(측정만). 색인 밖 코스의 동기 빌드 동작 자체는 바꾸지 않는다.
- 블로그(maeilg.com) 쪽 링크·글 수정, 기존 집계 데이터 수정·삭제
- 비밀값·환경변수·`.github/workflows/claude.yml` 수정

(전문은 이슈 #447 본문 참조 — 근거: 블로그 링크 3곳 중 나고야 3박4일·청주 1박2일이 색인 밖 코스.)
