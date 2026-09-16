import { saveItinerary } from "./api";
import { useItineraryStore } from "@/store/itineraryStore";
import type { ItineraryItem, Region } from "./types";

const inFlight = new Map<string, Promise<{ id: number; shareToken: string }>>();

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
  const existing = inFlight.get(planId);
  if (existing) return existing;
  const promise = saveItinerary(region, items, title, remoteId, isDraft).finally(() => {
    inFlight.delete(planId);
  });
  inFlight.set(planId, promise);
  return promise;
}
