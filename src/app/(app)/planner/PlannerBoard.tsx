"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { GoogleMap, OverlayView, Polyline } from "@react-google-maps/api";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Clock, X, Wallet, Sparkles, Trash2, Footprints, TrainFront, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useItineraryStore } from "@/store/itineraryStore";
import { MapProvider, useGoogleMapsStatus } from "./MapProvider";
import { PlaceGlyph } from "./icons";
import { PlacesSearchInput } from "./PlacesSearchInput";
import { TrendSheet } from "./TrendSheet";
import { ScheduleModal } from "@/components/ScheduleModal";
import { pad2, formatTime, hourFromTime, formatDateLabelShort, dateWindow, shiftISODate, TIMELINE_HOURS, SLOT_HEIGHT, VISIBLE_DAYS } from "@/lib/timeline";
import { styleForCategory } from "@/lib/placeStyle";
import { calculateTransits, type TransitBlock } from "@/lib/transit";
import { fetchSharedItinerary, pushSharedItinerary } from "@/lib/api";
import type { ItineraryItem, Place } from "@/lib/types";

interface PlannerBoardProps {
  /** Set when viewing /planner/[shareToken] — enables collaborative polling sync. */
  shareToken?: string;
}

// ─────────────────────────────────────────────────────────────
export function PlannerBoard({ shareToken }: PlannerBoardProps) {
  return (
    <MapProvider>
      <PlannerBoardInner shareToken={shareToken} />
    </MapProvider>
  );
}

type ScheduleTarget =
  | { mode: "create"; place: Place }
  | { mode: "edit"; place: Place; item: ItineraryItem };

function PlannerBoardInner({ shareToken }: PlannerBoardProps) {
  const { isLoaded: mapsLoaded, loadError: mapsError } = useGoogleMapsStatus();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mapRef = useRef<google.maps.Map | null>(null);

  // Places to schedule + the single global itinerary come straight from
  // Zustand (src/store/itineraryStore.ts) — no local/hardcoded data here.
  const places = useItineraryStore((s) => s.places);
  const activeDate = useItineraryStore((s) => s.activeDate);
  const setActiveDate = useItineraryStore((s) => s.setActiveDate);
  const items = useItineraryStore((s) => s.items);
  const isHourTaken = useItineraryStore((s) => s.isHourTaken);
  const addItem = useItineraryStore((s) => s.addItem);
  const moveItem = useItineraryStore((s) => s.moveItem);
  const removeItem = useItineraryStore((s) => s.removeItem);
  const clearDate = useItineraryStore((s) => s.clearDate);
  const addPlaces = useItineraryStore((s) => s.addPlaces);
  const optimizeRoute = useItineraryStore((s) => s.optimizeRoute);
  const setRegion = useItineraryStore((s) => s.setRegion);
  const setItems = useItineraryStore((s) => s.setItems);

  // ── multi-day (Notion-style) timeline window ──
  const visibleDates = useMemo(() => dateWindow(activeDate, VISIBLE_DAYS), [activeDate]);

  const scheduleByDate = useMemo(() => {
    const map: Record<string, ItineraryItem[]> = {};
    for (const date of visibleDates) {
      map[date] = items.filter((i) => i.date === date).slice().sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [items, visibleDates]);

  const orderByDate = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const date of visibleDates) {
      const order: Record<string, number> = {};
      scheduleByDate[date].forEach((s, i) => (order[s.placeId] = i + 1));
      map[date] = order;
    }
    return map;
  }, [scheduleByDate, visibleDates]);

  const transitByDate = useMemo(() => {
    const map: Record<string, Record<number, TransitBlock>> = {};
    for (const date of visibleDates) {
      const blocks = calculateTransits(scheduleByDate[date], hourFromTime);
      const byHour: Record<number, TransitBlock> = {};
      blocks.forEach((b) => (byHour[b.hour] = b));
      map[date] = byHour;
    }
    return map;
  }, [scheduleByDate, visibleDates]);

  const schedule = scheduleByDate[activeDate] ?? [];
  const orderByPlace = orderByDate[activeDate] ?? {};
  const totalBudget = items.reduce((sum, s) => sum + (s.budget ?? 0), 0);

  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ place: Place; x: number; y: number } | null>(null);
  const [hoverSlot, setHoverSlot] = useState<{ date: string; hour: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gridDragItemId, setGridDragItemId] = useState<string | null>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLong = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const last = useRef({ x: 0, y: 0 });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);

  // ── Task 3: collaborative sync (polling — the fastest reliable option
  // without a WebSocket server or a service like Supabase in this stack) ──
  const lastSyncedSnapshotRef = useRef<string | null>(null);
  const suppressNextPushRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: sharedData } = useQuery({
    queryKey: ["shared-itinerary", shareToken],
    queryFn: () => fetchSharedItinerary(shareToken as string),
    enabled: Boolean(shareToken),
    refetchInterval: shareToken ? 3000 : false,
  });

  useEffect(() => {
    if (!sharedData) return;
    const snapshot = JSON.stringify({ region: sharedData.region, placesData: sharedData.placesData });
    if (snapshot === lastSyncedSnapshotRef.current) return;
    lastSyncedSnapshotRef.current = snapshot;
    suppressNextPushRef.current = true;

    setRegion(sharedData.region);
    setItems(sharedData.placesData);

    const missing = sharedData.placesData
      .filter((item) => !places.some((p) => p.id === item.placeId))
      .map((item) => {
        const { color, icon } = styleForCategory("Place");
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
      });
    if (missing.length > 0) addPlaces(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `places` intentionally excluded: only need it to seed missing markers once per incoming snapshot, not on every local places change
  }, [sharedData, setRegion, setItems, addPlaces]);

  useEffect(() => {
    if (!shareToken) return;
    const unsubscribe = useItineraryStore.subscribe((state, prevState) => {
      if (suppressNextPushRef.current) {
        suppressNextPushRef.current = false;
        return;
      }
      if (state.items === prevState.items && state.region === prevState.region) return;

      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      pushTimerRef.current = setTimeout(() => {
        const snapshot = JSON.stringify({ region: state.region, placesData: state.items });
        lastSyncedSnapshotRef.current = snapshot;
        pushSharedItinerary(shareToken, state.region, state.items).catch(() => {
          showToast("Sync failed — will retry on the next change");
        });
      }, 800);
    });
    return () => {
      unsubscribe();
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [shareToken, showToast]);

  const registerAt = (place: Place, date: string, hour: number, minute = 0, budget?: number) => {
    addItem({
      placeId: place.id,
      name: place.name,
      date,
      time: formatTime(hour, minute),
      coordinates: { lat: place.lat, lng: place.lng },
      budget,
    });
  };

  const openCreateModal = (place: Place) => setScheduleTarget({ mode: "create", place });

  const openEditModal = (item: ItineraryItem) => {
    const place = places.find((p) => p.id === item.placeId) ?? fallbackDisplay(item.name);
    setScheduleTarget({ mode: "edit", place, item });
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    setPressingId(null);
  };

  // Search result / trend-sheet selection adapter target: both land here as
  // an already-normalized Place, get merged into the map's place list, and
  // immediately become schedulable like any seeded/trend marker.
  const handlePlaceDiscovered = (place: Place) => {
    addPlaces([place]);
    showToast(`${place.name} added to map`);
  };

  const handleOptimizeRoute = () => {
    const optimized = optimizeRoute(activeDate);
    showToast(optimized ? "동선이 최적화되었습니다" : "Need at least 3 stops to optimize");
  };

  // ── slot hit-testing (multi-day grid, keyed by "date|hour") ──
  const registerSlotRef = useCallback((date: string, hour: number, el: HTMLDivElement | null) => {
    slotRefs.current[`${date}|${hour}`] = el;
  }, []);

  const slotUnder = (cx: number, cy: number): { date: string; hour: number } | null => {
    for (const [key, el] of Object.entries(slotRefs.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
        const [date, hourStr] = key.split("|");
        return { date, hour: Number(hourStr) };
      }
    }
    return null;
  };

  const startDrag = (place: Place, clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag({ place, x: clientX - rect.left, y: clientY - rect.top });

    const move = (ev: PointerEvent) => {
      const r = boardRef.current!.getBoundingClientRect();
      setDrag((d) => (d ? { ...d, x: ev.clientX - r.left, y: ev.clientY - r.top } : d));
      setHoverSlot(slotUnder(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const dropped = slotUnder(ev.clientX, ev.clientY);
      if (dropped) {
        if (isHourTaken(dropped.date, dropped.hour)) showToast(`${pad2(dropped.hour)}:00 is already booked`);
        else {
          registerAt(place, dropped.date, dropped.hour, 0);
          showToast(`${place.name} · ${formatDateLabelShort(dropped.date)} ${pad2(dropped.hour)}:00`);
        }
      }
      setDrag(null);
      setHoverSlot(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── marker press handlers (click vs long-press-drag) ──
  const onDown = (place: Place, e: React.PointerEvent) => {
    e.preventDefault();
    firedLong.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    last.current = { x: e.clientX, y: e.clientY };
    setPressingId(place.id);
    pressTimer.current = setTimeout(() => {
      firedLong.current = true;
      setPressingId(null);
      setSheetOpen(false);
      startDrag(place, last.current.x, last.current.y);
    }, 500);
  };
  const onUp = (place: Place) => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      setPressingId(null);
      if (!firedLong.current) openCreateModal(place);
      setSheetOpen(false);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    last.current = { x: e.clientX, y: e.clientY };
    if (!startPos.current || firedLong.current) return;
    if (Math.hypot(e.clientX - startPos.current.x, e.clientY - startPos.current.y) > 8) cancelPress();
  };

  useEffect(() => () => cancelPress(), []);

  // ── dnd-kit: reordering already-scheduled items across the grid ──
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleGridDragEnd = (event: DragEndEvent) => {
    setGridDragItemId(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id).replace(/^sched-/, "");
    const data = over.data.current as { date: string; hour: number } | undefined;
    if (!data) return;
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    if (item.date === data.date && hourFromTime(item.time) === data.hour) return;

    const occupant = items.find((i) => i.id !== itemId && i.date === data.date && hourFromTime(i.time) === data.hour);
    moveItem(itemId, data.date, data.hour);
    showToast(occupant ? "일정이 서로 교체되었습니다" : `${item.name} · ${formatDateLabelShort(data.date)} ${pad2(data.hour)}:00`);
  };

  const dragItem = gridDragItemId ? items.find((i) => i.id === gridDragItemId) ?? null : null;
  const dragItemPlace = dragItem ? places.find((p) => p.id === dragItem.placeId) ?? fallbackDisplay(dragItem.name) : null;

  const routePoints = schedule
    .map((s) => places.find((p) => p.id === s.placeId))
    .filter((p): p is Place => Boolean(p))
    .map((p) => ({ lat: p.lat, lng: p.lng }));

  // Frozen at first paint — after that, every viewport change goes through
  // fitBounds (below) instead of fighting the imperative map with a
  // reactive center/zoom prop.
  const [mapCenter] = useState(() =>
    places.length === 0
      ? { lat: 33.5904, lng: 130.4017 } // Fukuoka
      : {
          lat: places.reduce((sum, p) => sum + p.lat, 0) / places.length,
          lng: places.reduce((sum, p) => sum + p.lng, 0) / places.length,
        },
  );

  const fitToPlaces = useCallback((map: google.maps.Map, list: Place[]) => {
    if (list.length === 0) return;
    if (list.length === 1) {
      map.panTo({ lat: list[0].lat, lng: list[0].lng });
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    list.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 56);
  }, []);

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      fitToPlaces(map, places);
    },
    [fitToPlaces, places],
  );

  // Smart zoom: every time a place is added — via search, the trend sheet,
  // or scheduling — re-fit the viewport so the whole spread (down to the
  // neighborhood/nearby-area level) stays visible, instead of leaving the
  // camera parked wherever it happened to be.
  useEffect(() => {
    if (!mapRef.current) return;
    fitToPlaces(mapRef.current, places);
  }, [places, fitToPlaces]);

  const shiftWindow = (days: number) => setActiveDate(shiftISODate(activeDate, days));

  return (
    <DndContext sensors={dndSensors} onDragStart={(e) => setGridDragItemId(String(e.active.id).replace(/^sched-/, ""))} onDragEnd={handleGridDragEnd} onDragCancel={() => setGridDragItemId(null)}>
      <div ref={boardRef} className="relative flex h-full flex-col overflow-hidden bg-white font-sans">
        {/* ── MAP AREA — real Google Maps, auto-fit to every visible place ── */}
        <div className="relative h-[45%] shrink-0 overflow-hidden bg-[#eef2f4]">
          <div className="absolute inset-x-3 top-3 z-20 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <PlacesSearchInput onSelect={handlePlaceDiscovered} />
            </div>
            <button
              onClick={() => clearDate(activeDate)}
              aria-label="Clear today's schedule"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <Trash2 size={15} />
            </button>
          </div>

          <TrendSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            onDown={onDown}
            onUp={onUp}
            onMove={onMove}
            onCancel={cancelPress}
            pressingId={pressingId}
            onTrendsLoaded={addPlaces}
          />

          {mapsError ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
              Failed to load Google Maps.
            </div>
          ) : !mapsLoaded ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading map…</div>
          ) : (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={mapCenter}
              zoom={11}
              onLoad={onMapLoad}
              options={{ disableDefaultUI: true, zoomControl: true }}
            >
              {routePoints.length >= 2 && (
                <Polyline
                  path={routePoints}
                  options={{
                    strokeOpacity: 0,
                    icons: [
                      {
                        icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#111827", scale: 3 },
                        offset: "0",
                        repeat: "14px",
                      },
                    ],
                  }}
                />
              )}

              {places.map((p) => (
                <OverlayView key={p.id} position={{ lat: p.lat, lng: p.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
                  <MarkerContent
                    place={p}
                    order={orderByPlace[p.id]}
                    pressing={pressingId === p.id}
                    hidden={drag?.place.id === p.id}
                    onDown={onDown}
                    onUp={onUp}
                    onMove={onMove}
                    onCancel={cancelPress}
                  />
                </OverlayView>
              ))}
            </GoogleMap>
          )}
        </div>

        {/* ── TIMELINE AREA — Notion-style 00:00–23:00 × 3-day grid, drag to reschedule ── */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-slate-200 bg-white">
          <div className="flex items-center justify-between px-5 pb-2 pt-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900">
                <Clock size={12} color="white" />
              </span>
              <span className="text-[13px] font-semibold text-slate-900">Plan</span>
              {totalBudget > 0 && (
                <Badge className="gap-1 rounded-full border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700 hover:bg-emerald-50">
                  <Wallet size={11} />
                  ¥{totalBudget.toLocaleString()}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => shiftWindow(-1)}
                aria-label="Previous day"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                onClick={() => shiftWindow(1)}
                aria-label="Next day"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <ChevronRight size={13} />
              </button>
              <button
                onClick={handleOptimizeRoute}
                disabled={schedule.length < 3}
                className="group relative ml-1 inline-flex items-center gap-1.5 rounded-full p-[1.5px] text-[11px] font-semibold shadow-sm transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none"
                style={{ background: "linear-gradient(120deg,#FF6B6B,#F5A524,#4A90E2)" }}
              >
                <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-slate-800 transition-colors group-hover:bg-transparent group-hover:text-white">
                  <Sparkles size={12} />
                  동선 최적화
                </span>
              </button>
            </div>
          </div>

          {/* day-column headers */}
          <div className="flex border-b border-slate-100 px-4">
            <div className="w-[42px] shrink-0" />
            {visibleDates.map((date) => {
              const count = scheduleByDate[date]?.length ?? 0;
              const isFirst = date === activeDate;
              return (
                <button
                  key={date}
                  onClick={() => setActiveDate(date)}
                  className="min-w-0 flex-1 px-1 pb-2 text-center"
                >
                  <div className={`text-[12px] font-semibold ${isFirst ? "text-slate-900" : "text-slate-500"}`}>
                    {formatDateLabelShort(date)}
                  </div>
                  <div className="text-[10px] text-slate-400 tabular-nums">{count} stop{count === 1 ? "" : "s"}</div>
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <div className="flex" style={{ height: TIMELINE_HOURS.length * SLOT_HEIGHT }}>
              {/* hour gutter */}
              <div className="w-[42px] shrink-0">
                {TIMELINE_HOURS.map((h) => (
                  <div key={h} className="flex items-start justify-end pr-2 pt-0.5 text-[10.5px] font-semibold tabular-nums text-slate-400" style={{ height: SLOT_HEIGHT }}>
                    {pad2(h)}:00
                  </div>
                ))}
              </div>

              {/* day columns */}
              {visibleDates.map((date) => (
                <div key={date} className="relative min-w-0 flex-1 border-l border-slate-100">
                  {TIMELINE_HOURS.map((h) => {
                    const item = scheduleByDate[date]?.find((s) => hourFromTime(s.time) === h);
                    const place = item ? places.find((p) => p.id === item.placeId) ?? null : null;
                    const display = item ? place ?? fallbackDisplay(item.name) : null;
                    const highlighted = hoverSlot?.date === date && hoverSlot?.hour === h;
                    const transit = !item ? transitByDate[date]?.[h] : undefined;
                    const order = item ? orderByDate[date]?.[item.placeId] : undefined;

                    return (
                      <DroppableCell key={h} date={date} hour={h} highlighted={highlighted} registerRef={registerSlotRef}>
                        {display && item ? (
                          <ScheduledCard item={item} display={display} order={order} onOpenEdit={openEditModal} onRemove={removeItem} />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            {highlighted ? (
                              <span className="text-[10.5px] font-semibold text-[#FF6B6B]">Drop here</span>
                            ) : transit ? (
                              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-medium text-slate-500">
                                {transit.mode === "walk" ? <Footprints size={9} /> : <TrainFront size={9} />}
                                {transit.minutes}분
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-200">—</span>
                            )}
                          </div>
                        )}
                      </DroppableCell>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* drag ghost (map marker → slot) */}
        <AnimatePresence>
          {drag && (
            <motion.div
              className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full drop-shadow-2xl"
              style={{ left: drag.x, top: drag.y }}
              initial={{ scale: 1 }}
              animate={{ scale: 1.15 }}
            >
              <Pin place={drag.place} solid />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── schedule modal (create new stop, or edit an existing one) ── */}
        {scheduleTarget && (
          <ScheduleModal
            place={scheduleTarget.place}
            initialDate={scheduleTarget.mode === "edit" ? scheduleTarget.item.date : activeDate}
            initialHour={scheduleTarget.mode === "edit" ? hourFromTime(scheduleTarget.item.time) : undefined}
            initialMinute={scheduleTarget.mode === "edit" ? Number(scheduleTarget.item.time.split(":")[1]) : 0}
            mode={scheduleTarget.mode}
            showBudget
            initialBudget={scheduleTarget.mode === "edit" ? scheduleTarget.item.budget : undefined}
            isHourTaken={(date, hour) => {
              if (scheduleTarget.mode === "edit" && scheduleTarget.item.date === date && hourFromTime(scheduleTarget.item.time) === hour) {
                return false;
              }
              return isHourTaken(date, hour);
            }}
            onClose={() => setScheduleTarget(null)}
            onConfirm={(date, hour, minute, budget) => {
              if (scheduleTarget.mode === "create") {
                registerAt(scheduleTarget.place, date, hour, minute, budget);
              } else {
                moveItem(scheduleTarget.item.id, date, hour, minute, budget);
              }
              showToast(`${scheduleTarget.place.name} · ${formatDateLabelShort(date)} ${pad2(hour)}:${pad2(minute)}`);
              setScheduleTarget(null);
            }}
            onDelete={
              scheduleTarget.mode === "edit"
                ? () => {
                    removeItem(scheduleTarget.item.id);
                    setScheduleTarget(null);
                  }
                : undefined
            }
          />
        )}

        {/* toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 10, x: "-50%" }}
              className="fixed bottom-6 left-1/2 z-[60] rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <DragOverlay>
        {dragItem && dragItemPlace ? (
          <div
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 shadow-xl"
            style={{ background: `${dragItemPlace.color}F2`, width: 168 }}
          >
            <PlaceGlyph icon={dragItemPlace.icon} size={14} color="white" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">{dragItemPlace.name}</p>
              <p className="text-[10px] tabular-nums text-white/80">{dragItem.time}</p>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function fallbackDisplay(name: string): Place {
  const { color, icon } = styleForCategory("Place");
  return { id: "", placeId: "", name, category: "", color, lat: 0, lng: 0, icon };
}

// ── a single droppable hour cell within a day column ──
interface DroppableCellProps {
  date: string;
  hour: number;
  highlighted: boolean;
  registerRef: (date: string, hour: number, el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}

function DroppableCell({ date, hour, highlighted, registerRef, children }: DroppableCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${date}-${hour}`, data: { date, hour } });
  const showHighlight = highlighted || isOver;
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        registerRef(date, hour, el);
      }}
      className={`mx-0.5 my-0.5 rounded-lg transition-all ${
        showHighlight ? "border border-dashed border-[#FF6B6B] bg-[#FF6B6B]/10" : "border border-dashed border-transparent"
      }`}
      style={{ height: SLOT_HEIGHT - 4 }}
    >
      {children}
    </div>
  );
}

// ── a scheduled stop, draggable to any other slot/day; click to edit ──
interface ScheduledCardProps {
  item: ItineraryItem;
  display: Place;
  order: number | undefined;
  onOpenEdit: (item: ItineraryItem) => void;
  onRemove: (id: string) => void;
}

function ScheduledCard({ item, display, order, onOpenEdit, onRemove }: ScheduledCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `sched-${item.id}`,
    data: { itemId: item.id },
  });

  return (
    <motion.div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpenEdit(item)}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: isDragging ? 0.3 : 1, scale: 1 }}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        background: `${display.color}12`,
        border: `1px solid ${display.color}40`,
        touchAction: "none",
      }}
      className="relative flex h-full cursor-pointer items-center overflow-hidden rounded-lg"
    >
      <span className="self-stretch" style={{ width: 4, background: display.color }} />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: display.color }}>
          <PlaceGlyph icon={display.icon} size={10} color="white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight text-slate-900">{display.name}</p>
          <p className="truncate text-[9.5px] tabular-nums leading-tight text-slate-500">{item.time}</p>
        </div>
        {order != null && (
          <span
            className="shrink-0 rounded-full px-1.5 text-[9px] font-semibold leading-4 text-white"
            style={{ background: display.color }}
          >
            #{order}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-white/70"
          aria-label="Remove"
        >
          <X size={9} color="#94a3b8" />
        </button>
      </div>
    </motion.div>
  );
}

interface MarkerContentProps {
  place: Place;
  order?: number;
  pressing: boolean;
  hidden: boolean;
  onDown: (place: Place, e: React.PointerEvent) => void;
  onUp: (place: Place) => void;
  onMove: (e: React.PointerEvent) => void;
  onCancel: () => void;
}

// Rendered inside an <OverlayView>, which already anchors its wrapper div
// at the marker's projected lat/lng pixel (top-left) — the translate here
// shifts that to a bottom-center pin anchor, same convention as the main
// app's GoogleMapEngine.
function MarkerContent({ place, order, pressing, hidden, onDown, onUp, onMove, onCancel }: MarkerContentProps) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-full touch-none select-none"
      style={{ left: 0, top: 0, opacity: hidden ? 0 : 1 }}
    >
      <motion.div
        onPointerDown={(e) => onDown(place, e)}
        onPointerUp={() => onUp(place)}
        onPointerMove={onMove}
        onPointerCancel={onCancel}
        animate={{ scale: pressing ? 1.12 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
        className="relative cursor-pointer"
      >
        {pressing && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute left-1/2 top-3.5 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{ borderColor: place.color }}
          />
        )}
        <div className="drop-shadow-lg">
          <Pin place={place} />
        </div>
        {order && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[11px] font-bold text-white">
            {order}
          </span>
        )}
      </motion.div>
      <div className="absolute left-1/2 top-[46px] -translate-x-1/2 whitespace-nowrap">
        <span className="rounded-full border border-slate-200/70 bg-white/95 px-2 py-px text-[10px] font-medium text-slate-700 shadow-sm">
          {place.name}
        </span>
      </div>
    </div>
  );
}

// ── teardrop pin ──
function Pin({ place, solid = false }: { place: Place; solid?: boolean }) {
  return (
    <div className="relative">
      <svg width={40} height={52} viewBox="0 0 40 52">
        <path
          d="M20 2c9.9 0 18 7.8 18 17.5 0 12.6-14.7 26-16.7 27.7a2 2 0 0 1-2.6 0C16.7 45.5 2 32.1 2 19.5 2 9.8 10.1 2 20 2z"
          fill={place.color}
          stroke="white"
          strokeWidth={2.5}
          opacity={solid ? 1 : 0.95}
        />
        <circle cx={20} cy={19} r={11} fill="white" />
      </svg>
      <span className="absolute left-1/2 top-[9px] -translate-x-1/2">
        <PlaceGlyph icon={place.icon} size={16} color={place.color} />
      </span>
    </div>
  );
}
