# 작업 지시서 — 코스 페이지 CTA 클릭을 health 에 노출 (autopilot, 2026-11-19)

## 근거
DIRECTION '첫 화면·계획 저장 흐름' + 진행 규칙(근거 약하면 계측부터). 11/18 에 하단 CTA(placement=bottom)를 추가했지만 클릭 수를 볼 곳이 없다.
## 할 것
- getAffiliateClickStats 에 course_page_cta_click 의 placement 별 오늘(KST)·7일 합계(courseCta)를 추가 → /api/health affiliateClicks.courseCta.
## 비용/제약
- 읽기 전용 집계 1쿼리 추가. Places 호출 없음, COURSE_ALGO_VERSION 불변.
