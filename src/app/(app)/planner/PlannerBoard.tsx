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
  type DragMoveEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock,
  X,
  Wallet,
  Sparkles,
  Trash2,
  Footprints,
  TrainFront,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Minus,
  Plus,
  Save,
  CalendarDays,
  ImageDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MonthCalendar } from "@/components/MonthCalendar";
import { useItineraryStore, MAX_SAVED_PLANS } from "@/store/itineraryStore";
import { MapProvider, useGoogleMapsStatus } from "./MapProvider";
import { PlaceGlyph } from "./icons";
import { Pin } from "./MapMarkers";
import { PlacesSearchInput } from "./PlacesSearchInput";
import { PlaceSearchPanel } from "./PlaceSearchPanel";
import { TrendSheet } from "./TrendSheet";
import { PlaceDetailOverlay } from "./PlaceDetailOverlay";
import { ScheduleModal } from "@/components/ScheduleModal";
import { SavePlanModal } from "@/components/SavePlanModal";
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
  MIN_VISIBLE_DAYS,
  MAX_VISIBLE_DAYS,
  DAY_MINUTES,
  MIN_DURATION_MINUTES,
  RESIZE_STEP_MINUTES,
} from "@/lib/timeline";
import { styleForCategory } from "@/lib/placeStyle";
import { calculateTransits, type TransitBlock } from "@/lib/transit";
import { fetchSharedItinerary, pushSharedItinerary } from "@/lib/api";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
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

const EMPTY_SCHEDULE: ItineraryItem[] = [];

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
  const currentCity = useItineraryStore((s) => s.currentCity);
  const setActiveDate = useItineraryStore((s) => s.setActiveDate);
  const items = useItineraryStore((s) => s.items);
  const isHourTaken = useItineraryStore((s) => s.isHourTaken);
  const hasConflictStore = useItineraryStore((s) => s.hasConflict);
  const addItem = useItineraryStore((s) => s.addItem);
  const moveItem = useItineraryStore((s) => s.moveItem);
  const resizeItem = useItineraryStore((s) => s.resizeItem);
  const removeItem = useItineraryStore((s) => s.removeItem);
  const clearDate = useItineraryStore((s) => s.clearDate);
  const clearAllItems = useItineraryStore((s) => s.clearAllItems);
  const savedPlans = useItineraryStore((s) => s.savedPlans);
  const savePlanAs = useItineraryStore((s) => s.savePlanAs);
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

  // A place just found via the map's search box, not yet scheduled — shown
  // as a single temporary pin (see scheduleMapPlaces below) so it stays
  // tappable/draggable onto a slot, without permanently cluttering the map
  // with every place ever searched for across the whole session (that's
  // what `places` used to do — see PR history for "맵에 남아있는 스팟포인트").
  const [pendingSearchPlace, setPendingSearchPlace] = useState<Place | null>(null);

  // ── multi-day (Notion-style) timeline window ──
  // Adjustable via the +/- control next to the date nav — clamped to
  // [MIN_VISIBLE_DAYS, MAX_VISIBLE_DAYS] so the grid can't collapse to 0
  // columns or grow wide enough to become unusable.
  const [visibleDays, setVisibleDays] = useState(VISIBLE_DAYS);
  // The visible day-column window used to be anchored directly at
  // `activeDate`, so tapping a day header that wasn't already the leftmost
  // column (e.g. picking 7/12 while viewing 7/11-7/13) reset the whole
  // window to start there instead of just switching which day's route/pins
  // show on the map — the window would jump to 7/12-7/14 and 7/11 would
  // fall out of view. `windowStart` anchors the visible columns instead,
  // changed only by the prev/next chevrons and the month-view jump; a day
  // header click only moves `activeDate` (which day's route is shown),
  // leaving the window itself untouched.
  const [windowStart, setWindowStart] = useState(activeDate);
  const visibleDates = useMemo(() => dateWindow(windowStart, visibleDays), [windowStart, visibleDays]);

  // Month-grid view toggle — the day-column strip only ever shows a few
  // days at once; this swaps it for a full month at a glance (Notion/Google
  // Calendar style), with a dot under any day that already has stops.
  // Tapping a day jumps the strip there and collapses back automatically.
  const [monthViewOpen, setMonthViewOpen] = useState(false);
  const markedDates = useMemo(() => new Set(items.map((i) => i.date)), [items]);

  // Map collapse — the map area normally always eats 45% of the screen;
  // collapsing it (keeping just the search bar visible) hands that space
  // to the schedule list, useful once you're mostly reviewing/editing a
  // plan rather than actively picking new spots off the map.
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const toggleMapCollapsed = () => {
    const wasCollapsed = mapCollapsed;
    setMapCollapsed(!wasCollapsed);
    // Expanding again: the Maps SDK doesn't notice its container resizing
    // back up on its own (see nudgeGoogleMapResize), so force a re-measure
    // once the CSS transition has actually finished — center/zoom are left
    // as they were, no need to re-fit bounds, since collapsing never moved
    // the camera in the first place.
    if (wasCollapsed && mapRef.current) {
      const map = mapRef.current;
      setTimeout(() => nudgeGoogleMapResize(map), 320);
    }
  };

  // "이미지로 저장" — captures the schedule panel (day headers + timeline)
  // as a PNG, Notion-screenshot style, so a plan can be shared/glanced at
  // outside the app without everyone needing to open it here.
  const scheduleCaptureRef = useRef<HTMLDivElement | null>(null);
  // The 24-hour grid lives inside its own scrollable div (only ~4-5 hours
  // fit on screen at once) — html-to-image renders exactly what's laid out,
  // which for an `overflow-y-auto` container is only its clipped viewport,
  // not the full scrolled content. Temporarily lifting that clip for the
  // capture is what makes the exported image show the whole day.
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const [capturing, setCapturing] = useState(false);
  const handleCaptureSchedule = async () => {
    const capture = scheduleCaptureRef.current;
    const scroller = timelineScrollRef.current;
    if (!capture || capturing) return;
    setCapturing(true);

    // Both this panel and its inner scroll area are `flex-1` (flex: 1 1
    // 0%), which is what makes the panel scrollable in the first place —
    // flex-grow/shrink actively resizes them to fit the flex parent
    // regardless of `height`, so `height: auto` alone does nothing. A
    // flex CHILD that overflows its box also doesn't stretch the box to
    // contain it (default `overflow: visible` just lets the overflow
    // paint past the boundary without the parent growing) — so
    // `toPng`, which sizes its output canvas to the target element's own
    // rect, would crop to the small on-screen viewport unless BOTH levels
    // are freed from flex sizing here, not just the inner scroller.
    const targets = [capture, scroller].filter((el): el is HTMLDivElement => el != null);
    const prevStyles = targets.map((el) => ({ flex: el.style.flex, height: el.style.height, overflow: el.style.overflow }));
    try {
      for (const el of targets) {
        el.style.flex = "none";
        el.style.overflow = "visible";
        el.style.height = "auto";
      }
      // Let layout settle before html-to-image measures the DOM.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(capture, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `${currentCity || "일정"}-${activeDate}.png`;
      link.href = dataUrl;
      // Some browsers only honor `download` (i.e. keep the suggested
      // filename instead of falling back to a generic one) when the anchor
      // is actually attached to the document at click time.
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast("이미지 저장에 실패했어요");
    } finally {
      targets.forEach((el, i) => {
        el.style.flex = prevStyles[i].flex;
        el.style.height = prevStyles[i].height;
        el.style.overflow = prevStyles[i].overflow;
      });
      setCapturing(false);
    }
  };

  // 계획 저장 / 비우기 — the toolbar's quick actions for the whole working
  // itinerary (as opposed to clearDate's single-day clear in the map area).
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

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

  // A stable empty-array fallback (module-level, not a fresh literal per
  // render) so `schedule` has a consistent identity when the active date
  // has no items — scheduleMapPlaces (below) depends on it in a useMemo.
  const schedule = scheduleByDate[activeDate] ?? EMPTY_SCHEDULE;
  const orderByPlace = orderByDate[activeDate] ?? {};
  const totalBudget = items.reduce((sum, s) => sum + (s.budget ?? 0), 0);

  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ place: Place; x: number; y: number } | null>(null);
  const [hoverSlot, setHoverSlot] = useState<{ date: string; hour: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gridDragItemId, setGridDragItemId] = useState<string | null>(null);
  // Live-updated (via onDragMove) 15-minute-snapped target of an in-flight
  // grid drag — shown in the drag ghost so the user can actually see which
  // slot they're about to drop into, instead of only finding out after the
  // fact. The hour-cell highlight alone wasn't precise enough to aim by.
  const [dragPreviewSlot, setDragPreviewSlot] = useState<{ date: string; hour: number; minute: number } | null>(null);
  // Whether the current grid drag started with Ctrl/Cmd held — mirrors the
  // check in handleGridDragEnd exactly (both read the drag's original
  // activatorEvent, not a live key state), so the "복제" hint shown while
  // dragging always matches what actually happens on drop.
  const [dragIsDuplicate, setDragIsDuplicate] = useState(false);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLong = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const last = useRef({ x: 0, y: 0 });
  // Set by onDown right before a press starts — lets the shared onUp/drag
  // logic tell a map pin (which, since the P2/P7 map-scoping fix, only ever
  // represents an already-scheduled stop or the one pending search result)
  // apart from a TrendSheet suggestion card (an independent "try adding
  // this" invitation that should stay tap-to-add-again-able until the
  // dedicated duplicate-via-drag feature exists, instead of editing the
  // first occurrence it happens to share an id with).
  const pressSource = useRef<"trend" | "pin">("trend");

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

  const registerAt = (place: Place, date: string, hour: number, minute = 0, budget?: number, durationMinutes?: number) => {
    addItem({
      placeId: place.id,
      name: place.name,
      date,
      time: formatTime(hour, minute),
      coordinates: { lat: place.lat, lng: place.lng },
      budget,
      durationMinutes,
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
    setPendingSearchPlace(place);
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
    const idSuffix = `${clickedPlace.lat.toFixed(5)},${clickedPlace.lng.toFixed(5)}`;
    const id = clickedPlaceIdRef.current ?? `map-click-${idSuffix}`;
    const { color, icon } = styleForCategory("Place", id);
    const place: Place = {
      id,
      placeId: id,
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
          // Dragging a pin that's already on today's schedule reschedules
          // it (moveItem) instead of adding a second stop at the same
          // place — only a brand-new (not-yet-scheduled) pin creates one.
          const existing = pressSource.current === "pin" ? schedule.find((s) => s.placeId === place.id) : undefined;
          if (existing) moveItem(existing.id, dropped.date, dropped.hour);
          else {
            registerAt(place, dropped.date, dropped.hour, 0);
            if (place.id === pendingSearchPlace?.id) setPendingSearchPlace(null);
          }
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
  // TrendSheet cards and map pins share onDown/onUp/startDrag, but only a
  // map pin should be treated as "editing/moving an existing stop" when its
  // id happens to match one already on today's schedule — see pressSource.
  const onTrendDown = (place: Place, e: React.PointerEvent) => {
    pressSource.current = "trend";
    onDown(place, e);
  };
  const onPinDown = (place: Place, e: React.PointerEvent) => {
    pressSource.current = "pin";
    onDown(place, e);
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
        else {
          // A tap on a pin that's already scheduled today opens it for
          // editing instead of silently offering to add a duplicate stop —
          // but only for an actual map pin; a TrendSheet card stays
          // tap-to-add-again-able (see pressSource above).
          const existing = pressSource.current === "pin" ? schedule.find((s) => s.placeId === place.id) : undefined;
          if (existing) openEditModal(existing);
          else openCreateModal(place);
        }
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

  // Shared by the live drag preview (onDragMove, below) and the actual drop
  // (handleGridDragEnd) so what the user sees while dragging always matches
  // what happens when they let go.
  //
  // Sub-hour precision: derive the drop time from the dragged card's
  // absolute top edge against a stable per-day reference (that day column's
  // hour-0 cell), snapped to 15-minute steps — not from an offset against
  // whichever cell dnd-kit's collision detection resolved as `over`. The
  // draggable card and each droppable cell are the same height, so for a
  // sub-cell-height drag the "over" cell can flip to the next hour before
  // the pointer has even cleared the current one; an offset measured
  // against THAT cell then goes negative and clamps to :00, which is
  // exactly why drops used to always snap to the top of an hour regardless
  // of where the ghost visually hovered.
  const computeDropSlot = (
    active: DragEndEvent["active"] | DragMoveEvent["active"],
    over: DragEndEvent["over"] | DragMoveEvent["over"],
  ): { date: string; hour: number; minute: number } | null => {
    if (!over) return null;
    const data = over.data.current as { date: string; hour: number } | undefined;
    if (!data) return null;
    const dayTop = slotRefs.current[`${data.date}|0`]?.getBoundingClientRect().top;
    const activeTop = active.rect.current.translated?.top ?? over.rect.top;
    const totalMinutesFromDayTop = dayTop != null ? ((activeTop - dayTop) / SLOT_HEIGHT) * 60 : data.hour * 60;
    const snappedTotalMinutes = Math.max(
      0,
      Math.min(DAY_MINUTES - RESIZE_STEP_MINUTES, Math.round(totalMinutesFromDayTop / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES),
    );
    return { date: data.date, hour: Math.floor(snappedTotalMinutes / 60), minute: snappedTotalMinutes % 60 };
  };

  const handleGridDragEnd = (event: DragEndEvent) => {
    setGridDragItemId(null);
    setDragPreviewSlot(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id).replace(/^sched-/, "");
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const slot = computeDropSlot(active, over);
    if (!slot) return;
    const { date: dropDate, hour: dropHour, minute: dropMinute } = slot;

    // Ctrl/Cmd-held drag duplicates the stop at the drop slot instead of
    // moving it — e.g. booking the same hotel again for a second night
    // without re-searching it from scratch.
    const activatorEvent = event.activatorEvent as PointerEvent | undefined;
    const isDuplicate = Boolean(activatorEvent?.ctrlKey || activatorEvent?.metaKey);

    if (isDuplicate) {
      addItem({
        placeId: item.placeId,
        name: item.name,
        date: dropDate,
        time: formatTime(dropHour, dropMinute),
        coordinates: item.coordinates,
        budget: item.budget,
        durationMinutes: item.durationMinutes,
      });
      showToast(`${item.name} 복제됨 · ${formatDateLabelShort(dropDate)} ${pad2(dropHour)}:${pad2(dropMinute)}`);
      return;
    }

    if (item.date === dropDate && hourFromTime(item.time) === dropHour && minutesFromTime(item.time) % 60 === dropMinute) return;

    const occupant = items.find(
      (i) =>
        i.id !== itemId &&
        i.date === dropDate &&
        rangesOverlap(minutesFromTime(i.time), i.durationMinutes, dropHour * 60 + dropMinute, item.durationMinutes),
    );
    moveItem(itemId, dropDate, dropHour, dropMinute);
    showToast(
      occupant ? "일정이 서로 교체되었습니다" : `${item.name} · ${formatDateLabelShort(dropDate)} ${pad2(dropHour)}:${pad2(dropMinute)}`,
    );
  };

  const dragItem = gridDragItemId ? items.find((i) => i.id === gridDragItemId) ?? null : null;
  const dragItemPlace = dragItem ? places.find((p) => p.id === dragItem.placeId) ?? fallbackDisplay(dragItem.name) : null;

  const routePoints = schedule
    .map((s) => places.find((p) => p.id === s.placeId))
    .filter((p): p is Place => Boolean(p))
    .map((p) => ({ lat: p.lat, lng: p.lng }));

  // Map pins for the 일정 tab — restricted to today's actually-scheduled
  // stops (plus, if there is one, the single place just found via the map
  // search box but not yet scheduled) instead of the full `places` catalog,
  // which only ever grows across a whole session and used to leave every
  // previously-searched place (even from an unrelated city) permanently
  // pinned on the map. Also naturally limits the pins/route to the active
  // day — switching days shows only that day's stops, not every day at once.
  const scheduleMapPlaces = useMemo(() => {
    const scheduled = schedule
      .map((s) => places.find((p) => p.id === s.placeId) ?? fallbackDisplay(s.name))
      .map((p, i) => ({ ...p, id: schedule[i].placeId }));
    const scheduledIds = new Set(scheduled.map((p) => p.id));
    if (pendingSearchPlace && !scheduledIds.has(pendingSearchPlace.id)) {
      return [...scheduled, pendingSearchPlace];
    }
    return scheduled;
  }, [schedule, places, pendingSearchPlace]);

  const selectedSavedPlace = selectedSavedId ? savedPlaces.find((p) => p.id === selectedSavedId) ?? null : null;

  // Whichever list the current tab is actually showing markers for — the
  // map's smart-zoom (below) fits to this, not always `places`, so
  // switching tabs re-frames the camera to what's actually visible.
  const visibleMarkerPlaces = tab === "schedule" ? scheduleMapPlaces : savedPlaces;

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

  const shiftWindow = (days: number) => {
    const next = shiftISODate(windowStart, days);
    setWindowStart(next);
    setActiveDate(next);
  };

  return (
    <DndContext
      sensors={dndSensors}
      onDragStart={(e) => {
        setGridDragItemId(String(e.active.id).replace(/^sched-/, ""));
        const activatorEvent = e.activatorEvent as PointerEvent | undefined;
        setDragIsDuplicate(Boolean(activatorEvent?.ctrlKey || activatorEvent?.metaKey));
      }}
      onDragMove={(e) => setDragPreviewSlot(computeDropSlot(e.active, e.over))}
      onDragEnd={handleGridDragEnd}
      onDragCancel={() => {
        setGridDragItemId(null);
        setDragPreviewSlot(null);
      }}
    >
      <div ref={boardRef} className="relative flex h-full flex-col overflow-hidden bg-white font-sans">
        {/* ── MAP AREA — real Google Maps, auto-fit to every visible place ── */}
        {/* min-h is a safety floor: h-[45%] depends on the flex ancestor
            chain resolving before the Maps SDK measures the container (it
            only measures once, on mount) — without a concrete fallback
            size, a layout race could leave the map permanently at 0px. */}
        <div
          className={`relative w-full shrink-0 overflow-hidden bg-[#eef2f4] transition-[height] duration-300 ${
            mapCollapsed ? "h-14 min-h-14" : "h-[45%] min-h-[260px]"
          }`}
        >
          {tab === "schedule" && (
            <div className="absolute inset-x-3 top-3 z-20 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <PlacesSearchInput region={region} onSelect={handlePlaceDiscovered} />
              </div>
              <button
                onClick={toggleMapCollapsed}
                aria-label={mapCollapsed ? "지도 펼치기" : "지도 접기"}
                aria-pressed={mapCollapsed}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                {mapCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
              <button
                onClick={() => clearDate(activeDate)}
                aria-label="오늘 일정 비우기"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}

          {/* Collapsed: keep TrendSheet/PlannerGoogleMap mounted (unmounting
              would drop mapRef and re-trigger the whole Maps SDK load) but
              visually hidden, so expanding back just needs a resize nudge
              instead of a full re-init. */}
          <div className={mapCollapsed ? "hidden" : "contents"}>
          {/* Available on both tabs — a tap routes to the schedule modal
              or the 딥 다이브 detail overlay depending on `tab` (see onUp
              above); trending spots still merge into the shared `places`
              catalog either way. */}
          <TrendSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            onDown={onTrendDown}
            onUp={onUp}
            onMove={onMove}
            onCancel={cancelPress}
            pressingId={pressingId}
            nearAnchors={schedule.map((s) => s.coordinates)}
          />

          <PlannerGoogleMap
            mapsError={Boolean(mapsError)}
            mapsLoaded={mapsLoaded}
            mapCenter={mapCenter}
            onMapLoad={onMapLoad}
            tab={tab}
            routePoints={routePoints}
            places={scheduleMapPlaces}
            orderByPlace={orderByPlace}
            pressingId={pressingId}
            draggingPlaceId={drag?.place.id ?? null}
            onDown={onPinDown}
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
              <div className="px-5 pb-2 pt-3">
                <div className="flex items-center justify-between">
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
                      onClick={() => setMonthViewOpen((v) => !v)}
                      aria-label={monthViewOpen ? "월간 달력 접기" : "월간 달력 보기"}
                      aria-pressed={monthViewOpen}
                      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                        monthViewOpen ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <CalendarDays size={13} />
                    </button>
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
                    <div className="ml-1 flex items-center gap-0.5 rounded-full border border-slate-200 px-0.5 py-0.5">
                      <button
                        onClick={() => setVisibleDays((d) => Math.max(MIN_VISIBLE_DAYS, d - 1))}
                        disabled={visibleDays <= MIN_VISIBLE_DAYS}
                        aria-label="보이는 일수 줄이기"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="min-w-[32px] text-center text-[11px] font-semibold tabular-nums text-slate-600">
                        {visibleDays}일
                      </span>
                      <button
                        onClick={() => setVisibleDays((d) => Math.min(MAX_VISIBLE_DAYS, d + 1))}
                        disabled={visibleDays >= MAX_VISIBLE_DAYS}
                        aria-label="보이는 일수 늘리기"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    onClick={() => setSaveModalOpen(true)}
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                  >
                    <Save size={11} />
                    계획 저장
                  </button>
                  <button
                    onClick={handleCaptureSchedule}
                    disabled={capturing || schedule.length === 0}
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ImageDown size={11} />
                    {capturing ? "저장 중…" : "이미지로 저장"}
                  </button>
                  {clearConfirmOpen ? (
                    <div className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1">
                      <span className="text-[11px] font-medium text-rose-600">전체 비울까요?</span>
                      <button
                        onClick={() => {
                          clearAllItems();
                          setClearConfirmOpen(false);
                          showToast("일정을 비웠어요");
                        }}
                        className="text-[11px] font-bold text-rose-600"
                      >
                        확인
                      </button>
                      <button onClick={() => setClearConfirmOpen(false)} className="text-[11px] text-slate-400">
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setClearConfirmOpen(true)}
                      disabled={items.length === 0}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 size={11} />
                      비우기
                    </button>
                  )}
                  <button
                    onClick={handleOptimizeRoute}
                    disabled={schedule.length < 3}
                    className="group relative ml-auto inline-flex items-center gap-1.5 rounded-full p-[1.5px] text-[11px] font-semibold shadow-sm transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none"
                    style={{ background: "linear-gradient(120deg,#FF6B6B,#F5A524,#4A90E2)" }}
                  >
                    <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-slate-800 transition-colors group-hover:bg-transparent group-hover:text-white">
                      <Sparkles size={12} />
                      동선 최적화
                    </span>
                  </button>
                </div>
              </div>

              {monthViewOpen ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-1">
                  <MonthCalendar
                    selected={activeDate}
                    onSelect={(date) => {
                      // Unlike a day-header tap, jumping in from the month
                      // view can land far outside the current window, so
                      // the window has to follow here.
                      setWindowStart(date);
                      setActiveDate(date);
                      setMonthViewOpen(false);
                    }}
                    markedDates={markedDates}
                  />
                </div>
              ) : (
                <div ref={scheduleCaptureRef} className="flex min-h-0 flex-1 flex-col bg-white">
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

              <div ref={timelineScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
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
                </div>
              )}
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
            showDuration
            initialDuration={scheduleTarget.mode === "edit" ? scheduleTarget.item.durationMinutes : undefined}
            isHourTaken={(date, hour) => {
              if (scheduleTarget.mode === "edit" && scheduleTarget.item.date === date && hourFromTime(scheduleTarget.item.time) === hour) {
                return false;
              }
              return isHourTaken(date, hour);
            }}
            hasConflict={(date, startMinutes, durationMinutes) =>
              hasConflictStore(date, startMinutes, durationMinutes, scheduleTarget.mode === "edit" ? scheduleTarget.item.id : undefined)
            }
            onClose={() => setScheduleTarget(null)}
            onConfirm={(date, hour, minute, budget, duration) => {
              if (scheduleTarget.mode === "create") {
                addPlaces([scheduleTarget.place]);
                registerAt(scheduleTarget.place, date, hour, minute, budget, duration);
                if (scheduleTarget.place.id === pendingSearchPlace?.id) setPendingSearchPlace(null);
              } else {
                moveItem(scheduleTarget.item.id, date, hour, minute, budget);
                if (duration != null) resizeItem(scheduleTarget.item.id, duration);
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

        {saveModalOpen && (
          <SavePlanModal
            atCap={savedPlans.length >= MAX_SAVED_PLANS}
            savedPlans={savedPlans}
            onClose={() => setSaveModalOpen(false)}
            onSave={(name, overwriteId) => {
              savePlanAs(name, overwriteId);
              setSaveModalOpen(false);
              showToast(overwriteId ? `"${name}" 덮어썼어요` : `"${name}" 저장됨`);
            }}
          />
        )}
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
              {/* Live 15분 단위 스냅 미리보기 — 시간 칸 하이라이트만으로는
                  정확히 어디에 놓일지 가늠하기 어렵다는 피드백에 따라, 실제
                  드롭 시 계산과 같은 로직으로 지금 이 위치에 놓으면 몇 시
                  몇 분이 될지 드래그 중에도 보여준다. */}
              <p className="text-[10px] tabular-nums text-white/80">
                {dragPreviewSlot ? `${pad2(dragPreviewSlot.hour)}:${pad2(dragPreviewSlot.minute)}` : dragItem.time}
                {dragIsDuplicate && <span className="ml-1 font-semibold text-white">· 복제</span>}
              </p>
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
  // Narrow day columns (3+ day view on a phone) leave so little width that
  // icon + name + badge + delete crammed into one row truncates the name to
  // a single character. 45+ minutes is tall enough for two lines, so give
  // the name its own full-width row and push icon/time/badge/delete to a
  // second, denser row underneath. A 15/30-minute stop is too short for two
  // lines at all (they'd clip/overlap), so those render name+time+duration
  // together on one truncating line instead — see the `roomy ? … : …` below.
  const roomy = effectiveDuration >= 45;

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
      {roomy ? (
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1.5 py-1">
          <p className="truncate text-[11px] font-semibold leading-tight text-slate-900">{display.name}</p>
          <div className="flex min-w-0 items-center gap-1">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md" style={{ background: display.color }}>
              <PlaceGlyph icon={display.icon} size={9} color="white" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[9px] tabular-nums leading-tight text-slate-500">
              {item.time} · {effectiveDuration}분
            </span>
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
        </div>
      ) : (
        // 15/30분짜리 칸은 두 줄을 넣기엔 세로 공간이 부족해 글자가 깨지므로,
        // 이름·시간·소요시간을 한 줄에 이어 붙이고 그 한 줄만 truncate한다.
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md" style={{ background: display.color }}>
            <PlaceGlyph icon={display.icon} size={9} color="white" />
          </span>
          <p className="min-w-0 flex-1 truncate text-[10px] leading-tight text-slate-900">
            <span className="font-semibold">{display.name}</span>{" "}
            <span className="tabular-nums text-slate-500">
              {item.time} · {effectiveDuration}분
            </span>
          </p>
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
      )}

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
