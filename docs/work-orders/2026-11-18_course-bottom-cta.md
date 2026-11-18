# 작업 지시서 — 코스 페이지 하단 "내 일정 만들기" CTA (autopilot, 2026-11-18)

## 근거
DIRECTION '첫 화면·계획 저장 흐름'. 코스 페이지는 일자 카드·제휴·관련 코스로 길지만 저장 진입 CTA 는 최상단 1개뿐.
## 할 것
- 일자 카드 아래에 같은 CourseCtaLink 추가, course_page_cta_click 이벤트에 placement(top/bottom) 추가.
## 비용/제약
- API 호출·생성 로직 변화 없음, COURSE_ALGO_VERSION 불변.
