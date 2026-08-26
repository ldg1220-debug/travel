import { todayISODate } from "@/lib/timeline";
import type { ItineraryItem, SavedPlan } from "@/lib/types";

export interface TripStatus {
  kind: "ongoing" | "upcoming";
  /** Draft(진행 중인 계획, id 없음)이면 null — planId가 있으면 저장된 계획. */
  planId: string | null;
  city: string;
  stopCount: number;
  daysUntil: number;
  /** 1-based. 계속 중이면 오늘이 속한 날, 예정이면 아직 장소가 가장 적어 "더 짜야 할" 날. */
  dayNumber: number;
  dayDate: string;
}

/**
 * 홈 히어로를 "오늘은 어디로 떠나볼까요?" 같은 무상태 인사말 대신, 실제
 * 진행 중/예정 여행이 있으면 그 상태를 보여주도록 — 리디자인 작업지시서
 * Phase 1의 "상태 기반 히어로" 요구사항. 저장된 계획(SavedPlan)과 아직
 * 이름 안 붙인 초안(draft, `items`/`currentCity`)을 같은 방식으로 검사해
 * 후보로 삼고, 오늘이 일정 범위 안이면 ongoing, 아직 시작 전이면 upcoming
 * 으로 분류한다. 이미 끝난(모든 날짜가 오늘 이전) 계획은 히어로 대상에서
 * 제외 — 그건 "다녀온 여행"이라 여행 보관함이 다룰 몫이다.
 *
 * dayNumber는 "Day 2를 마저 짜볼까요?" 같은 문구를 뒷받침하려고, 일정
 * 범위 안에서 스팟이 가장 적은 날(더 짤 게 남은 날)을 고른다 — ongoing이면
 * 오늘이 속한 날을 그대로 쓴다(오늘 할 일을 보여주는 게 더 유용해서).
 * 이동시간 같은 추정치는 절대 안 만든다(#163 원칙) — stopCount(담긴
 * 곳 수)만 실측값이라 그것만 노출한다.
 *
 * `today`는 classifyPlan/hasCompletedTrip과 같은 이유로 선택 인자다 —
 * 기본값은 실제 오늘이고, 테스트에서만 고정값을 넘겨 실제 시각과
 * 무관하게 만든다(과거 버전은 내부에서 todayISODate()를 하드코딩해
 * 테스트의 고정 TODAY 픽스처가 날짜가 바뀔 때마다 깨졌었다).
 */
export function deriveTripStatus(
  savedPlans: SavedPlan[],
  draftItems: ItineraryItem[],
  draftCity: string,
  today: string = todayISODate(),
): TripStatus | null {
  const candidates: { planId: string | null; city: string; items: ItineraryItem[] }[] = [
    // currentCity is "" for a plan hydrated from another device that this
    // one has never seen before (서버엔 city 필드가 없다 — itineraryStore.ts
    // hydrateSavedPlansFromServer 참고) — falls back to the plan's own name
    // so the hero never shows a blank city, without ever feeding a title
    // into bookingProviders()'s city matching (that stays untouched, "").
    ...savedPlans.map((p) => ({ planId: p.id, city: p.currentCity || p.name, items: p.items })),
    ...(draftItems.length > 0 ? [{ planId: null, city: draftCity, items: draftItems }] : []),
  ];

  let best: TripStatus | null = null;
  for (const c of candidates) {
    if (c.items.length === 0) continue;
    const byDate = new Map<string, number>();
    for (const item of c.items) byDate.set(item.date, (byDate.get(item.date) ?? 0) + 1);
    const dates = [...byDate.keys()].sort();
    const start = dates[0];
    const end = dates[dates.length - 1];
    if (end < today) continue; // 이미 끝난 여행 — 히어로 대상 아님

    const isOngoing = start <= today && today <= end;
    let dayDate: string;
    if (isOngoing) {
      dayDate = today;
    } else {
      // 스팟이 가장 적은 날(동률이면 더 이른 날)을 "마저 짤 날"로 고른다.
      dayDate = dates.reduce((min, d) => ((byDate.get(d) ?? 0) < (byDate.get(min) ?? 0) ? d : min), dates[0]);
    }
    const dayNumber = dates.indexOf(dayDate) + 1;
    const daysUntil = isOngoing ? 0 : Math.round((new Date(start).getTime() - new Date(today).getTime()) / 86400000);

    const status: TripStatus = { kind: isOngoing ? "ongoing" : "upcoming", planId: c.planId, city: c.city, stopCount: c.items.length, daysUntil, dayNumber, dayDate };
    // ongoing이 upcoming보다 우선, 같은 종류끼리는 더 임박한(daysUntil 작은) 쪽 우선.
    if (!best || (status.kind === "ongoing" && best.kind !== "ongoing") || (status.kind === best.kind && status.daysUntil < best.daysUntil)) {
      best = status;
    }
  }
  return best;
}

/**
 * "진행 중인 계획"의 도시 라벨 — 홈이 라이브 top-level `currentCity`를
 * 직접 읽지 않고 그 계획 자신의 저장된 스냅샷에서 파생하게 한다
 * (작업지시서 2026-08-26, "탐색이 진행 중인 계획을 덮어쓰는 문제" 3-3).
 *
 * itineraryStore.ts의 top-level `currentCity`는 활성 계획(draft 또는
 * activePlanId로 열린 계획)의 라이브 작업 상태를 담는 필드인데,
 * DiscoverClient의 "그냥 둘러보기" 액션이 같은 필드에 조건 없이 쓰기를
 * 하고 있어("마산 카라반" 검색 → itineraryStore.currentCity = "마산")
 * 그대로 읽으면 탐색만 했는데 홈의 진행 중인 계획이 바뀐 것처럼 보이는
 * 증상이 재현된다.
 *
 * 이 함수는 대신 activePlanId가 있으면 그 저장된 계획 자체의
 * currentCity/name을, 없으면 draft 스냅샷의 currentCity를 쓴다 — 둘 다
 * 아이템이 실제로 바뀔 때만 갱신되는 값이라(itineraryStore.ts
 * syncDraftFromWorkingState/AppBar.tsx의 디바운스 오토싱크가 `items`
 * 변화에만 물려 있다, 탐색 중 라이브 currentCity만 바뀌는 것으로는
 * 이 스냅샷이 갱신되지 않는다) 순수 탐색으로는 오염되지 않는다 —
 * DiscoverClient의 쓰기 자체를 막는 구조 수정과는 별개로, 그 수정이
 * 끝나기 전에도 이미 증상을 차단하는 방어선이다.
 *
 * `draft`가 아직 한 번도 동기화되지 않은 세션 최초 순간(아이템을 막 담아
 * 오토싱크가 아직 한 번도 안 돈 찰나)에는 draft가 null일 수 있는데, 그
 * 창은 탐색이 끼어들 시간이 없었으므로 라이브 값을 그대로 써도 안전하다.
 */
export function activePlanCityLabel(
  savedPlans: SavedPlan[],
  activePlanId: string | null,
  draft: SavedPlan | null,
  liveCurrentCity: string,
): string {
  if (activePlanId) {
    const plan = savedPlans.find((p) => p.id === activePlanId);
    if (plan) return plan.currentCity || plan.name;
  }
  return draft?.currentCity ?? liveCurrentCity;
}

/**
 * "동선 자동 정리를 써본 적 있다"는 실제로 서버에 저장할 값이 아니라
 * (Phase 1 온보딩 스테퍼 3단계의 완료 신호일 뿐) localStorage 한 줄이면
 * 충분하다 — 작업지시서 2-2 "진행 상태는 서버 저장 불필요". 이 키는
 * PlannerBoard.tsx(쓰기)와 HomeClient.tsx(읽기) 양쪽이 공유한다.
 */
export const ROUTE_OPTIMIZED_ONCE_KEY = "tradule_route_optimized_once";

export type PlanBadge = "ongoing" | "upcoming" | "completed" | "draft";

/** 저장된 계획 하나의 상태 배지 — 리디자인 작업지시서 Phase 1의 "내 여행 리스트"용 StatusPill. */
export function classifyPlan(plan: SavedPlan, today: string = todayISODate()): PlanBadge {
  if (plan.items.length === 0) return "draft";
  const dates = plan.items.map((i) => i.date).sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
  if (start <= today && today <= end) return "ongoing";
  if (start > today) return "upcoming";
  return "completed";
}

/**
 * 홈 히어로의 3가지 사용자 상태 중 "여행 없음 + 과거 여행 있음"을 가리려고
 * — 진행 중/예정 여행(`deriveTripStatus`)이 없으면서, 이미 끝난 저장된
 * 계획이 하나라도 있는지만 보면 된다(끝난 계획도 `savedPlans`에 그대로
 * 남아있다 — 별도 보관 처리 없음).
 */
export function hasCompletedTrip(savedPlans: SavedPlan[], today: string = todayISODate()): boolean {
  return savedPlans.some((p) => classifyPlan(p, today) === "completed");
}
