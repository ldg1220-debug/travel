# 작업 지시서 — 스크랩북 커버의 Google 사진 검색 제거 (autopilot, 2026-11-23)

## 근거
- health maps.photos 월 625/1000(62.5%) > 50%. 이슈 #382 ④ "제목·도시로 q 를 만들지 않음" 중 스크랩북이 남아 있음(`${도시} 여행` → /api/discover/spot-photo).
## 할 것
1. ScrapbookClient `coverSrcForPlan` — 후기에 올린 Blob 사진만 사용, 없으면 기존 그라디언트 커버.
- 코스 생성 로직·COURSE_ALGO_VERSION·외부 API 호출 증가 없음(감소만).
