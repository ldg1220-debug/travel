// 기능 사용 이벤트 이름/서라운딩 값의 단일 출처. 클라이언트
// (trackFeatureEvent.ts), 서버 검증 (api/track/feature-event/route.ts),
// 관리자 집계 (api/admin/stats/route.ts) 세 곳이 전부 이 목록을 참조한다 —
// 예전엔 각자 리터럴을 복붙해서 하나만 늘리면 나머지가 조용히 어긋날 수
// 있었다.
export const FEATURE_EVENT_NAMES = ["course_generate", "course_reroll", "course_save", "place_search", "plan_save", "plan_share"] as const;
export type FeatureEventName = (typeof FEATURE_EVENT_NAMES)[number];

export const FEATURE_EVENT_SURFACES = ["discover", "course", "planner", "scrapbook"] as const;
export type FeatureEventSurface = (typeof FEATURE_EVENT_SURFACES)[number];
