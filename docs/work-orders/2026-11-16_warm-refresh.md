# 작업 지시서 — 워밍이 캐시를 실제로 갱신하도록 refresh 적용 (autopilot, 2026-11-16)

## 근거
- /api/health 11/16 22:51Z: 워밍(05:44Z) "처리 12건(성공 12 · 저장대상 12)" 인데 indexed.missing 8 (fresh 4). 17시간밖에 안 지났는데 8건이 비어 있다.
- 코드: warm-course-brief/route.ts 가 `getCourseBrief()` 를 refresh 없이 호출 → 캐시가 있으면 cache-hit 으로 그대로 반환, `created_at` 이 갱신되지 않음.
  #357 A안(WARM_MIN_AGE_MS 2h)으로 2h 넘은 캐시를 "갱신 대상"으로 골라도 실제로는 갱신되지 않아 원래 만료 시각(26h)에 비게 된다.

## 할 것
1. 워밍이 고른 갱신 대상(pickStaleTasks 결과)은 `{ refresh: true }` 로 다시 만든다. 대상 선정·횟수·상한(WARM_DAILY_MAX, 50% 몫)은 그대로 → 승인된 #357 A안의 의도 범위.
- COURSE_ALGO_VERSION 변경 없음.
