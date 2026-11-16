# 작업 지시서 — 코스 페이지 정규 리다이렉트에서 utm 유지 (autopilot, 2026-11-16)

## 근거
- DIRECTION "블로그 → 트레쥴 연결(utm 이 남는지)". `course/[region]/[days]/page.tsx` 는 비정규 슬러그를 permanentRedirect 로 보내는데 쿼리를 버려 utm_source=maeilg 가 사라지고 blogLandingToday 가 누락된다.

## 할 것
1. `withSearchParams()` 추가, 리다이렉트 목적지에 원래 쿼리 유지 + 테스트.
- 코스 생성 로직·COURSE_ALGO_VERSION·외부 API 변화 없음.
