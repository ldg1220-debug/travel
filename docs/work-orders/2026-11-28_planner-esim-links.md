# [Cowork 지시서] 계획 화면(/planner)에 eSIM 링크 없음 — 해외 계획에 코스 페이지와 같은 eSIM 링크(EsimAffiliateLinks surface="planner") 붙이기

- 근거(2026-11-28 실측): 코스 페이지엔 eSIM 링크 2개(`course_page_esim`)가 있으나 계획 화면 본문엔 eSIM 0·외부 `<a>` 0. health 제휴 클릭 7일 eSIM 2건은 코스 페이지에서만.
- 할 것: (1) `PlannerBoard.tsx` 에서 계획 도시가 해외(`resolveScope(city) !== "domestic"` 기준)일 때만 숙소 블록 아래 한 군데에 `EsimAffiliateLinks surface="planner"`. 국내·도시 미정은 숨김. (2) `esimAffiliateLinks("planner_esim")` 재사용, 각 사 홈페이지·제휴 고지 그대로. (3) `esim_click` surface=planner 확인, health affiliateClicks 합산 확인(새 이벤트 금지). (4) 해외 렌더 · 국내/도시 없음 미렌더 테스트.
- 확인(배포 후): `/course/타이베이/2박3일` → 내 일정 만들기 → "타이베이 여행 데이터 eSIM" + Airalo·Yesim(`sub_id=planner_esim`); `/course/부산/1박2일` → 없음; `/api/health` ok · 경고 0 · courseBuild.currentVersion 52 · maps 사용량 증가 없음.
- 금지: COURSE_ALGO_VERSION 변경, 저장 데이터 변경, 특정 상품 추천, 새 제휴사·Google·LLM 호출, 비밀값·claude.yml 변경, 큰 디자인 변경.
