import { create } from "zustand";
import type { ItineraryItem, Place, Region } from "@/lib/types";
import { hourFromTime, todayISODate } from "@/lib/timeline";
import { FUKUOKA_YUFUIN_PLACES } from "@/lib/mockPlacesFukuokaYufuin";

interface ItineraryState {
  items: ItineraryItem[];
  activeDate: string;
  region: Region;
  /**
   * Places available to schedule. Seeded with real Fukuoka/Yufuin
   * coordinates (~55km apart) so the /travel-scheduler prototype's Google
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
  isHourTaken: (date: string, hour: number) => boolean;
  addItem: (item: Omit<ItineraryItem, "id">) => void;
  removeItem: (id: string) => void;
  clearDate: (date: string) => void;
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

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  clearDate: (date) =>
    set((state) => ({ items: state.items.filter((i) => i.date !== date) })),
}));
