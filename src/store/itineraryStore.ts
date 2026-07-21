import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ItineraryItem, Place, Region, SavedPlan, SavedPlaceFolder } from "@/lib/types";
import {
  DAY_MINUTES,
  DEFAULT_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  formatTime,
  hourFromTime,
  minutesFromTime,
  rangesOverlap,
  todayISODate,
} from "@/lib/timeline";
import { haversineDistanceMeters } from "@/lib/geo";
import { styleForCategory } from "@/lib/placeStyle";
import { deleteItinerary } from "@/lib/api";

/**
 * Curated/mock place ids all use a fixed prefix (`trend-` from
 * mockTrends.ts, `d-`/`o-` from discoverData.ts) that never collides with a
 * real Google Places id (long `ChIJ...`-style strings) or a Kakao Local id
 * (plain numeric string) — used by the v3 persist migration below to strip
 * out mock "ghost pins" that leaked into `places` before TrendSheet's
 * auto-inject was removed.
 */
const MOCK_PLACE_ID_PATTERN = /^(trend-|d-|o-)/;
function stripMockPlaces(places: Place[]): Place[] {
  return places.filter((p) => !MOCK_PLACE_ID_PATTERN.test(p.id));
}

/** Cap on how many named plans a user can keep side by side — enough to compare a handful of trip drafts without the switcher list growing unbounded. */
export const MAX_SAVED_PLANS = 10;

interface ItineraryState {
  items: ItineraryItem[];
  activeDate: string;
  region: Region;
  /**
   * The city the AppBar header shows for /planner — replaces what used to
   * be a hardcoded "Fukuoka × Yufuin" string. Updates whenever a /discover
   * spot or route gets scheduled (see cityFromRegion in discover/page.tsx),
   * so the header always reflects whatever the user is actually planning,
   * not a fixed demo trip.
   */
  currentCity: string;
  setCurrentCity: (city: string) => void;
  /**
   * Places available to schedule — starts empty and fills in from real
   * user actions (search, trend cards, /discover) rather than a
   * hardcoded seed, so the map only ever shows places someone actually
   * discovered/searched for in this session.
   */
  places: Place[];
  /**
   * User-curated "관심 장소" (interested places) list — distinct from
   * `places` above (the map's full discovery catalog). Populated by the
   * planner's 관심 장소 tab search, persisted across sessions.
   */
  savedPlaces: Place[];
  setActiveDate: (date: string) => void;
  setRegion: (region: Region) => void;
  setPlaces: (places: Place[]) => void;
  /** Merges places in by id (e.g. trend-sheet results, search selections) without duplicating existing ones. */
  addPlaces: (newPlaces: Place[]) => void;
  /** Adds one place to `savedPlaces` by id, no-op if already saved. */
  addSavedPlace: (place: Place) => void;
  removeSavedPlace: (placeId: string) => void;
  /** Adds or overwrites a `savedPlaces` entry by id — the detail overlay's "저장하기" action. Always preserves the existing entry's `folderId` (see `setSavedPlaceFolder` for the one action that's actually meant to change it) — most callers (search results, re-opening the detail overlay) build a fresh `Place` that was never told what folder it's in, and must not silently un-file it. */
  upsertSavedPlace: (place: Place) => void;

  /** User-defined folders for organizing `savedPlaces` — see `SavedPlaceFolder`. */
  savedPlaceFolders: SavedPlaceFolder[];
  /** Creates a new folder and returns its id. */
  addSavedPlaceFolder: (name: string) => string;
  renameSavedPlaceFolder: (id: string, name: string) => void;
  /** Deletes a folder and un-files any `savedPlaces` entries that were in it (they fall back to unfiled, not deleted). */
  deleteSavedPlaceFolder: (id: string) => void;
  /** The one place a saved place's `folderId` is actually meant to change — the folder picker/dropdown. */
  setSavedPlaceFolder: (placeId: string, folderId: string | undefined) => void;

  isHourTaken: (date: string, hour: number) => boolean;
  /**
   * Exact minute-level overlap check — unlike isHourTaken (which treats a
   * whole clock hour as blocked the instant ANY item touches it, even a
   * 10:00-10:30 stop), this only reports a conflict when the candidate
   * [startMinutes, startMinutes+durationMinutes) range truly overlaps an
   * existing item. Used by ScheduleModal's start-hour picker so a stop can
   * be booked right after another one ends within the same hour instead of
   * being forced to the next hour. `excludeId` lets editing a stop ignore
   * its own current slot.
   */
  hasConflict: (date: string, startMinutes: number, durationMinutes: number, excludeId?: string) => boolean;
  addItem: (item: Omit<ItineraryItem, "id" | "durationMinutes"> & { durationMinutes?: number }) => void;
  /**
   * Reschedules an existing item to a new date/time (drag-and-drop moves,
   * or the schedule-edit modal) without changing its identity/id. If the
   * target slot is already occupied by a *different* item, the two swap
   * times instead of one silently clobbering the other.
   */
  moveItem: (id: string, date: string, hour: number, minute?: number, budget?: number) => void;
  /**
   * Resizes a stop's length by dragging its bottom handle (15-minute
   * snapping is done by the caller before this is invoked) — clamped here
   * to a sane [15min, rest-of-day] range so a runaway drag can't produce a
   * negative or day-spanning block.
   */
  resizeItem: (id: string, durationMinutes: number) => void;
  /**
   * Resizes a stop by dragging its *top* handle — moves the start time
   * while keeping the end time fixed, so the block visually grows/shrinks
   * upward instead of downward (15-minute snapping/bounds are done by the
   * caller before this is invoked).
   */
  retimeItem: (id: string, startMinutes: number, durationMinutes: number) => void;
  removeItem: (id: string) => void;
  clearDate: (date: string) => void;
  /** Clears every scheduled stop across all dates — the toolbar's 비우기 action, for starting a fresh plan. Leaves `places`/`savedPlaces` untouched. */
  clearAllItems: () => void;
  /** Bulk-replaces the whole itinerary — used to hydrate from a shared/collaborative session. */
  setItems: (items: ItineraryItem[]) => void;
  /**
   * Reassigns a day's stops to minimize total travel distance (nearest-
   * neighbor heuristic), keeping them in the same set of hour slots they
   * already occupied — just reshuffling which stop lands in which slot.
   * Returns false (no-op) if there's nothing meaningful to reorder.
   */
  optimizeRoute: (date: string) => boolean;

  /**
   * Named snapshots of the whole working itinerary — lets a user keep
   * several trip drafts side by side and switch between them to compare,
   * instead of only ever having one active plan. Capped at MAX_SAVED_PLANS.
   */
  savedPlans: SavedPlan[];
  /** Which saved plan (if any) the current working state was last loaded from/saved as — purely informational (e.g. to highlight it in the switcher list). */
  activePlanId: string | null;
  /**
   * Snapshots the current working itinerary as a named plan. If
   * `overwriteId` is given, replaces that existing plan's contents in place
   * (used when the user picks "덮어쓰기" on a duplicate name) instead of
   * adding a new entry — otherwise returns false (no-op) once
   * MAX_SAVED_PLANS is reached, and the caller should ask the user to
   * delete one first.
   */
  savePlanAs: (name: string, overwriteId?: string) => string | null;
  /** Replaces the working itinerary with a saved plan's snapshot. */
  loadPlan: (id: string) => void;
  deletePlan: (id: string) => void;
  /** Attaches a plan's server-side identity after a successful sync, so re-saving/re-sharing it later reuses that same row/link instead of creating a new one. */
  setPlanRemoteInfo: (id: string, remoteId: number, shareToken: string) => void;
  /**
   * Reconciles the local saved-plans list against the server (see
   * fetchUserItineraries), called once per login/refresh:
   *  - adds plans this device doesn't already have (matched by remoteId),
   *    so a plan saved on another device while logged into the same
   *    account shows up here too;
   *  - removes local plans whose remoteId no longer appears in `remote`,
   *    so a plan deleted from another device (or from this one, on a
   *    later refresh) doesn't keep haunting devices that had already
   *    cached a copy of it.
   * A plan with no remoteId was never synced, so it's left untouched
   * either way — only synced plans are ever added or removed here.
   */
  hydrateSavedPlansFromServer: (
    remote: { id: number; title: string; region: Region; placesData: ItineraryItem[]; shareToken: string }[],
  ) => void;
}

export const useItineraryStore = create<ItineraryState>()(
  persist(
    (set, get) => ({
      items: [],
      activeDate: todayISODate(),
      region: "international",
      currentCity: "새 여행",
      places: [],
      savedPlaces: [],
      savedPlaceFolders: [],
      savedPlans: [],
      activePlanId: null,
      setCurrentCity: (city) => set({ currentCity: city }),

      setActiveDate: (date) => set({ activeDate: date }),
      setRegion: (region) => set({ region }),
      setPlaces: (places) => set({ places }),
      addPlaces: (newPlaces) =>
        set((state) => {
          const existingIds = new Set(state.places.map((p) => p.id));
          const toAdd = newPlaces.filter((p) => !existingIds.has(p.id));
          return toAdd.length > 0 ? { places: [...state.places, ...toAdd] } : state;
        }),
      addSavedPlace: (place) =>
        set((state) =>
          state.savedPlaces.some((p) => p.id === place.id)
            ? state
            : { savedPlaces: [...state.savedPlaces, place] },
        ),
      removeSavedPlace: (placeId) =>
        set((state) => ({ savedPlaces: state.savedPlaces.filter((p) => p.id !== placeId) })),
      upsertSavedPlace: (place) =>
        set((state) => {
          const existing = state.savedPlaces.find((p) => p.id === place.id);
          if (!existing) return { savedPlaces: [...state.savedPlaces, place] };
          // Preserve the existing folderId unless the caller explicitly
          // included one — even `undefined` (e.g. "미분류" picked in the
          // folder picker) counts as explicit, checked via `in` rather than
          // a plain undefined check. Most callers (a fresh search-result
          // tap building a brand new Place literal) never mention folderId
          // at all and must not silently un-file an already-filed place;
          // PlaceDetailOverlay's save always includes the key since it
          // manages folderId explicitly via FolderChips.
          const next = "folderId" in place ? place : { ...place, folderId: existing.folderId };
          return { savedPlaces: state.savedPlaces.map((p) => (p.id === place.id ? next : p)) };
        }),

      addSavedPlaceFolder: (name) => {
        const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({ savedPlaceFolders: [...state.savedPlaceFolders, { id, name }] }));
        return id;
      },
      renameSavedPlaceFolder: (id, name) =>
        set((state) => ({
          savedPlaceFolders: state.savedPlaceFolders.map((f) => (f.id === id ? { ...f, name } : f)),
        })),
      setSavedPlaceFolder: (placeId, folderId) =>
        set((state) => ({
          savedPlaces: state.savedPlaces.map((p) => (p.id === placeId ? { ...p, folderId } : p)),
        })),
      deleteSavedPlaceFolder: (id) =>
        set((state) => ({
          savedPlaceFolders: state.savedPlaceFolders.filter((f) => f.id !== id),
          savedPlaces: state.savedPlaces.map((p) => (p.folderId === id ? { ...p, folderId: undefined } : p)),
        })),

      // An hour is "taken" if any item's [start, start+duration) range
      // overlaps that hour's full [hour*60, hour*60+60) span — not just an
      // exact start-time match, now that stops can span multiple hours.
      isHourTaken: (date, hour) =>
        get().items.some(
          (item) =>
            item.date === date &&
            rangesOverlap(minutesFromTime(item.time), item.durationMinutes, hour * 60, 60),
        ),

      hasConflict: (date, startMinutes, durationMinutes, excludeId) =>
        get().items.some(
          (item) =>
            item.date === date &&
            item.id !== excludeId &&
            rangesOverlap(minutesFromTime(item.time), item.durationMinutes, startMinutes, durationMinutes),
        ),

      addItem: (item) =>
        set((state) => {
          const durationMinutes = item.durationMinutes ?? DEFAULT_DURATION_MINUTES;
          const start = minutesFromTime(item.time);
          // Replace any existing booking(s) that this new stop's time range overlaps.
          const filtered = state.items.filter(
            (existing) =>
              !(existing.date === item.date && rangesOverlap(minutesFromTime(existing.time), existing.durationMinutes, start, durationMinutes)),
          );
          const next: ItineraryItem = {
            ...item,
            durationMinutes,
            id: `${item.placeId}-${item.date}-${item.time}-${Date.now()}`,
          };
          return {
            items: [...filtered, next].sort((a, b) =>
              a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
            ),
          };
        }),

      moveItem: (id, date, hour, minute = 0, budget) =>
        set((state) => {
          const moving = state.items.find((i) => i.id === id);
          if (!moving) return state;
          const time = formatTime(hour, minute);
          const start = hour * 60 + minute;
          const occupant = state.items.find(
            (i) => i.id !== id && i.date === date && rangesOverlap(minutesFromTime(i.time), i.durationMinutes, start, moving.durationMinutes),
          );

          const next = state.items.map((i) => {
            if (i.id === id) return { ...i, date, time, budget: budget !== undefined ? budget : i.budget };
            if (occupant && i.id === occupant.id) return { ...i, date: moving.date, time: moving.time };
            return i;
          });

          return {
            items: next.sort((a, b) =>
              a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
            ),
          };
        }),

      resizeItem: (id, durationMinutes) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.id !== id) return i;
            const maxDuration = DAY_MINUTES - minutesFromTime(i.time);
            const clamped = Math.min(maxDuration, Math.max(MIN_DURATION_MINUTES, durationMinutes));
            return { ...i, durationMinutes: clamped };
          }),
        })),

      retimeItem: (id, startMinutes, durationMinutes) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.id !== id) return i;
            const clampedStart = Math.max(0, Math.min(DAY_MINUTES - MIN_DURATION_MINUTES, startMinutes));
            const clampedDuration = Math.min(DAY_MINUTES - clampedStart, Math.max(MIN_DURATION_MINUTES, durationMinutes));
            return { ...i, time: formatTime(Math.floor(clampedStart / 60), clampedStart % 60), durationMinutes: clampedDuration };
          }),
        })),

      removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

      setItems: (items) => set({ items }),

      clearDate: (date) => set((state) => ({ items: state.items.filter((i) => i.date !== date) })),

      clearAllItems: () => set({ items: [] }),

      optimizeRoute: (date) => {
        const state = get();
        const dayItems = state.items.filter((i) => i.date === date).sort((a, b) => a.time.localeCompare(b.time));
        if (dayItems.length < 3) return false;

        // Nearest-neighbor TSP heuristic: start from the currently-earliest
        // stop, then repeatedly hop to whichever unvisited stop is closest.
        const remaining = dayItems.slice(1);
        const route: ItineraryItem[] = [dayItems[0]];
        let current = dayItems[0];
        while (remaining.length > 0) {
          let nearestIndex = 0;
          let nearestDistance = Infinity;
          remaining.forEach((candidate, index) => {
            const distance = haversineDistanceMeters(current.coordinates, candidate.coordinates);
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestIndex = index;
            }
          });
          const [next] = remaining.splice(nearestIndex, 1);
          route.push(next);
          current = next;
        }

        // Keep the same hour slots that were already in use — just reassign
        // which stop occupies which one, in the newly-optimized order.
        const hours = dayItems.map((i) => hourFromTime(i.time));
        const reordered = route.map((item, index) => ({
          ...item,
          time: formatTime(hours[index], 0),
        }));

        const otherItems = state.items.filter((i) => i.date !== date);
        set({
          items: [...otherItems, ...reordered].sort((a, b) =>
            a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
          ),
        });
        return true;
      },

      savePlanAs: (name, overwriteId) => {
        const state = get();
        if (overwriteId) {
          const exists = state.savedPlans.some((p) => p.id === overwriteId);
          if (!exists) return null;
          set({
            savedPlans: state.savedPlans.map((p) =>
              p.id === overwriteId
                ? {
                    ...p,
                    name,
                    savedAt: Date.now(),
                    items: state.items,
                    places: state.places,
                    activeDate: state.activeDate,
                    currentCity: state.currentCity,
                    region: state.region,
                  }
                : p,
            ),
            activePlanId: overwriteId,
          });
          return overwriteId;
        }
        if (state.savedPlans.length >= MAX_SAVED_PLANS) return null;
        const plan: SavedPlan = {
          id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          savedAt: Date.now(),
          items: state.items,
          places: state.places,
          activeDate: state.activeDate,
          currentCity: state.currentCity,
          region: state.region,
        };
        set({ savedPlans: [plan, ...state.savedPlans], activePlanId: plan.id });
        return plan.id;
      },

      loadPlan: (id) => {
        const plan = get().savedPlans.find((p) => p.id === id);
        if (!plan) return;
        set({
          items: plan.items,
          places: plan.places,
          activeDate: plan.activeDate,
          currentCity: plan.currentCity,
          region: plan.region,
          activePlanId: plan.id,
        });
      },

      deletePlan: (id) => {
        // A synced plan's server row has to be deleted too — otherwise it
        // outlives the local removal, and the next cross-device hydration
        // (e.g. just refreshing the page) fetches that still-alive row and
        // pulls the "deleted" plan right back in as if it were new.
        const remoteId = get().savedPlans.find((p) => p.id === id)?.remoteId;
        if (remoteId != null) deleteItinerary(remoteId).catch(() => {});
        set((state) => ({
          savedPlans: state.savedPlans.filter((p) => p.id !== id),
          activePlanId: state.activePlanId === id ? null : state.activePlanId,
        }));
      },

      setPlanRemoteInfo: (id, remoteId, shareToken) =>
        set((state) => ({
          savedPlans: state.savedPlans.map((p) => (p.id === id ? { ...p, remoteId, shareToken } : p)),
        })),

      hydrateSavedPlansFromServer: (remote) => {
        const state = get();
        const remoteById = new Map(remote.map((r) => [r.id, r]));
        // A hydrated plan has no local `places` catalog of its own — leaving
        // this empty made every card fall through to fallbackDisplay's
        // uncolored gray default (it has no place id to hash a color from),
        // so a synced/shared-then-saved plan always rendered as a wall of
        // identical gray cards. Synthesize one minimal marker per item
        // instead, same as the live shared-link viewer already does, so each
        // place still gets its own stable hashed color/icon.
        const toSavedPlan = (r: NonNullable<ReturnType<typeof remoteById.get>>, localId: string): SavedPlan => ({
          id: localId,
          name: r.title,
          savedAt: Date.now(),
          items: r.placesData,
          places: r.placesData.map((item) => {
            const { color, icon } = styleForCategory("Place", item.placeId);
            return {
              id: item.placeId,
              placeId: item.placeId,
              name: item.name,
              category: "Place",
              color,
              lat: item.coordinates.lat,
              lng: item.coordinates.lng,
              icon,
            } satisfies Place;
          }),
          activeDate: r.placesData[0]?.date ?? todayISODate(),
          currentCity: r.title,
          region: r.region,
          remoteId: r.id,
          shareToken: r.shareToken,
        });
        // A synced plan (has a remoteId) that's no longer in the server's
        // list was deleted elsewhere — drop the stale local copy. One that's
        // still there gets its content refreshed from the server (the
        // shared source of truth for anything with a remoteId) instead of
        // only being checked for existence — otherwise an edit synced from
        // another device would never show up here beyond the first time this
        // plan was ever pulled down. Unsynced plans (no remoteId) are never
        // touched here.
        const survivors = state.savedPlans
          .filter((p) => p.remoteId == null || remoteById.has(p.remoteId))
          .map((p) => (p.remoteId != null && remoteById.has(p.remoteId) ? toSavedPlan(remoteById.get(p.remoteId)!, p.id) : p));
        const knownRemoteIds = new Set(survivors.map((p) => p.remoteId).filter((id): id is number => id != null));
        const newPlans: SavedPlan[] = remote
          .filter((r) => !knownRemoteIds.has(r.id))
          .map((r) => toSavedPlan(r, `plan-remote-${r.id}`));
        set({
          savedPlans: [...newPlans, ...survivors],
          activePlanId: state.activePlanId && !survivors.some((p) => p.id === state.activePlanId) ? null : state.activePlanId,
        });
      },
    }),
    {
      name: "travel-scheduler-saved-places",
      // v2: persist the whole itinerary, not just savedPlaces. Before this,
      // items/places/activeDate/currentCity/region lived only in memory, so
      // a refresh (or closing the tab) silently wiped the trip the user was
      // building — the single most damaging bug for real use. Now the plan
      // survives a reload; a logged-in user's server save/share is layered
      // on top of this, not a substitute for it.
      //
      // v3: strip mock/curated-seed "ghost pins" that v2 durably saved.
      // TrendSheet used to auto-dump its mock trend spots into `places` on
      // every fetch; that auto-inject code was removed, but anyone who had
      // already loaded the app under v2 still has those entries stuck in
      // their browser's localStorage — deleting the injection code only
      // stops *new* pollution, it can't retroactively clean what's already
      // persisted. migrate() below does that one-time cleanup.
      //
      // v4: add savedPlans/activePlanId (named multi-plan snapshots).
      //
      // v5: add savedPlaceFolders (user-defined 관심 장소 보관함 folders).
      version: 5,
      partialize: (state) => ({
        items: state.items,
        places: state.places,
        savedPlaces: state.savedPlaces,
        savedPlaceFolders: state.savedPlaceFolders,
        activeDate: state.activeDate,
        currentCity: state.currentCity,
        region: state.region,
        savedPlans: state.savedPlans,
        activePlanId: state.activePlanId,
      }),
      // No explicit migrate needed for v1 -> v2: zustand shallow-merges the
      // persisted slice over the initial state, so v1's { savedPlaces }
      // carries forward and every newly-persisted field falls back to its
      // initial value.
      migrate: (persisted, version) => {
        const state = persisted as Partial<ItineraryState>;
        const migrated = {
          items: state.items ?? [],
          places: state.places ?? [],
          savedPlaces: state.savedPlaces ?? [],
          savedPlaceFolders: state.savedPlaceFolders ?? [],
          activeDate: state.activeDate ?? todayISODate(),
          currentCity: state.currentCity ?? "새 여행",
          region: state.region ?? ("international" as Region),
          savedPlans: state.savedPlans ?? [],
          activePlanId: state.activePlanId ?? null,
        };
        if (version < 3) {
          migrated.places = stripMockPlaces(migrated.places);
          migrated.savedPlaces = stripMockPlaces(migrated.savedPlaces);
        }
        return migrated;
      },
    },
  ),
);
