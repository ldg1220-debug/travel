import { saveItinerary } from "./api";
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
  const existing = inFlight.get(planId);
  if (existing) return existing;
  const promise = saveItinerary(region, items, title, remoteId, isDraft).finally(() => {
    inFlight.delete(planId);
  });
  inFlight.set(planId, promise);
  return promise;
}
