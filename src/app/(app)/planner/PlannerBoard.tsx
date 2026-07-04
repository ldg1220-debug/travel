"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
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
import { Clock, X, Wallet, Sparkles, Trash2, Footprints, TrainFront, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useItineraryStore } from "@/store/itineraryStore";
import { MapProvider, useGoogleMapsStatus } from "./MapProvider";
import { PlaceGlyph } from "./icons";
import { Pin } from "./MapMarkers";
import { PlacesSearchInput } from "./PlacesSearchInput";
import { PlaceSearchPanel } from "./PlaceSearchPanel";
import { TrendSheet } from "./TrendSheet";
import { PlaceDetailOverlay } from "./PlaceDetailOverlay";
import { ScheduleModal } from "@/components/ScheduleModal";
import {
  pad2,
  formatTime,
  hourFromTime,
  minutesFromTime,
  rangesOverlap,
  formatDateLabelShort,
  dateWindow,
  shiftISODate,
  TIMELINE_HOURS,
  SLOT_HEIGHT,
  VISIBLE_DAYS,
  DAY_MINUTES,
  MIN_DURATION_MINUTES,
  RESIZE_STEP_MINUTES,
} from "@/lib/timeline";
import { styleForCategory } from "@/lib/placeStyle";
import { calculateTransits, type TransitBlock } from "@/lib/transit";
import { fetchSharedItinerary, pushSharedItinerary } from "@/lib/api";
import type { ItineraryItem, Place } from "@/lib/types";
import type { ClickedPlaceState, MapClickInfo } from "./PlannerGoogleMap";

// Always client-only: the Maps SDK/canvas must never be part of the
// server-rendered (or hydration-replayed) HTML — see PlannerGoogleMap.tsx.
const PlannerGoogleMap = dynamic(() => import("./PlannerGoogleMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">지도 불러오는 중…</div>,
});

interface PlannerBoardProps {
  /** Set when viewing /planner/[shareToken] — enables collaborative polling sync. */
  shareToken?: string;
}

const PLANNER_TABS = [
  { key: "schedule", label: "일정" },
  { key: "saved", label: "관심 장소" },
] as const;
type PlannerTabKey = (typeof PLANNER_TABS)[number]["key"];

type ScheduleTarget =
  | { mode: "create"; place: Place }
  | { mode: "edit"; place: Place; item: ItineraryItem };

// ─────────────────────────────────────────────────────────────
export function PlannerBoard({ shareToken }: PlannerBoardProps) {
  return (
    // useSearchParams() (for the /discover -> ?openDetail=... handoff)
    // requires a Suspense boundary so Next.js can still statically render
    // everything around it.
    <Suspense fallback={null}>
      <MapProvider>
        <PlannerBoardInner shareToken={shareToken} />
      </MapProvider>
    </Suspense>
  );
}

function PlannerBoardInner({ shareToken }: PlannerBoardProps) {
  const { isLoaded: mapsLoaded, loadError: mapsError } = useGoogleMapsStatus();
  // Bounding-box reference for the drag-ghost's absolute x/y — only ever
  // read inside event handlers (never during render), so a plain ref is
  // fine here (no ref-callback/state dance needed).
  const boardRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mapRef = useRef<google.maps.Map | null>(null);
  // See handlePlaceDiscovered below — set right before an explicit pan/zoom
  // so the next "smart zoom" effect run (triggered by that same places
  // update) skips its own fitBounds instead of immediately undoing it.
  const skipNextFitRef = useRef(false);

  // Places to schedule + the single global itinerary come straight from
  // Zustand (src/store/itineraryStore.ts) — no local/hardcoded data here.
  const places = useItineraryStore((s) => s.places);
  const activeDate = useItineraryStore((s) => s.activeDate);
  const setActiveDate = useItineraryStore((s) => s.setActiveDate);
  const items = useItineraryStore((s) => s.items);
  const isHourTaken = useItineraryStore((s) => s.isHourTaken);
  const addItem = useItineraryStore((s) => s.addItem);
  const moveItem = useItineraryStore((s) => s.moveItem);
  const resizeItem = useItineraryStore((s) => s.resizeItem);
  const removeItem = useItineraryStore((s) => s.removeItem);
  const clearDate = useItineraryStore((s) => s.clearDate);
  const addPlaces = useItineraryStore((s) => s.addPlaces);
  const optimizeRoute = useItineraryStore((s) => s.optimizeRoute);
  const region = useItineraryStore((s) => s.region);
  const setRegion = useItineraryStore((s) => s.setRegion);
  const setItems = useItineraryStore((s) => s.setItems);
  const savedPlaces = useItineraryStore((s) => s.savedPlaces);
  const removeSavedPlace = useItineraryStore((s) => s.removeSavedPlace);
  const upsertSavedPlace = useItineraryStore((s) => s.upsertSavedPlace);

  // 일정(schedule) vs 관심 장소(saved) — governs both the lower panel's
  // content and which marker set the map above it renders.
  const [tab, setTab] = useState<PlannerTabKey>("schedule");
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  // Map click-to-save: any coordinate or POI tap on the map opens this
  // popup — the ref (not the popup state itself) lets the async Places
  // lookup below ignore a stale response if the user clicks elsewhere
  // before it resolves.
  const [clickedPlace, setClickedPlace] = useState<ClickedPlaceState | null>(null);
  const clickedPlaceIdRef = useRef<string | null>(null);

  // "딥 다이브" detail overlay — opened from a saved-list row, a search
  // selection, or a trend card tap while on the 관심 장소 tab.
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);

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
  // Tracks the last payload we ourselves applied/pushed, so an echoed poll
  // response doesn't bounce back into another push (which would just be a
  // no-op, but the guard keeps the subscriber from re-triggering constantly).
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

    // A collaborator's local `places` catalog may not have every place the
    // trip's items reference (e.g. the owner found it via search on their
    // own session) — synthesize a minimal marker so it's still visible.
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

  const searchParams = useSearchParams();
  const openDetailId = searchParams.get("openDetail");

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
  //
  // A single search-discovered place needs the map to pan/zoom straight to
  // it, not the generic "smart zoom" fitBounds below — that fits every
  // *existing* marker too, so searching for a place in a totally different
  // city/country than whatever's already on the map (e.g. the Fukuoka/
  // Yufuin seed data) zoomed out far enough to fit both, looking like a
  // country-level view instead of landing on the place just searched for.
  // skipNextFitRef tells the smart-zoom effect below to skip its own
  // fitBounds this one time, so this explicit pan/zoom isn't immediately
  // overridden once `places` updates and that effect re-runs.
  const handlePlaceDiscovered = (place: Place) => {
    addPlaces([place]);
    showToast(`${place.name} added to map`);
    skipNextFitRef.current = true;
    mapRef.current?.panTo({ lat: place.lat, lng: place.lng });
    mapRef.current?.setZoom(15);
  };

  const panToSavedPlace = (place: Place) => {
    setSelectedSavedId(place.id);
    mapRef.current?.panTo({ lat: place.lat, lng: place.lng });
    mapRef.current?.setZoom(15);
  };

  // Single entry point for "open the detail overlay for this place" —
  // every trigger (관심 장소 search, saved-list row, trend card tap, the
  // /discover -> ?openDetail handoff) goes through this so the main map
  // is always panned/zoomed to match, not just whichever trigger happened
  // to also call panToSavedPlace before.
  const openDetailFor = (place: Place) => {
    setDetailPlace(place);
    panToSavedPlace(place);
  };

  // ── /discover -> /planner?openDetail={placeId} handoff ──
  // /discover pushes the clicked spot into `places` (via addPlaces) before
  // navigating here, so it's already findable by id; no second map
  // provider or API round-trip needed on the /discover side.
  useEffect(() => {
    if (!openDetailId) return;
    const found = places.find((p) => p.id === openDetailId) ?? savedPlaces.find((p) => p.id === openDetailId);
    if (found) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- genuinely syncing from an external system (the URL), not state derivable during render; the URL cleanup right below is itself only valid in an effect
      setTab("saved");
      openDetailFor(found);
    }
    // Plain history.replaceState rather than router.replace() — this is a
    // display-only cleanup (no new RSC payload/content needed for the same
    // page), and router.replace() was observed to not actually update the
    // visible URL for a search-param-only change to the current route.
    window.history.replaceState(null, "", "/planner");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per incoming openDetailId, not on every places/savedPlaces update
  }, [openDetailId]);

  // 관심 장소 tab's search — a selection opens the detail overlay (mini
  // map + category/memo edit) rather than saving immediately; the actual
  // savedPlaces write happens on the overlay's own "저장하기" button.
  const handleSavedPlaceDiscovered = (place: Place) => {
    openDetailFor(place);
  };

  const handleSaveDetailPlace = (place: Place) => {
    upsertSavedPlace(place);
    showToast(`${place.name} 저장됨`);
    setDetailPlace(null);
  };

  // Map click-to-save: a POI icon click carries a placeId (looked up via
  // PlacesService for its real name); a bare coordinate click has neither,
  // so it just gets a generic label. Either way, opens the popup for the
  // user to confirm before it actually lands in 관심 장소.
  const handleMapClick = (info: MapClickInfo) => {
    if (info.placeId && mapRef.current) {
      clickedPlaceIdRef.current = info.placeId;
      setClickedPlace({ lat: info.lat, lng: info.lng, name: "불러오는 중…", loading: true });
      const service = new google.maps.places.PlacesService(mapRef.current);
      service.getDetails({ placeId: info.placeId, fields: ["name"] }, (result, status) => {
        // Ignore a response that arrives after the user's already clicked
        // somewhere else (or closed the popup).
        if (clickedPlaceIdRef.current !== info.placeId) return;
        const name = status === google.maps.places.PlacesServiceStatus.OK ? (result?.name ?? "선택한 위치") : "선택한 위치";
        setClickedPlace({ lat: info.lat, lng: info.lng, name, loading: false });
      });
    } else {
      clickedPlaceIdRef.current = null;
      setClickedPlace({ lat: info.lat, lng: info.lng, name: "선택한 위치", loading: false });
    }
  };

  const handleSaveClickedPlace = () => {
    if (!clickedPlace) return;
    const { color, icon } = styleForCategory("Place");
    const idSuffix = `${clickedPlace.lat.toFixed(5)},${clickedPlace.lng.toFixed(5)}`;
    const place: Place = {
      id: clickedPlaceIdRef.current ?? `map-click-${idSuffix}`,
      placeId: clickedPlaceIdRef.current ?? `map-click-${idSuffix}`,
      name: clickedPlace.name,
      category: "Place",
      color,
      icon,
      lat: clickedPlace.lat,
      lng: clickedPlace.lng,
    };
    upsertSavedPlace(place);
    showToast(`${place.name} 관심 장소에 저장됨`);
    setClickedPlace(null);
  };

  // "관심 장소 -> 일정" — closes the detail overlay and opens the same
  // ScheduleModal used everywhere else, instead of silently auto-filling
  // the next free hour, so this path stays consistent with "no more
  // silent auto-add."
  const handleScheduleFromDetail = (place: Place) => {
    setDetailPlace(null);
    setTab("schedule");
    openCreateModal(place);
  };

  const handleOptimizeRoute = () => {
    const optimized = optimizeRoute(activeDate);
    showToast(optimized ? "동선이 최적화되었습니다" : "최적화하려면 3개 이상의 장소가 필요해요");
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
      // Safe to dismiss the trend sheet here (if the press started on a
      // card) — drag tracking is already bound to window-level listeners
      // at this point, not to the card element, so closing the sheet out
      // from under the pointer can't cause the drag to lose its target.
      setSheetOpen(false);
      startDrag(place, last.current.x, last.current.y);
    }, 500);
  };
  const onUp = (place: Place) => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      setPressingId(null);
      if (!firedLong.current) {
        // Map pins only reach onUp on the 일정 tab (their OverlayView is
        // tab-gated below), so this branch only matters for TrendSheet
        // cards, which are shown on both tabs.
        if (tab === "saved") openDetailFor(place);
        else openCreateModal(place);
      }
      // Close after the click/no-click decision is made, not before —
      // closing on pointerdown would shift the sheet's cards mid-tap and
      // the pointerup could land on the wrong element (or the backdrop).
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

  const selectedSavedPlace = selectedSavedId ? savedPlaces.find((p) => p.id === selectedSavedId) ?? null : null;

  // Whichever list the current tab is actually showing markers for — the
  // map's smart-zoom (below) fits to this, not always `places`, so
  // switching tabs re-frames the camera to what's actually visible.
  const visibleMarkerPlaces = tab === "schedule" ? places : savedPlaces;

  // Frozen at first paint — after that, every viewport change goes through
  // fitBounds (below) instead of fighting the imperative map with a
  // reactive center/zoom prop.
  const [mapCenter] = useState(() =>
    visibleMarkerPlaces.length === 0
      ? { lat: 33.5904, lng: 130.4017 } // Fukuoka
      : {
          lat: visibleMarkerPlaces.reduce((sum, p) => sum + p.lat, 0) / visibleMarkerPlaces.length,
          lng: visibleMarkerPlaces.reduce((sum, p) => sum + p.lng, 0) / visibleMarkerPlaces.length,
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
      fitToPlaces(map, visibleMarkerPlaces);
    },
    [fitToPlaces, visibleMarkerPlaces],
  );

  // Smart zoom: every time the visible marker set changes — via search,
  // the trend sheet, scheduling, or switching tabs — re-fit the viewport
  // so the whole spread stays visible, instead of leaving the camera
  // parked wherever it happened to be.
  useEffect(() => {
    if (!mapRef.current) return;
    if (skipNextFitRef.current) {
      skipNextFitRef.current = false;
      return;
    }
    fitToPlaces(mapRef.current, visibleMarkerPlaces);
  }, [visibleMarkerPlaces, fitToPlaces]);

  const shiftWindow = (days: number) => setActiveDate(shiftISODate(activeDate, days));

  return (
    <DndContext
      sensors={dndSensors}
      onDragStart={(e) => setGridDragItemId(String(e.active.id).replace(/^sched-/, ""))}
      onDragEnd={handleGridDragEnd}
      onDragCancel={() => setGridDragItemId(null)}
    >
      <div ref={boardRef} className="relative flex h-full flex-col overflow-hidden bg-white font-sans">
        {/* ── MAP AREA — real Google Maps, auto-fit to every visible place ── */}
        {/* min-h is a safety floor: h-[45%] depends on the flex ancestor
            chain resolving before the Maps SDK measures the container (it
            only measures once, on mount) — without a concrete fallback
            size, a layout race could leave the map permanently at 0px. */}
        <div className="relative h-[45%] min-h-[260px] w-full shrink-0 overflow-hidden bg-[#eef2f4]">
          {tab === "schedule" && (
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
          )}

          {/* Available on both tabs — a tap routes to the schedule modal
              or the 딥 다이브 detail overlay depending on `tab` (see onUp
              above); trending spots still merge into the shared `places`
              catalog either way. */}
          <TrendSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            onDown={onDown}
            onUp={onUp}
            onMove={onMove}
            onCancel={cancelPress}
            pressingId={pressingId}
            onTrendsLoaded={addPlaces}
            nearAnchors={schedule.map((s) => s.coordinates)}
          />

          <PlannerGoogleMap
            mapsError={Boolean(mapsError)}
            mapsLoaded={mapsLoaded}
            mapCenter={mapCenter}
            onMapLoad={onMapLoad}
            tab={tab}
            routePoints={routePoints}
            places={places}
            orderByPlace={orderByPlace}
            pressingId={pressingId}
            draggingPlaceId={drag?.place.id ?? null}
            onDown={onDown}
            onUp={onUp}
            onMove={onMove}
            onCancel={cancelPress}
            savedPlaces={savedPlaces}
            selectedSavedPlace={selectedSavedPlace}
            onSelectSaved={setSelectedSavedId}
            onMapClick={handleMapClick}
            clickedPlace={clickedPlace}
            onCloseClickedPlace={() => setClickedPlace(null)}
            onSaveClickedPlace={handleSaveClickedPlace}
          />
        </div>

        {/* ── LOWER PANEL — 일정 timeline vs 관심 장소 search+list ── */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-slate-200 bg-white">
          <div className="px-4 pt-3">
            <div className="inline-flex w-full rounded-2xl bg-slate-100 p-1 shadow-inner">
              {PLANNER_TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`relative z-10 flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                      active ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="plannerTabPill"
                        className="absolute inset-0 -z-10 rounded-xl bg-white shadow-sm"
                        transition={{ type: "spring", stiffness: 500, damping: 34 }}
                      />
                    )}
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === "schedule" ? (
            <>
              <div className="flex items-center justify-between px-5 pb-2 pt-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900">
                    <Clock size={12} color="white" />
                  </span>
                  <span className="text-[13px] font-semibold text-slate-900">일정</span>
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
                    aria-label="이전 날짜"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    onClick={() => shiftWindow(1)}
                    aria-label="다음 날짜"
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
                    <button key={date} onClick={() => setActiveDate(date)} className="min-w-0 flex-1 px-1 pb-2 text-center">
                      <div className={`text-[12px] font-semibold ${isFirst ? "text-slate-900" : "text-slate-500"}`}>
                        {formatDateLabelShort(date)}
                      </div>
                      <div className="text-[10px] text-slate-400 tabular-nums">
                        {count}개 장소
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                <div className="flex" style={{ height: TIMELINE_HOURS.length * SLOT_HEIGHT }}>
                  {/* hour gutter */}
                  <div className="w-[42px] shrink-0">
                    {TIMELINE_HOURS.map((h) => (
                      <div
                        key={h}
                        className="flex items-start justify-end pr-2 pt-0.5 text-[10.5px] font-semibold tabular-nums text-slate-400"
                        style={{ height: SLOT_HEIGHT }}
                      >
                        {pad2(h)}:00
                      </div>
                    ))}
                  </div>

                  {/* day columns — a background grid of hour drop-targets, with
                      variable-height scheduled cards absolute-positioned on
                      top by start-minute/duration instead of one-per-cell */}
                  {visibleDates.map((date) => {
                    const dayItems = scheduleByDate[date] ?? [];
                    const isCovered = (h: number) =>
                      dayItems.some((it) => rangesOverlap(minutesFromTime(it.time), it.durationMinutes, h * 60, 60));

                    return (
                      <div key={date} className="relative min-w-0 flex-1 border-l border-slate-100">
                        {TIMELINE_HOURS.map((h) => {
                          const highlighted = hoverSlot?.date === date && hoverSlot?.hour === h;
                          const covered = isCovered(h);
                          const transit = !covered ? transitByDate[date]?.[h] : undefined;

                          return (
                            <DroppableCell key={h} date={date} hour={h} highlighted={highlighted} registerRef={registerSlotRef}>
                              {highlighted ? (
                                <div className="flex h-full items-center justify-center">
                                  <span className="text-[10.5px] font-semibold text-[#FF6B6B]">Drop here</span>
                                </div>
                              ) : !covered ? (
                                <div className="flex h-full items-center justify-center">
                                  {transit ? (
                                    <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-medium text-slate-500">
                                      {transit.mode === "walk" ? <Footprints size={9} /> : <TrainFront size={9} />}
                                      {transit.minutes}분
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium text-slate-200">—</span>
                                  )}
                                </div>
                              ) : null}
                            </DroppableCell>
                          );
                        })}

                        {dayItems.map((item, index) => {
                          const place = places.find((p) => p.id === item.placeId) ?? null;
                          const display = place ?? fallbackDisplay(item.name);
                          const order = orderByDate[date]?.[item.placeId];
                          const startMinutes = minutesFromTime(item.time);
                          const nextItem = dayItems[index + 1];
                          const maxDurationMinutes = (nextItem ? minutesFromTime(nextItem.time) : DAY_MINUTES) - startMinutes;

                          return (
                            <div
                              key={item.id}
                              className="pointer-events-none absolute inset-x-0.5 z-10"
                              style={{ top: (startMinutes / 60) * SLOT_HEIGHT }}
                            >
                              <ScheduledCard
                                item={item}
                                display={display}
                                order={order}
                                maxDurationMinutes={maxDurationMinutes}
                                onOpenEdit={openEditModal}
                                onRemove={removeItem}
                                onResize={resizeItem}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 pt-3">
              <PlaceSearchPanel region={region} onRegionChange={setRegion} onSelect={handleSavedPlaceDiscovered} />
              {savedPlaces.length === 0 ? (
                <p className="mt-6 text-center text-[12px] text-slate-400">
                  아직 저장한 장소가 없어요. 위에서 검색해서 담아보세요.
                </p>
              ) : (
                <div className="space-y-2">
                  {savedPlaces.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => openDetailFor(p)}
                      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition-colors ${
                        selectedSavedId === p.id ? "border-slate-900" : "border-slate-200"
                      }`}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: p.color }}
                      >
                        <PlaceGlyph icon={p.icon} size={14} color="white" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-900">{p.name}</p>
                        <p className="truncate text-[10.5px] text-slate-500">{p.memo || p.address || p.category}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          panToSavedPlace(p);
                        }}
                        aria-label={`${p.name} 지도에서 보기`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      >
                        <MapPin size={13} color="#94a3b8" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSavedPlace(p.id);
                          if (selectedSavedId === p.id) setSelectedSavedId(null);
                        }}
                        aria-label={`${p.name} 저장 해제`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      >
                        <X size={12} color="#94a3b8" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
                addPlaces([scheduleTarget.place]);
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

        <PlaceDetailOverlay
          place={detailPlace}
          onClose={() => setDetailPlace(null)}
          onSave={handleSaveDetailPlace}
          onSchedule={handleScheduleFromDetail}
        />
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

// ── a scheduled stop, draggable to any other slot/day; click to edit;
// bottom edge drag-resizes its duration in 15-minute steps ──
interface ScheduledCardProps {
  item: ItineraryItem;
  display: Place;
  order: number | undefined;
  /** How long this stop is allowed to grow to via the resize handle — the gap to the next stop, or to end-of-day if it's the day's last one. */
  maxDurationMinutes: number;
  onOpenEdit: (item: ItineraryItem) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, durationMinutes: number) => void;
}

function ScheduledCard({ item, display, order, maxDurationMinutes, onOpenEdit, onRemove, onResize }: ScheduledCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `sched-${item.id}`,
    data: { itemId: item.id },
  });

  // Live-resize state: the handle tracks pointer movement locally for
  // instant visual feedback and only commits to the store (onResize) on
  // pointerup, instead of dispatching a store update on every pixel moved.
  const [liveDuration, setLiveDuration] = useState<number | null>(null);
  const resizeStartRef = useRef<{ y: number; duration: number } | null>(null);

  const handleResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeStartRef.current = { y: e.clientY, duration: item.durationMinutes };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleResizeMove = (e: React.PointerEvent) => {
    if (!resizeStartRef.current) return;
    const deltaMinutes = ((e.clientY - resizeStartRef.current.y) / SLOT_HEIGHT) * 60;
    const snapped =
      Math.round((resizeStartRef.current.duration + deltaMinutes) / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES;
    setLiveDuration(Math.max(MIN_DURATION_MINUTES, Math.min(maxDurationMinutes, snapped)));
  };
  const handleResizeUp = (e: React.PointerEvent) => {
    if (!resizeStartRef.current) return;
    resizeStartRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setLiveDuration((current) => {
      if (current != null) onResize(item.id, current);
      return null;
    });
  };

  const effectiveDuration = liveDuration ?? item.durationMinutes;
  const height = (Math.max(MIN_DURATION_MINUTES, effectiveDuration) / 60) * SLOT_HEIGHT;

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
        height,
      }}
      className="pointer-events-auto relative flex cursor-pointer items-center overflow-hidden rounded-lg"
    >
      <span className="self-stretch" style={{ width: 4, background: display.color }} />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: display.color }}>
          <PlaceGlyph icon={display.icon} size={10} color="white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight text-slate-900">{display.name}</p>
          <p className="truncate text-[9.5px] tabular-nums leading-tight text-slate-500">
            {item.time} · {effectiveDuration}분
          </p>
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
          aria-label="삭제"
        >
          <X size={9} color="#94a3b8" />
        </button>
      </div>

      {/* bottom-edge resize handle — drag to change this stop's length in 15-minute steps */}
      <div
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        onPointerCancel={handleResizeUp}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize touch-none items-end justify-center"
      >
        <span className="mb-0.5 h-0.5 w-5 rounded-full bg-slate-400/60" />
      </div>
    </motion.div>
  );
}

// Pin/MarkerContent live in ./MapMarkers now — moved out so PlannerGoogleMap.tsx
// (dynamic-imported with ssr:false) doesn't need a circular import back into
// this file.
