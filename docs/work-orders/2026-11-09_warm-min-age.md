# 작업 지시서 — 워밍 기준 연령 22h → 2h (#357 A안, 동근님 승인)

작성: 2026-11-09 · Autopilot (근거: 이슈 #357, #358 백로그 1번)

- 현상: indexed.missing 이 11/03 이후 0 이 되지 않음 (11/09 기준 5건: 오사카3·다낭4·타이베이3·부산2·경주3).
- 원인: 크론 1일 1회 + WARM_MIN_AGE_MS 22h → 사람이 만든 캐시가 건너뛰어져 만료 후 빈 시간 발생.
- 변경: src/app/api/cron/warm-course-brief/route.ts WARM_MIN_AGE_MS 를 2h 로. 크론 횟수·색인 코스 수·WARM_DAILY_MAX 불변.
- 비용: 색인 12개가 매 크론 갱신될 수 있으나 오늘 상한 50% 몫(mapsBudget) 안에서만 동작.
- COURSE_ALGO_VERSION: 생성 로직 불변이므로 올리지 않음.
