# 작업 지시서 — 워밍 실패 원인을 health 에 노출 (autopilot, 2026-11-15)

## 근거
- /api/health 11/15 11:53Z: 워밍(05:44Z) 처리 12건 중 성공 9 → 실패 3, indexed.missing 3 (오사카·후쿠오카·제주 3일). 실패 사유를 볼 방법이 없다(Vercel 로그만).

## 할 것
1. 워밍 catch 에서 에러 메시지(60자)를 보관, lastWarmResult 에 "실패 지역일수(사유)" 최대 3건 표기.
- 코스 생성 로직·COURSE_ALGO_VERSION·외부 API 호출 변화 없음.
