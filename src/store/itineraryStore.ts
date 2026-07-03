import { create } from "zustand";
import type { ItineraryItem, Place, Region } from "@/lib/types";
import { TIMELINE_HOURS, formatTime, hourFromTime, todayISODate } from "@/lib/timeline";
import { haversineDistanceMeters } from "@/lib/geo";
import { FUKUOKA_YUFUIN_PLACES } from "@/lib/mockPlacesFukuokaYufuin";

interface ItineraryState {
  items: ItineraryItem[];
  activeDate: string;
  region: Region;
  /**
   * Places available to schedule. Seeded with real Fukuoka/Yufuin
   * coordinates (~55km apart) so the /planner screen's Google
   * Maps view — the only current reader of this slice — has a genuine
   * spread of points to fit-bounds and draw a route across, until a real
   * trends/search API is wired in (see fetchTrendingPlaces in
   * src/lib/api.ts for the ISR-backed version used on the main page, which
   * manages its own place list independently of this store slice).
   */
  places: Place[];
  setActiveDate: (date: string) => void;
  setRegion: (region: Region) => void;
  setPlaces: (places: Place[]) => void;
  /** Merges places in by id (e.g. trend-sheet results, search selections) without duplicating existing ones. */
  addPlaces: (newPlaces: Place[]) => void;
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
  /**
   * Reschedules an existing item to a new date/time (drag-and-drop moves,
   * or the schedule-edit modal) without changing its identity/id. If the
   * target slot is already occupied by a *different* item, the two swap
   * times instead of one silently clobbering the other.
   */
  moveItem: (id: string, date: string, hour: number, minute?: number, budget?: number) => void;
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

export const useItineraryStore = create<ItineraryState>((set, get) => ({
  items: [],
  activeDate: todayISODate(),
  region: "international",
  places: FUKUOKA_YUFUIN_PLACES,

  setActiveDate: (date) => set({ activeDate: date }),
  setRegion: (region) => set({ region }),
  setPlaces: (places) => set({ places }),
  addPlaces: (newPlaces) =>
    set((state) => {
      const existingIds = new Set(state.places.map((p) => p.id));
      const toAdd = newPlaces.filter((p) => !existingIds.has(p.id));
      return toAdd.length > 0 ? { places: [...state.places, ...toAdd] } : state;
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
      const freeHour = TIMELINE_HOURS.find((h) => !takenHours.has(h)) ?? TIMELINE_HOURS[TIMELINE_HOURS.length - 1];
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
    get().items.some(
      (item) => item.date === date && hourFromTime(item.time) === hour,
    ),

  addItem: (item) =>
    set((state) => {
      // One entry per hour slot per date — replace any existing booking.
      const targetHour = hourFromTime(item.time);
      const filtered = state.items.filter(
        (existing) =>
          !(
            existing.date === item.date &&
            hourFromTime(existing.time) === targetHour
          ),
      );
      const next: ItineraryItem = {
        ...item,
        id: `${item.placeId}-${item.date}-${item.time}-${Date.now()}`,
      };
      return {
        items: [...filtered, next].sort((a, b) =>
          a.date === b.date
            ? a.time.localeCompare(b.time)
            : a.date.localeCompare(b.date),
        ),
      };
    }),

  moveItem: (id, date, hour, minute = 0, budget) =>
    set((state) => {
      const moving = state.items.find((i) => i.id === id);
      if (!moving) return state;
      const time = formatTime(hour, minute);
      const occupant = state.items.find(
        (i) => i.id !== id && i.date === date && hourFromTime(i.time) === hour,
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

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  setItems: (items) => set({ items }),

  clearDate: (date) =>
    set((state) => ({ items: state.items.filter((i) => i.date !== date) })),

  optimizeRoute: (date) => {
    const state = get();
    const dayItems = state.items
      .filter((i) => i.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
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
}));
