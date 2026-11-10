# 작업 지시서 — 제휴 클릭 집계를 /api/health 에 노출 (DIRECTION.md 백로그 3번)

작성: 2026-11-10 · Autopilot

- feature_events 의 lodging_click · esim_click · ticket_click 을 provider 별로 오늘(KST)·최근 7일 합계로 집계해 /api/health `affiliateClicks` 로 노출한다(수익 판단 지표).
- 읽기 전용 1쿼리(7일 범위). 실패하면 null — health 자체는 막지 않는다. 유료 사용·코스 생성 로직 변화 없음.
- 참고(기록): 11/10 health 에서 색인 missing 7 — 워밍 12건 성공인데도 비어 있음. 워밍 몫(text-pro 오늘 상한의 50%) 안에서 뒤쪽 코스가 캐시되지 못한 것으로 추정(미확인). 몫을 늘리는 것은 유료 사용 증가라 이번 작업에서 하지 않음 — 이슈 #357 에 기록.
