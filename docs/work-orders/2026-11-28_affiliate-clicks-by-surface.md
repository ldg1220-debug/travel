# [Cowork 지시서] health 제휴 클릭을 화면(코스 페이지 / 계획 화면)별로 나눠 보이기 — 새 계획 화면 eSIM·숙소 링크 효과 측정

- 근거(2026-11-28 실측): `/api/health` `affiliateClicks.rows` 가 `event`·`provider` 로만 묶여 코스 페이지 클릭 vs 계획 화면 클릭 구분 불가. `feature_events.surface` 는 이미 저장됨.
- 할 것: (1) `getAffiliateClickStats()` 제휴 클릭 쿼리를 `event, provider, surface`(없으면 'unknown')로 묶어 `rows` 각 행에 `surface` 추가, 기존 필드·합계 유지. (2) `bySurface: [{ surface, today, last7d }]` 추가. (3) 기존 필터 유지, DB·새 이벤트 변경 없음(select 만). (4) 테스트: surface null → "unknown", bySurface 합계 = 전체 합계.
- 확인(배포 후): `/api/health` → `rows[*].surface`·`bySurface` 있음, bySurface last7d 합 = `affiliateClicks.last7d`; ok=true · 경고 0 · courseBuild.currentVersion 52 · maps 사용량 증가 없음.
- 하지 말 것: COURSE_ALGO_VERSION 변경, 저장 데이터 변경, 특정 상품 추천, 새 제휴사·Google·LLM 호출, 비밀값·claude.yml 변경, UI 변경.
