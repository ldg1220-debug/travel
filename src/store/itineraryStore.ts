import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ItineraryItem, Place, Region } from "@/lib/types";
import { TIMELINE_HOURS, formatTime, hourFromTime, todayISODate } from "@/lib/timeline";
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
  /**
   * Adds one place to the map catalog (`places`) AND schedules it on
   * `activeDate` in the next free hour slot — used by /discover's
   * single-spot "[+]" button, where there's no time-picker modal to ask
   * the user which hour they want.
   */
  addPlace: (place: Place) => void;
  /**
   * Same as `addPlace`, but for a whole ordered set of stops at once
   * (e.g. a /discover route template's "[+ 내 일정에 담기]" button) —
   * each place gets the next free hour in order, so the resulting
   * schedule preserves the bundle's intended sequence.
   */
  addRouteBundle: (places: Place[]) => void;
  isHourTaken: (date: string, hour: number) => boolean;
  addItem: (item: Omit<ItineraryItem, "id">) => void;
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

      addPlace: (place) => {
        const { addPlaces, addItem, activeDate, items } = get();
        addPlaces([place]);
        const takenHours = new Set(
          items.filter((i) => i.date === activeDate).map((i) => hourFromTime(i.time)),
        );
        const freeHour = TIMELINE_HOURS.find((h) => !takenHours.has(h)) ?? TIMELINE_HOURS[TIMELINE_HOURS.length - 1];
        addItem({
          placeId: place.id,
          name: place.name,
          date: activeDate,
          time: formatTime(freeHour, 0),
          coordinates: { lat: place.lat, lng: place.lng },
        });
      },

      addRouteBundle: (places) => {
        const { addPlaces, addItem, activeDate } = get();
        addPlaces(places);
        // Recomputed after each addItem (via get().items), so this correctly
        // skips hours the bundle itself just filled in, not just pre-existing ones.
        for (const place of places) {
          const takenHours = new Set(
            get()
              .items.filter((i) => i.date === activeDate)
              .map((i) => hourFromTime(i.time)),
          );
          const freeHour =
            TIMELINE_HOURS.find((h) => !takenHours.has(h)) ?? TIMELINE_HOURS[TIMELINE_HOURS.length - 1];
          addItem({
            placeId: place.id,
            name: place.name,
            date: activeDate,
            time: formatTime(freeHour, 0),
            coordinates: { lat: place.lat, lng: place.lng },
          });
        }
      },

      isHourTaken: (date, hour) =>
        get().items.some((item) => item.date === date && hourFromTime(item.time) === hour),

      addItem: (item) =>
        set((state) => {
          // One entry per hour slot per date — replace any existing booking.
          const targetHour = hourFromTime(item.time);
          const filtered = state.items.filter(
            (existing) => !(existing.date === item.date && hourFromTime(existing.time) === targetHour),
          );
          const next: ItineraryItem = {
            ...item,
            id: `${item.placeId}-${item.date}-${item.time}-${Date.now()}`,
          };
          return {
            items: [...filtered, next].sort((a, b) =>
              a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
            ),
          };
        }),

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
