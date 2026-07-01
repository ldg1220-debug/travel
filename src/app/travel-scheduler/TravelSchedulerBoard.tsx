"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { GoogleMap, OverlayView, Polyline } from "@react-google-maps/api";
import { Clock, X, Plus, Wallet, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoginModal } from "@/components/LoginModal";
import { useItineraryStore } from "@/store/itineraryStore";
import { MapProvider, useGoogleMapsStatus } from "./MapProvider";
import { PlaceGlyph } from "./icons";
import { PlacesSearchInput } from "./PlacesSearchInput";
import { TrendSheet } from "./TrendSheet";
import { TIMELINE_HOURS, MINUTE_STEPS, pad2, formatTime, hourFromTime, formatDateLabel } from "@/lib/timeline";
import { styleForCategory } from "@/lib/placeStyle";
import { saveItinerary, fetchSharedItinerary, pushSharedItinerary } from "@/lib/api";
import type { Place } from "@/lib/types";

interface TravelSchedulerBoardProps {
  /** Set when viewing /travel-scheduler/[shareToken] — enables collaborative polling sync. */
  shareToken?: string;
}

// ─────────────────────────────────────────────────────────────
export function TravelSchedulerBoard({ shareToken }: TravelSchedulerBoardProps) {
  return (
    <MapProvider>
      <TravelSchedulerInner shareToken={shareToken} />
    </MapProvider>
  );
}

function TravelSchedulerInner({ shareToken }: TravelSchedulerBoardProps) {
  const { isLoaded: mapsLoaded, loadError: mapsError } = useGoogleMapsStatus();
  const { data: session } = useSession();
  const phoneRef = useRef<HTMLDivElement | null>(null);
  // The Sheet's portal container needs the phone-frame DOM node as a prop,
  // which means it has to come from state (set via a ref callback), not a
  // plain ref read during render.
  const [phoneEl, setPhoneEl] = useState<HTMLDivElement | null>(null);
  const setPhoneNode = useCallback((node: HTMLDivElement | null) => {
    phoneRef.current = node;
    setPhoneEl(node);
  }, []);
  const slotRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Places to schedule + the single global itinerary come straight from
  // Zustand (src/store/itineraryStore.ts) — no local/hardcoded data here.
  // `places` is seeded with mock data until a real API is wired in; `items`
  // is the same store the rest of the app reads and writes.
  const places = useItineraryStore((s) => s.places);
  const region = useItineraryStore((s) => s.region);
  const activeDate = useItineraryStore((s) => s.activeDate);
  const items = useItineraryStore((s) => s.items);
  const isHourTaken = useItineraryStore((s) => s.isHourTaken);
  const addItem = useItineraryStore((s) => s.addItem);
  const removeItem = useItineraryStore((s) => s.removeItem);
  const clearDate = useItineraryStore((s) => s.clearDate);
  const addPlaces = useItineraryStore((s) => s.addPlaces);
  const optimizeRoute = useItineraryStore((s) => s.optimizeRoute);
  const setRegion = useItineraryStore((s) => s.setRegion);
  const setItems = useItineraryStore((s) => s.setItems);

  const schedule = items
    .filter((i) => i.date === activeDate)
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time));

  const [modalPlace, setModalPlace] = useState<Place | null>(null);
  const [modalHour, setModalHour] = useState(14);
  const [modalMinute, setModalMinute] = useState(0);
  const [modalBudget, setModalBudget] = useState("");

  const [pressingId, setPressingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ place: Place; x: number; y: number } | null>(null);
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<string | null>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLong = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const last = useRef({ x: 0, y: 0 });

  const orderByPlace: Record<string, number> = {};
  schedule.forEach((s, i) => (orderByPlace[s.placeId] = i + 1));

  const totalBudget = schedule.reduce((sum, s) => sum + (s.budget ?? 0), 0);

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

  const handleInvite = async () => {
    if (!session?.user) {
      setLoginReason("일정을 공유하려면 로그인해주세요.");
      return;
    }
    try {
      const { shareToken: token } = await saveItinerary(region, items);
      const url = `${window.location.origin}/travel-scheduler/${token}`;
      await navigator.clipboard.writeText(url);
      showToast("Invite link copied");
    } catch {
      showToast("Failed to create invite link");
    }
  };

  const registerAt = (place: Place, hour: number, minute = 0, budget?: number) => {
    addItem({
      placeId: place.id,
      name: place.name,
      date: activeDate,
      time: formatTime(hour, minute),
      coordinates: { lat: place.lat, lng: place.lng },
      budget,
    });
  };

  const openModal = (place: Place) => {
    const free = TIMELINE_HOURS.find((h) => !isHourTaken(activeDate, h)) ?? 14;
    setModalHour(free);
    setModalMinute(0);
    setModalBudget("");
    setModalPlace(place);
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

  // ── slot hit-testing ──
  const slotUnder = (cx: number, cy: number) => {
    for (const h of TIMELINE_HOURS) {
      const el = slotRefs.current[h];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return h;
    }
    return null;
  };

  const startDrag = (place: Place, clientX: number, clientY: number) => {
    const rect = phoneRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag({ place, x: clientX - rect.left, y: clientY - rect.top });

    const move = (ev: PointerEvent) => {
      const r = phoneRef.current!.getBoundingClientRect();
      setDrag((d) => (d ? { ...d, x: ev.clientX - r.left, y: ev.clientY - r.top } : d));
      setHoverHour(slotUnder(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const dropped = slotUnder(ev.clientX, ev.clientY);
      if (dropped != null) {
        if (isHourTaken(activeDate, dropped)) showToast(`${pad2(dropped)}:00 is already booked`);
        else {
          registerAt(place, dropped, 0);
          showToast(`${place.name} · ${pad2(dropped)}:00`);
        }
      }
      setDrag(null);
      setHoverHour(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── marker press handlers (click vs long-press) ──
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
      if (!firedLong.current) openModal(place);
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

  const routePoints = schedule
    .map((s) => places.find((p) => p.id === s.placeId))
    .filter((p): p is Place => Boolean(p))
    .map((p) => ({ lat: p.lat, lng: p.lng }));

  const mapCenter =
    places.length === 0
      ? { lat: 33.5904, lng: 130.4017 } // Fukuoka
      : {
          lat: places.reduce((sum, p) => sum + p.lat, 0) / places.length,
          lng: places.reduce((sum, p) => sum + p.lng, 0) / places.length,
        };

  // Fit every seeded place in view on load — Fukuoka and Yufuin are ~55km
  // apart, so a fixed center/zoom wouldn't reliably show both clusters.
  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      if (places.length === 0) return;
      const bounds = new google.maps.LatLngBounds();
      places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 48);
    },
    [places],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-200 p-6 font-sans">
      <div
        ref={setPhoneNode}
        className="relative h-[844px] w-[390px] overflow-hidden rounded-[44px] bg-white shadow-[0_0_0_8px_#111318,0_40px_80px_-20px_rgba(15,23,42,0.35)]"
      >
        {/* notch */}
        <div className="absolute left-1/2 top-2.5 z-50 h-[34px] w-[118px] -translate-x-1/2 rounded-full bg-black" />

        {/* header */}
        <div className="absolute inset-x-0 top-[52px] z-30 flex items-end justify-between px-5 pb-1">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
              {formatDateLabel(activeDate)}
              {shareToken && " · Shared"}
            </p>
            <h1 className="text-lg font-bold leading-tight text-slate-900">Fukuoka × Yufuin</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => clearDate(activeDate)}
              className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-500 backdrop-blur"
            >
              Clear
            </button>
            <button
              onClick={handleInvite}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-slate-50 hover:text-slate-900"
              aria-label="초대하기"
            >
              <UserPlus size={15} />
            </button>
          </div>
        </div>

        {/* ── MAP AREA (top ~50%) — real Google Maps ── */}
        <div className="absolute inset-x-0 top-[92px] h-[330px] overflow-hidden bg-[#eef2f4]">
          <div className="absolute inset-x-3 top-3 z-20">
            <PlacesSearchInput onSelect={handlePlaceDiscovered} />
          </div>

          <TrendSheet
            container={phoneEl}
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
                <OverlayView
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                >
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

        {/* ── TIMELINE AREA (bottom ~50%) ── */}
        <div className="absolute inset-x-0 bottom-0 top-[422px] border-t border-slate-200 bg-white">
          <div className="flex items-center justify-between px-5 pb-2 pt-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900">
                <Clock size={12} color="white" />
              </span>
              <span className="text-[13px] font-semibold text-slate-900">Today&apos;s Plan</span>
              {totalBudget > 0 && (
                <Badge className="gap-1 rounded-full border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700 hover:bg-emerald-50">
                  <Wallet size={11} />
                  ¥{totalBudget.toLocaleString()}
                </Badge>
              )}
            </div>

            <button
              onClick={handleOptimizeRoute}
              disabled={schedule.length < 3}
              className="group relative inline-flex items-center gap-1.5 rounded-full p-[1.5px] text-[11px] font-semibold shadow-sm transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none"
              style={{ background: "linear-gradient(120deg,#FF6B6B,#F5A524,#4A90E2)" }}
            >
              <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-slate-800 transition-colors group-hover:bg-transparent group-hover:text-white">
                <Sparkles size={12} />
                동선 최적화
              </span>
            </button>
          </div>

          <div className="h-[378px] overflow-y-auto px-4 pb-6">
            <div className="relative">
              <div className="absolute bottom-2 left-[50px] top-2 w-px bg-slate-200" />
              {TIMELINE_HOURS.map((h) => {
                const item = schedule.find((s) => hourFromTime(s.time) === h);
                const place = item ? places.find((p) => p.id === item.placeId) ?? null : null;
                // A shared item's place is synthesized on hydration (see the
                // sync effect above), so this should be rare in practice —
                // but fall back to the item's own name rather than hiding
                // a real, scheduled stop.
                const display = item ? place ?? fallbackDisplay(item.name) : null;
                const highlighted = hoverHour === h;
                return (
                  <div key={h} className="relative flex h-14 items-stretch">
                    <div className="flex w-[50px] shrink-0 justify-end pr-3 pt-1">
                      <span className="text-[11px] font-semibold tabular-nums text-slate-400">{pad2(h)}:00</span>
                    </div>
                    <span className="absolute left-[46px] top-1.5 h-2 w-2 rounded-full border border-slate-300 bg-white" />
                    <div
                      ref={(el) => {
                        slotRefs.current[h] = el;
                      }}
                      className={`ml-2 mr-1 my-1 flex-1 rounded-xl transition-all ${
                        display
                          ? "border border-transparent"
                          : highlighted
                            ? "border border-dashed border-[#FF6B6B] bg-[#FF6B6B]/10"
                            : "border border-dashed border-slate-200"
                      }`}
                    >
                      {display && item ? (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 26 }}
                          className="relative flex h-full items-center overflow-hidden rounded-xl"
                          style={{ background: `${display.color}0F`, border: `1px solid ${display.color}33` }}
                        >
                          <span className="self-stretch" style={{ width: 6, background: display.color }} />
                          <div className="flex flex-1 items-center gap-2.5 px-3 py-2">
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                              style={{ background: display.color }}
                            >
                              <PlaceGlyph icon={display.icon} size={14} color="white" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-slate-900">{display.name}</p>
                              <p className="text-[10.5px] tabular-nums text-slate-500">
                                {item.time}
                                {display.category ? ` · ${display.category}` : ""}
                              </p>
                            </div>
                            {item.budget != null && (
                              <Badge
                                variant="outline"
                                className="gap-0.5 rounded-full border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600"
                              >
                                <Wallet size={10} /> ¥{item.budget.toLocaleString()}
                              </Badge>
                            )}
                            <Badge
                              className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white"
                              style={{ background: display.color }}
                            >
                              #{orderByPlace[item.placeId]}
                            </Badge>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="flex h-6 w-6 items-center justify-center rounded-full"
                            >
                              <X size={12} color="#94a3b8" />
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          {highlighted ? (
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#FF6B6B]">
                              <Plus size={12} /> Drop here to schedule
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-slate-300">— empty</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="absolute bottom-1.5 left-1/2 h-1 w-32 -translate-x-1/2 rounded-full bg-slate-900/80" />
        </div>

        {/* drag ghost */}
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

        {/* ── MODAL (framer-motion pop) ── */}
        <AnimatePresence>
          {modalPlace && (
            <motion.div
              className="absolute inset-0 z-[70] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setModalPlace(null)} />
              <motion.div
                className="relative w-80 rounded-3xl bg-white p-5 shadow-2xl"
                initial={{ scale: 0.9, y: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 10, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                <button
                  onClick={() => setModalPlace(null)}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"
                >
                  <X size={14} color="#64748b" />
                </button>

                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ background: `${modalPlace.color}1A`, border: `1px solid ${modalPlace.color}33` }}
                  >
                    <PlaceGlyph icon={modalPlace.icon} size={20} color={modalPlace.color} />
                  </span>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {modalPlace.category}
                    </p>
                    <p className="text-[17px] font-semibold leading-tight text-slate-900">{modalPlace.name}</p>
                  </div>
                </div>

                {/* hour picker */}
                <p className="mb-2 mt-5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <Clock size={12} /> Pick a time
                </p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {TIMELINE_HOURS.map((h) => {
                    const taken = isHourTaken(activeDate, h);
                    const active = h === modalHour;
                    return (
                      <button
                        key={h}
                        disabled={taken}
                        onClick={() => setModalHour(h)}
                        className="h-11 w-[52px] shrink-0 rounded-xl border text-[13px] font-semibold tabular-nums transition-all disabled:cursor-not-allowed"
                        style={{
                          background: active ? modalPlace.color : taken ? "#f1f5f9" : "white",
                          color: active ? "white" : taken ? "#cbd5e1" : "#0f172a",
                          borderColor: active ? modalPlace.color : "#e5e7eb",
                        }}
                      >
                        {pad2(h)}:00
                      </button>
                    );
                  })}
                </div>

                {/* minute picker */}
                <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
                  {MINUTE_STEPS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setModalMinute(m)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium tabular-nums transition-all ${
                        modalMinute === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                      }`}
                    >
                      :{pad2(m)}
                    </button>
                  ))}
                </div>

                {/* budget */}
                <label className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <Wallet size={12} /> Estimated budget (¥)
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                    ¥
                  </span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={100}
                    value={modalBudget}
                    onChange={(e) => setModalBudget(e.target.value)}
                    placeholder="0"
                    className="h-11 rounded-xl pl-7 text-sm font-semibold tabular-nums"
                  />
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <span className="text-xs text-slate-500">Scheduled at</span>
                  <span className="text-base font-semibold tabular-nums text-slate-900">
                    {pad2(modalHour)}:{pad2(modalMinute)}
                  </span>
                </div>

                <Button
                  onClick={() => {
                    const budget = modalBudget.trim() ? Number(modalBudget) : undefined;
                    registerAt(modalPlace, modalHour, modalMinute, budget);
                    showToast(`${modalPlace.name} · ${pad2(modalHour)}:${pad2(modalMinute)}`);
                    setModalPlace(null);
                  }}
                  className="mt-5 h-12 w-full rounded-2xl text-sm font-semibold text-white"
                  style={{ background: modalPlace.color }}
                >
                  Register Schedule
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {loginReason && <LoginModal reason={loginReason} onClose={() => setLoginReason(null)} />}

        {/* toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 10, x: "-50%" }}
              className="absolute bottom-24 left-1/2 z-[60] rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function fallbackDisplay(name: string): Place {
  const { color, icon } = styleForCategory("Place");
  return { id: "", placeId: "", name, category: "", color, lat: 0, lng: 0, icon };
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
