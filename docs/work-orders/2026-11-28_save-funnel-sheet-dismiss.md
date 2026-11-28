# [Cowork 지시서] 저장 흐름 — 날짜 시트 닫힘 이벤트 + 출처별 퍼널 (2026-11-28, 이슈 #465)

## 근거
- 운영 health 7일: course_page_cta_click 5 → plan_copy_click 8 → plan_copy_choice 1 → plan_copy_login_shown 1 → login_provider_click 0 → plan_copy_completed 0 → plan_save 1.
- 8번 중 7번이 날짜 시트에서 멈췄는지 / 다른 출처(trip_post)인지 구분 불가.

## 할 일
1. `featureEvents.ts` 에 `plan_copy_sheet_dismiss` 추가. `PlannerBoard.tsx` copy 시트를 고르지 않고 닫을 때만 `{ source: "itinerary" }` 1회. 날짜·미정 선택 시 X, assign 모드 X.
2. `SAVE_FUNNEL_EVENTS` 에 `plan_copy_choice` 바로 뒤로 추가.
3. health `affiliateClicks.saveFunnelBySource` 추가 (source 별 today/last7d, 읽기 전용 1쿼리, 실패 시 null). `saveFunnel` 유지.
4. 테스트: 허용 목록 포함, bySource 행 조립.

## 확인 (병합 후)
- `curl -s https://www.tradule.co.kr/api/health | jq '.affiliateClicks.saveFunnelBySource'` → 배열
- `.affiliateClicks.saveFunnel` 에 `plan_copy_sheet_dismiss` 행, `.ok == true`, `.warnings` 빈 배열

## 하지 말 것
COURSE_ALGO_VERSION · 호텔 추천 · 담아가기/로그인 흐름 변경 · DB 스키마 · 유료 API · 비밀값/환경변수/claude.yml
