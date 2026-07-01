import { create } from "zustand";
import type { ItineraryItem, Region } from "@/lib/types";
import { hourFromTime, todayISODate } from "@/lib/timeline";

interface ItineraryState {
  items: ItineraryItem[];
  activeDate: string;
  region: Region;
  setActiveDate: (date: string) => void;
  setRegion: (region: Region) => void;
  isHourTaken: (date: string, hour: number) => boolean;
  addItem: (item: Omit<ItineraryItem, "id">) => void;
  removeItem: (id: string) => void;
  clearDate: (date: string) => void;
}

export const useItineraryStore = create<ItineraryState>((set, get) => ({
  items: [],
  activeDate: todayISODate(),
  region: "international",

  setActiveDate: (date) => set({ activeDate: date }),
  setRegion: (region) => set({ region }),

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
