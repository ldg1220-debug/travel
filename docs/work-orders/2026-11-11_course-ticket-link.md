# 작업 지시서 — 코스 페이지 명소별 "입장권 확인" 링크 (DIRECTION.md 백로그 3번째)

작성: 2026-11-11 · Autopilot

- 코스 페이지 명소 중 전망대·테마파크·수족관·박물관/미술관(이름 기준)에만 "입장권 확인" 링크를 붙인다. Klook **검색 결과** 페이지로만 보낸다(특정 상품 추천 금지), Travelpayouts 추적 링크(campaign 137 · p 4110, 숙소와 동일).
- 클릭 시 `ticket_click` 이벤트({provider, region, spot}) — health `affiliateClicks` 는 이미 이 이벤트를 집계한다.
- 유료 사용·코스 생성 로직 변화 없음(렌더링만).
- 미확인: Klook 검색 URL 의 쿼리 파라미터 이름(`query`)은 추정 — 배포 후 실제 열림 확인 필요.
