# [Cowork 지시서] 저장 흐름·제휴 클릭 집계에 로봇·Cowork 점검 클릭이 섞임 (#433)

- 근거(2026-11-27 06:40 KST): `/api/health` `plan_copy_click` 오늘 5→6, 늘어난 1건은 Cowork 점검(Playwright·Pixel 5)의 "내 계획으로 담아가기". 02·04시 점검분 포함 오늘 6건 중 최소 3건이 점검. `feature-event`·`lodging-cta` route 는 UA 를 안 보고 전부 저장(방문 집계만 `classifyVisit()` 로 분류).
- 할 것:
  1. 두 route 에서 `classifyVisit(ua, acceptLanguage, "page")` 가 `bot`·`internal` 이면 저장 없이 `{ ok: true }`.
  2. `TraduleAutoPipeline` 표식 유지. Cowork 점검은 UA 끝에 ` TraduleAutoPipeline/cowork` 를 붙임 → `botUserAgent.test.ts` 에 internal 테스트 1건.
  3. 단위 테스트: ① 모바일 Chrome UA+Accept-Language 저장 ② Googlebot 미저장 ③ `…TraduleAutoPipeline/cowork` 미저장.
  4. PR 본문에 판정 규칙 한 줄.
- 확인: tsc·eslint·vitest·next build. 배포 후 `…TraduleAutoPipeline/cowork` UA 로 담아가기 → `plan_copy_click` 오늘 숫자 불변, 일반 UA 는 +1. `/api/health` ok=true, 경고 0.
- 금지: COURSE_ALGO_VERSION, 특정 호텔 추천, 기존 이벤트 데이터 삭제·수정, DB 스키마, 비밀값·환경변수, claude.yml, 방문 집계 규칙 변경, 유료 API·외부 분석 도구.
