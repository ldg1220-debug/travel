# 작업 지시서 — 저장 흐름 퍼널을 health 에 노출 (autopilot)

작성: 2026-11-19 · 근거: DIRECTION "첫 화면·계획 저장 흐름" — 근거 약함 → 계측부터.

## 0. 먼저
1. 이 문서를 docs/work-orders/2026-11-19_save-funnel-health.md 로 저장, 완료분 10개 유지, 같은 PR.

## 1. 할 것
- affiliateClicks.saveFunnel: course_page_cta_click → plan_copy_click → plan_copy_completed → plan_save 별 오늘(KST)·7일 이벤트 수. 읽기 전용 1쿼리 추가, 비용 증가 없음.

## 2. 확인
- curl /api/health → affiliateClicks.saveFunnel (4개 항목, 없으면 0)
