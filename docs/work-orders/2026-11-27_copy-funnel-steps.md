# [Cowork 지시서] 담아가기 클릭 6 → 완료 0 — 중간 단계 이벤트 추가 (#435)

- 근거(2026-11-27 08:30 KST): `/api/health` `saveFunnel` — `plan_copy_click` 7일 6, `plan_copy_completed` 7일 0, `plan_save` 7일 1. 시트·로그인 창 어디서 멈추는지 안 보임. 측정 먼저.
- 할 것:
  1. `FEATURE_EVENT_NAMES` 에 `plan_copy_choice {source, undated}`(handleCopyChoice 시작), `plan_copy_login_shown {source}`, `login_provider_click {provider, reason}` 추가.
  2. 공유 계획(`PlannerBoard`, source `itinerary`)·후기(`TripPostClient`, source `trip_post`) 두 진입점에 남김. 기존 이벤트 위치·이름 불변.
  3. `SAVE_FUNNEL_EVENTS` 를 course_page_cta_click, plan_copy_click, plan_copy_choice, plan_copy_login_shown, login_provider_click, plan_copy_completed, plan_save 순으로.
  4. 테스트: 허용 목록 · 퍼널 순서 · (가능하면) handleCopyChoice 호출 순서.
- 확인: tsc·eslint·vitest·next build. 배포 후 health 에 새 3개 이벤트 숫자 표시, ok=true·경고 0. Cowork UA 로 진행 시 POST 는 나가되 health 숫자 불변.
- 하지 말 것: COURSE_ALGO_VERSION, 특정 호텔 추천, 담아가기·로그인 문구/디자인/순서, next-auth, 기존 데이터·DB 스키마·비밀값·claude.yml, 유료 API, props 개인정보.
