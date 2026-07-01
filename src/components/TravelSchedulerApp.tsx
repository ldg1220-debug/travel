"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { MapProvider } from "./map/MapProvider";
import { TimelineView } from "./TimelineView";
import { TimeModal } from "./TimeModal";
import { MarkerPin } from "./MarkerPin";
import { Icon } from "./Icon";
import { RegionTabs } from "./RegionTabs";
import { TrendBottomSheet } from "./TrendBottomSheet";
import { useItineraryStore } from "@/store/itineraryStore";
import type { Place } from "@/lib/types";
import { formatDateLabel, formatTime, shiftISODate } from "@/lib/timeline";
import { fetchTrendingPlaces } from "@/lib/api";

interface TravelSchedulerAppProps {
  /** ISR-cached trending places for each region, fetched server-side so first paint is free. */
  internationalPlaces: Place[];
  domesticPlaces: Place[];
}

export function TravelSchedulerApp({ internationalPlaces, domesticPlaces }: TravelSchedulerAppProps) {
  const region = useItineraryStore((s) => s.region);
  const setRegion = useItineraryStore((s) => s.setRegion);
  const activeDate = useItineraryStore((s) => s.activeDate);
  const setActiveDate = useItineraryStore((s) => s.setActiveDate);
  const items = useItineraryStore((s) => s.items);
  const isHourTaken = useItineraryStore((s) => s.isHourTaken);
  const addItem = useItineraryStore((s) => s.addItem);
  const removeItem = useItineraryStore((s) => s.removeItem);
  const clearDate = useItineraryStore((s) => s.clearDate);

  const regionInitialPlaces = region === "domestic" ? domesticPlaces : internationalPlaces;

  // React Query keeps this in sync with the pipeline-refreshed trend list
  // (see /api/trends?region=...) without ever blocking first paint on a
  // network call, and re-fetches automatically when the region tab flips.
  const { data: trendingPlaces = regionInitialPlaces } = useQuery({
    queryKey: ["trending-places", region],
    queryFn: () => fetchTrendingPlaces(region),
    initialData: regionInitialPlaces,
  });

  const [extraPlaces, setExtraPlaces] = useState<Place[]>([]);

  const handleRegionChange = useCallback(
    (nextRegion: typeof region) => {
      setRegion(nextRegion);
      setExtraPlaces([]);
    },
    [setRegion],
  );

  const places = useMemo(() => {
    const merged = [...trendingPlaces];
    for (const p of extraPlaces) if (!merged.some((m) => m.id === p.id)) merged.push(p);
    return merged;
  }, [trendingPlaces, extraPlaces]);

  const [modalPlace, setModalPlace] = useState<Place | null>(null);
  const [activeDragPlace, setActiveDragPlace] = useState<Place | null>(null);
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mapInteractive, setMapInteractive] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const placesById = useMemo(
    () => Object.fromEntries(places.map((p) => [p.id, p])),
    [places],
  );

  const dayItems = useMemo(() => items.filter((i) => i.date === activeDate), [items, activeDate]);

  const orderByPlace = useMemo(() => {
    const map: Record<string, number> = {};
    dayItems.forEach((item, i) => {
      map[item.placeId] = i + 1;
    });
    return map;
  }, [dayItems]);

  const routePoints = useMemo(
    () =>
      dayItems
        .map((item) => placesById[item.placeId])
        .filter((p): p is Place => Boolean(p))
        .map((p) => ({ lat: p.lat, lng: p.lng })),
    [dayItems, placesById],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const place = places.find((p) => p.id === event.active.id) ?? null;
      setActiveDragPlace(place);
      setMapInteractive(false);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(30);
      }
    },
    [places],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const place = activeDragPlace;
      setActiveDragPlace(null);
      setHoverHour(null);
      setMapInteractive(true);

      const over = event.over;
      if (!place || !over) return;
      const data = over.data.current as { date: string; hour: number } | undefined;
      if (!data) return;

      if (isHourTaken(data.date, data.hour)) {
        showToast(`${String(data.hour).padStart(2, "0")}:00 is already booked`);
        return;
      }
      addItem({
        placeId: place.id,
        name: place.name,
        date: data.date,
        time: formatTime(data.hour, 0),
        coordinates: { lat: place.lat, lng: place.lng },
      });
      showToast(`${place.name} · ${String(data.hour).padStart(2, "0")}:00`);
    },
    [activeDragPlace, addItem, isHourTaken, showToast],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragPlace(null);
    setHoverHour(null);
    setMapInteractive(true);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const data = event.over?.data.current as { date: string; hour: number } | undefined;
    setHoverHour(data && data.date === activeDate ? data.hour : null);
  }, [activeDate]);

  const handleSelectFromSheet = useCallback((place: Place) => {
    setExtraPlaces((prev) => (prev.some((p) => p.id === place.id) ? prev : [...prev, place]));
    setModalPlace(place);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col h-dvh w-full bg-white sm:max-w-[430px] sm:mx-auto sm:my-6 sm:h-[min(860px,90vh)] sm:rounded-[36px] sm:shadow-2xl sm:border sm:border-slate-200 overflow-hidden relative">
        <header className="flex items-center justify-between px-5 pt-3 shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-medium">
              {formatDateLabel(activeDate)}
            </div>
            <div className="text-[19px] font-bold text-slate-900 leading-tight">Travel Scheduler</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveDate(shiftISODate(activeDate, -1))}
              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50"
              aria-label="Previous day"
            >
              <Icon name="chevronLeft" size={14} color="#334155" />
            </button>
            <button
              onClick={() => setActiveDate(shiftISODate(activeDate, 1))}
              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50"
              aria-label="Next day"
            >
              <Icon name="chevronRight" size={14} color="#334155" />
            </button>
            <button
              onClick={() => clearDate(activeDate)}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-full border border-slate-200 bg-white"
            >
              Clear
            </button>
          </div>
        </header>

        <RegionTabs region={region} onChange={handleRegionChange} />

        <div className="h-1/2 shrink-0 min-h-0 relative mt-3">
          <MapProvider
            region={region}
            places={places}
            orderByPlace={orderByPlace}
            routePoints={routePoints}
            interactive={mapInteractive}
            onShortPress={setModalPlace}
          />
          <button
            onClick={() => setSheetOpen(true)}
            className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/95 border border-slate-200 shadow-md text-[12px] font-semibold text-slate-700"
          >
            ✨ Trending spots
          </button>
        </div>

        <div className="h-1/2 min-h-0 border-t border-slate-200">
          <TimelineView
            date={activeDate}
            items={dayItems}
            placesById={placesById}
            orderByPlace={orderByPlace}
            hoverHour={hoverHour}
            onRemove={removeItem}
          />
        </div>

        {modalPlace && (
          <TimeModal
            place={modalPlace}
            initialDate={activeDate}
            isHourTaken={isHourTaken}
            onClose={() => setModalPlace(null)}
            onRegister={(date, hour, minute) => {
              addItem({
                placeId: modalPlace.id,
                name: modalPlace.name,
                date,
                time: formatTime(hour, minute),
                coordinates: { lat: modalPlace.lat, lng: modalPlace.lng },
              });
              setModalPlace(null);
              showToast(`${modalPlace.name} · ${formatTime(hour, minute)}`);
            }}
          />
        )}

        <TrendBottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          region={region}
          trendingPlaces={trendingPlaces}
          onSelectPlace={handleSelectFromSheet}
        />

        {toast && <div className="toast">{toast}</div>}
      </div>

      <DragOverlay>
        {activeDragPlace && (
          <div className="drag-ghost" style={{ transform: "translate(-50%, -100%) scale(1.15)" }}>
            <MarkerPin place={activeDragPlace} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
