"use client";

import { motion } from "framer-motion";
import { PlaceGlyph } from "./icons";
import type { Place } from "@/lib/types";

// ── teardrop pin ──
export function Pin({ place, solid = false }: { place: Place; solid?: boolean }) {
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
export function MarkerContent({ place, order, pressing, hidden, onDown, onUp, onMove, onCancel }: MarkerContentProps) {
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
