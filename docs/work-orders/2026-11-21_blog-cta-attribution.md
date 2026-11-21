# 작업 지시서 — 블로그 유입 방문자의 CTA 클릭 구분 계측 (autopilot)

작성: 2026-11-21 · 근거: DIRECTION "블로그 → 트레쥴 연결" — 블로그 랜딩 수(blogLandingToday)는 있으나 그 방문자가 CTA 까지 가는지는 모름 → 계측부터.

## 0. 먼저
1. 이 문서를 docs/work-orders/2026-11-21_blog-cta-attribution.md 로 저장, 완료분 10개 유지, 같은 PR.

## 1. 할 것
- CourseCtaLink: 클릭 시 현재 URL 의 utm_source 가 maeilg 이면 이벤트 props 에 fromBlog:true 추가 (기존 props 유지).
- health affiliateClicks.courseCtaFromBlog {today,last7d}: course_page_cta_click 중 props.fromBlog 가 true 인 건수. 읽기 전용 1쿼리, 비용 증가 없음.

## 2. 확인
- curl /api/health → affiliateClicks.courseCtaFromBlog (없으면 0)
