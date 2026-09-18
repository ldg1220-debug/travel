import { saveItinerary } from "./api";
import { useItineraryStore } from "@/store/itineraryStore";
import type { ItineraryItem, Region } from "./types";

const inFlight = new Map<string, Promise<{ id: number; shareToken: string }>>();

/**
 * 지금 이 탭이 /planner/{shareToken}(뷰어 화면)에 있는지를 브라우저의
 * 실제 현재 URL로 직접 확인한다 — 작업지시서 2026-09-18 "뷰어 모드를
 * 우회하는 저장 경로" §4/§5-②: itineraryStore.ts의 viewerModeActive는
 * useEffect가 sharedData를 다시 받을 때만 갱신되는 리액트 상태라,
 * 리마운트·포커스 복귀·React Query 재요청 사이의 어느 시점에 초기값
 * (false)으로 되돌아갈 수 있다는 게 실측으로 확인됐다(공유/콘텐츠 링크
 * 탭을 몇 분 열어두면 자동 저장이 새어 나감). window.location.pathname은
 * 리액트 렌더 주기와 무관하게 항상 "지금 실제로 보고 있는 URL"이라 이
 * 방식으로는 같은 종류의 실수(플래그 갱신 누락)가 재발할 수 없다 —
 * viewerModeActive와 별개의, 더 신뢰할 수 있는 두 번째 신호다.
 */
function isViewingSharedPlannerRoute(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  return path.startsWith("/planner/") && path !== "/planner/";
}

/**
 * Syncs a plan to its own server row — coalescing concurrent callers for
 * the same local plan id into a single request instead of racing two
 * independent inserts. This matters because a plan's very first sync (no
 * remoteId yet) can be kicked off from more than one place in quick
 * succession — e.g. the save-modal's background sync right after 저장,
 * immediately followed by a 카카오톡 공유/초대 click before that first
 * request's remoteId has come back. Without coalescing, both calls see no
 * remoteId and each INSERT a new row; whichever resolves second wins the
 * local plan's remoteId, silently orphaning the other row on the server —
 * which a later hydration then pulls back in as a duplicate saved plan.
 */
export function syncPlanToServer(
  planId: string,
  region: Region,
  items: ItineraryItem[],
  title: string,
  remoteId: number | undefined,
  isDraft?: boolean,
): Promise<{ id: number; shareToken: string }> {
  // 작업지시서 2026-09-16 "계획 덮어쓰기가 재발했습니다" §3-②: 저장하려는
  // items가 실제로 이 planId/remoteId에서 나온 게 맞는지 클라이언트가
  // 비교할 방법이 없다(그런 출처 추적 자체가 없다) — 대신 "지금 남의
  // 계획/콘텐츠를 보고 있다"는 사실(viewerModeActive) 하나로 모든 저장·
  // 공유 호출을 한곳에서 막는다. 모든 호출부(자동 저장, 카카오톡 공유,
  // 초대하기, 계획 저장)가 결국 이 함수를 거치므로, 어느 UI가 버튼을
  // 숨기지 못해도 서버로는 절대 안 나간다.
  if (useItineraryStore.getState().viewerModeActive) {
    return Promise.reject(new Error("viewer mode — refusing to sync someone else's plan over a real one"));
  }
  // remoteId가 있는 경우(기존 행 덮어쓰기)만 막는다 — 게스트→계정 이관처럼
  // 새 행을 만드는 정상 흐름은 하필 공유 링크 탭에서 로그인했다는 이유로
  // 막히면 안 된다(서버 쪽 Referer 확인과 같은 이유로 같은 범위만 막음).
  if (remoteId != null && isViewingSharedPlannerRoute()) {
    return Promise.reject(new Error("on a shared plan view — refusing to overwrite an existing plan"));
  }
  const existing = inFlight.get(planId);
  if (existing) return existing;
  const promise = saveItinerary(region, items, title, remoteId, isDraft).finally(() => {
    inFlight.delete(planId);
  });
  inFlight.set(planId, promise);
  return promise;
}
