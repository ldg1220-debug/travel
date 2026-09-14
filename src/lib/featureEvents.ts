// 기능 사용 이벤트 이름/서라운딩 값의 단일 출처. 클라이언트
// (trackFeatureEvent.ts), 서버 검증 (api/track/feature-event/route.ts),
// 관리자 집계 (api/admin/stats/route.ts) 세 곳이 전부 이 목록을 참조한다 —
// 예전엔 각자 리터럴을 복붙해서 하나만 늘리면 나머지가 조용히 어긋날 수
// 있었다.
// plan_copy_click/plan_copy_completed — 작업지시서 2026-09-14 "공유
// 링크에도 담아가기" §5: "담아가기 클릭 수"와 "담아가기 → 가입 전환
// 수"를 최소한 남기라는 요구. trackFeatureEvent의 익명 세션 id는
// localStorage(로그인 리다이렉트 왕복에도 살아남음)에 저장되므로,
// 비로그인 클릭(plan_copy_click)과 로그인 후 실제 완료(plan_copy_completed)가
// 같은 세션 id로 남는다 — 관리자 대시보드가 이벤트별 uniqueSessions를
// 이미 집계하므로, 두 이벤트의 고유 세션 수를 비교하면 클릭→전환률을
// 볼 수 있다. props.source("trip_post" | "itinerary")로 두 담아가기
// 진입점(후기/공유 링크)을 구분한다.
export const FEATURE_EVENT_NAMES = [
  "course_generate",
  "course_reroll",
  "course_save",
  "place_search",
  "plan_save",
  "plan_share",
  "home_hero_cta",
  "plan_copy_click",
  "plan_copy_completed",
] as const;
export type FeatureEventName = (typeof FEATURE_EVENT_NAMES)[number];

export const FEATURE_EVENT_SURFACES = ["discover", "course", "planner", "scrapbook", "home"] as const;
export type FeatureEventSurface = (typeof FEATURE_EVENT_SURFACES)[number];
