# [Cowork 지시서] 공유 계획 페이지 숙소 링크가 도시 대신 "새 여행"으로 나감 (#431)

- 대상: `/planner/1d95af95-ab60-4fcc-acfa-6b82a90a3168` (다낭 공유 계획) "숙소 예약" 탭. 문구가 "새 여행에서…", Klook 링크가 일반 호텔 첫 화면·`sub_id=tradule_새 여행_0`.
- 원인: PlannerBoard 가 스토어 `currentCity`(기본값 "새 여행")를 숙소 링크·문구에 그대로 사용.
- 할 것:
  1. 공유 계획을 볼 때는 그 계획의 도시, 내 계획은 `currentCity`.
  2. 도시를 모르면(빈 값·"새 여행") 숙소 링크·버튼 숨김.
  3. eSIM(`planner_esim`)이 국내 계획에서 안 나오는지 확인, 나오면 해외만.
  4. 도시 결정 함수 단위 테스트.
- 확인: 운영에서 문구 "다낭에서 예약 가능한 숙소…", sub_id `tradule_다낭_…`, 목적지 다낭 목록, page error 0, `/api/health` ok.
- 금지: COURSE_ALGO_VERSION 변경, 특정 호텔 추천, 저장 데이터·비밀값·claude.yml 수정, 스토어 기본값 "새 여행" 변경.
