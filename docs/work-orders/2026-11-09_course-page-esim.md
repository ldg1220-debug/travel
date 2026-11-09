# 작업 지시서 — 해외 코스 페이지 eSIM 제휴 링크 + esim_click (DIRECTION.md 백로그 2번)

작성: 2026-11-09 · Autopilot

- 해외 색인 코스 페이지(/course/{region}/{days}) 하단에 eSIM 제휴 링크(Yesim·Airalo, 기존 tp.media 형식·marker 765548) 추가. 각 사 홈페이지로만 — 특정 상품 추천 없음.
- 제휴 고지(AffiliateDisclosureNote) + rel="sponsored" + 클릭 이벤트 esim_click { provider, region }.
- 국내 코스에는 표시하지 않음. 유료 사용·코스 생성 로직 변경 없음(COURSE_ALGO_VERSION 불변).
