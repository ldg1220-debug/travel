# 작업 지시서 — 코스 페이지 LCP 이미지 우선 로딩 (2026-11-13, Autopilot)

근거: DIRECTION 백로그 "색인 코스 페이지 성능". 코스 페이지 첫 화면의 동선 지도 이미지가 LCP 후보.
- 할 것: `/course/[region]/[days]` 지도 `<img>` 에 `fetchPriority="high"` · `decoding="async"` (width/height 는 이미 있어 CLS 없음).
- 비용 영향 없음(요청 수·Google API 호출 동일).
- 검증: tsc · eslint · vitest.
