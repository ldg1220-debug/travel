import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ItineraryItem, Place, Region } from "@/lib/types";
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

interface ItineraryState {
  items: ItineraryItem[];
  activeDate: string;
  region: Region;
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
  /** Adds or overwrites a `savedPlaces` entry by id — the detail overlay's "저장하기" action. */
  upsertSavedPlace: (place: Place) => void;
  isHourTaken: (date: string, hour: number) => boolean;
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
  removeItem: (id: string) => void;
  clearDate: (date: string) => void;
  /** Bulk-replaces the whole itinerary — used to hydrate from a shared/collaborative session. */
  setItems: (items: ItineraryItem[]) => void;
  /**
   * Reassigns a day's stops to minimize total travel distance (nearest-
   * neighbor heuristic), keeping them in the same set of hour slots they
   * already occupied — just reshuffling which stop lands in which slot.
   * Returns false (no-op) if there's nothing meaningful to reorder.
   */
  optimizeRoute: (date: string) => boolean;
}

export const useItineraryStore = create<ItineraryState>()(
  persist(
    (set, get) => ({
      items: [],
      activeDate: todayISODate(),
      region: "international",
      places: [],
      savedPlaces: [],

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
          const exists = state.savedPlaces.some((p) => p.id === place.id);
          return {
            savedPlaces: exists
              ? state.savedPlaces.map((p) => (p.id === place.id ? place : p))
              : [...state.savedPlaces, place],
          };
        }),

      // An hour is "taken" if any item's [start, start+duration) range
      // overlaps that hour's full [hour*60, hour*60+60) span — not just an
      // exact start-time match, now that stops can span multiple hours.
      isHourTaken: (date, hour) =>
        get().items.some(
          (item) =>
            item.date === date &&
            rangesOverlap(minutesFromTime(item.time), item.durationMinutes, hour * 60, 60),
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

      removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

      setItems: (items) => set({ items }),

      clearDate: (date) => set((state) => ({ items: state.items.filter((i) => i.date !== date) })),

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
    }),
    {
      name: "travel-scheduler-saved-places",
      partialize: (state) => ({ savedPlaces: state.savedPlaces }),
    },
  ),
);
