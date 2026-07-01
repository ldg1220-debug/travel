"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Coffee,
  Landmark,
  Trees,
  Ship,
  Utensils,
  Camera,
  Clock,
  X,
  Plus,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useItineraryStore } from "@/store/itineraryStore";
import { projectPlacesToPercent } from "@/lib/geo";
import { TIMELINE_HOURS, MINUTE_STEPS, pad2, formatTime, hourFromTime, formatDateLabel } from "@/lib/timeline";
import type { Place, PlaceIcon } from "@/lib/types";

// Design-system icons for each place category (Place.icon is the shared
// string enum used by the whole app; the shadcn/lucide prototype UI wants
// real components, so this is the only translation layer needed).
const ICONS: Record<PlaceIcon, LucideIcon> = {
  coffee: Coffee,
  museum: Landmark,
  tree: Trees,
  boat: Ship,
  utensils: Utensils,
  camera: Camera,
  pin: MapPin,
};

// ─────────────────────────────────────────────────────────────
export default function TravelScheduler() {
  const phoneRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Places to schedule + the single global itinerary come straight from
  // Zustand (src/store/itineraryStore.ts) — no local/hardcoded data here.
  // `places` is seeded with mock data until a real API is wired in; `items`
  // is the same store the rest of the app reads and writes.
  const places = useItineraryStore((s) => s.places);
  const activeDate = useItineraryStore((s) => s.activeDate);
  const items = useItineraryStore((s) => s.items);
  const isHourTaken = useItineraryStore((s) => s.isHourTaken);
  const addItem = useItineraryStore((s) => s.addItem);
  const removeItem = useItineraryStore((s) => s.removeItem);
  const clearDate = useItineraryStore((s) => s.clearDate);

  const schedule = items
    .filter((i) => i.date === activeDate)
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time));

  const [modalPlace, setModalPlace] = useState<Place | null>(null);
  const [modalHour, setModalHour] = useState(14);
  const [modalMinute, setModalMinute] = useState(0);

  const [pressingId, setPressingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ place: Place; x: number; y: number } | null>(null);
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLong = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const last = useRef({ x: 0, y: 0 });

  const positions = projectPlacesToPercent(places);

  const orderByPlace: Record<string, number> = {};
  schedule.forEach((s, i) => (orderByPlace[s.placeId] = i + 1));

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };

  const registerAt = (place: Place, hour: number, minute = 0) => {
    addItem({
      placeId: place.id,
      name: place.name,
      date: activeDate,
      time: formatTime(hour, minute),
      coordinates: { lat: place.lat, lng: place.lng },
    });
  };

  const openModal = (place: Place) => {
    const free = TIMELINE_HOURS.find((h) => !isHourTaken(activeDate, h)) ?? 14;
    setModalHour(free);
    setModalMinute(0);
    setModalPlace(place);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    setPressingId(null);
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
      startDrag(place, last.current.x, last.current.y);
    }, 500);
  };
  const onUp = (place: Place) => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      setPressingId(null);
      if (!firedLong.current) openModal(place);
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
    .map((p) => `${positions[p.id]?.x ?? 0},${positions[p.id]?.y ?? 0}`);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-200 p-6 font-sans">
      <div
        ref={phoneRef}
        className="relative h-[844px] w-[390px] overflow-hidden rounded-[44px] bg-white shadow-[0_0_0_8px_#111318,0_40px_80px_-20px_rgba(15,23,42,0.35)]"
      >
        {/* notch */}
        <div className="absolute left-1/2 top-2.5 z-50 h-[34px] w-[118px] -translate-x-1/2 rounded-full bg-black" />

        {/* header */}
        <div className="absolute inset-x-0 top-[52px] z-30 flex items-end justify-between px-5 pb-1">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
              {formatDateLabel(activeDate)}
            </p>
            <h1 className="text-lg font-bold leading-tight text-slate-900">Kyoto — Day 2</h1>
          </div>
          <button
            onClick={() => clearDate(activeDate)}
            className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-500 backdrop-blur"
          >
            Clear
          </button>
        </div>

        {/* ── MAP AREA (top ~50%) ── */}
        <div
          className="absolute inset-x-0 top-[92px] h-[330px] overflow-hidden bg-[#eef2f4]"
          style={{
            backgroundImage:
              "linear-gradient(to right,rgba(148,163,184,.1) 1px,transparent 1px),linear-gradient(to bottom,rgba(148,163,184,.1) 1px,transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          {/* soft landmasses / roads */}
          <div className="absolute left-[-10%] top-[55%] h-[35%] w-[55%] rounded-[40%_60%_55%_45%/45%_55%_45%_55%] bg-gradient-to-br from-sky-200 to-sky-300/80 opacity-70" />
          <div className="absolute left-[22%] top-[58%] h-[22%] w-[22%] rounded-[52%_48%_60%_40%/55%_45%_55%_45%] bg-emerald-200/80" />
          <div className="absolute left-[30%] top-[-4%] h-[110%] w-2 rounded bg-white ring-1 ring-slate-200" />
          <div className="absolute left-[-4%] top-[45%] h-2 w-[110%] rotate-[-2deg] rounded bg-white ring-1 ring-slate-200" />

          {/* route line */}
          <AnimatePresence>
            {routePoints.length >= 2 && (
              <motion.svg
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.75 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polyline
                  points={routePoints.join(" ")}
                  fill="none"
                  stroke="#111827"
                  strokeWidth={0.6}
                  strokeDasharray="1.6 1.4"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </motion.svg>
            )}
          </AnimatePresence>

          {/* markers */}
          {places.map((p) => {
            const pos = positions[p.id];
            if (!pos) return null;
            const order = orderByPlace[p.id];
            const pressing = pressingId === p.id;
            const hidden = drag?.place.id === p.id;
            return (
              <div
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-full touch-none select-none"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: hidden ? 0 : 1 }}
              >
                <motion.div
                  onPointerDown={(e) => onDown(p, e)}
                  onPointerUp={() => onUp(p)}
                  onPointerMove={onMove}
                  onPointerCancel={cancelPress}
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
                      style={{ borderColor: p.color }}
                    />
                  )}
                  <div className="drop-shadow-lg">
                    <Pin place={p} />
                  </div>
                  {order && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[11px] font-bold text-white">
                      {order}
                    </span>
                  )}
                </motion.div>
                <div className="absolute left-1/2 top-[46px] -translate-x-1/2 whitespace-nowrap">
                  <span className="rounded-full border border-slate-200/70 bg-white/95 px-2 py-px text-[10px] font-medium text-slate-700 shadow-sm">
                    {p.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── TIMELINE AREA (bottom ~50%) ── */}
        <div className="absolute inset-x-0 bottom-0 top-[422px] border-t border-slate-200 bg-white">
          <div className="flex items-center justify-between px-5 pb-2 pt-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900">
                <Clock size={12} color="white" />
              </span>
              <span className="text-[13px] font-semibold text-slate-900">Today&apos;s Plan</span>
              <span className="text-[11px] text-slate-500">
                {schedule.length} stop{schedule.length === 1 ? "" : "s"}
              </span>
            </div>
            <span className="text-[10px] font-medium uppercase text-slate-400">09:00 — 21:00</span>
          </div>

          <div className="h-[378px] overflow-y-auto px-4 pb-6">
            <div className="relative">
              <div className="absolute bottom-2 left-[50px] top-2 w-px bg-slate-200" />
              {TIMELINE_HOURS.map((h) => {
                const item = schedule.find((s) => hourFromTime(s.time) === h);
                const place = item ? places.find((p) => p.id === item.placeId) ?? null : null;
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
                        place
                          ? "border border-transparent"
                          : highlighted
                            ? "border border-dashed border-[#FF6B6B] bg-[#FF6B6B]/10"
                            : "border border-dashed border-slate-200"
                      }`}
                    >
                      {place && item ? (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 26 }}
                          className="relative flex h-full items-center overflow-hidden rounded-xl"
                          style={{ background: `${place.color}0F`, border: `1px solid ${place.color}33` }}
                        >
                          <span className="self-stretch" style={{ width: 6, background: place.color }} />
                          <div className="flex flex-1 items-center gap-2.5 px-3 py-2">
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                              style={{ background: place.color }}
                            >
                              <PlaceGlyph icon={place.icon} size={14} color="white" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-slate-900">{place.name}</p>
                              <p className="text-[10.5px] tabular-nums text-slate-500">
                                {item.time} · {place.category}
                              </p>
                            </div>
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white"
                              style={{ background: place.color }}
                            >
                              #{orderByPlace[place.id]}
                            </span>
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
              className="absolute inset-0 z-40 flex items-center justify-center"
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

                <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <span className="text-xs text-slate-500">Scheduled at</span>
                  <span className="text-base font-semibold tabular-nums text-slate-900">
                    {pad2(modalHour)}:{pad2(modalMinute)}
                  </span>
                </div>

                <Button
                  onClick={() => {
                    registerAt(modalPlace, modalHour, modalMinute);
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

function PlaceGlyph({ icon, size, color }: { icon: PlaceIcon; size?: number; color?: string }) {
  const Icon = ICONS[icon];
  return <Icon size={size} color={color} />;
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
