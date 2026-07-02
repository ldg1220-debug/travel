"use client";

import { useMemo } from "react";
import { PlaceMarker } from "../PlaceMarker";
import { projectPlacesToPercent } from "@/lib/geo";
import type { MapEngineProps } from "./types";

/**
 * Offline decorative map used by both engines when no map API key is
 * configured, so tap-to-schedule / long-press-to-drag stay testable without
 * live credentials.
 */
export function FallbackMapEngine({
  places,
  orderByPlace,
  onShortPress,
  providerLabel,
}: Pick<MapEngineProps, "places" | "orderByPlace" | "onShortPress"> & { providerLabel: string }) {
  const positions = useMemo(() => projectPlacesToPercent(places), [places]);

  return (
    <div className="relative w-full h-full map-bg overflow-hidden">
      <div className="map-water" style={{ left: "-10%", top: "55%", width: "55%", height: "35%", borderRadius: "40% 60% 55% 45% / 45% 55% 45% 55%" }} />
      <div className="map-park" style={{ left: "22%", top: "58%", width: "22%", height: "22%", borderRadius: "52% 48% 60% 40% / 55% 45% 55% 45%" }} />
      <div className="map-road-h" style={{ top: "18%", left: "-4%", width: "110%" }} />
      <div className="map-road-h" style={{ top: "45%", left: "-4%", width: "110%", transform: "rotate(-2deg)" }} />
      <div className="map-road-h" style={{ top: "82%", left: "-4%", width: "110%" }} />
      <div className="map-road-v" style={{ left: "30%", top: "-4%", height: "110%" }} />
      <div className="map-road-v" style={{ left: "62%", top: "-4%", height: "110%", transform: "rotate(3deg)" }} />
      <div className="map-block" style={{ left: "48%", top: "25%", width: "10%", height: "14%" }} />
      <div className="map-block" style={{ left: "68%", top: "32%", width: "14%", height: "9%" }} />
      <div className="map-block" style={{ left: "10%", top: "25%", width: "14%", height: "15%" }} />
      <div className="map-block" style={{ left: "70%", top: "52%", width: "14%", height: "12%" }} />

      {Object.keys(orderByPlace).length >= 2 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={places
              .filter((p) => orderByPlace[p.id] != null)
              .sort((a, b) => orderByPlace[a.id] - orderByPlace[b.id])
              .map((p) => `${positions[p.id]?.x ?? 0},${positions[p.id]?.y ?? 0}`)
              .join(" ")}
            fill="none"
            stroke="#111827"
            strokeWidth="0.6"
            strokeDasharray="1.6 1.4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.75"
          />
        </svg>
      )}

      {places.map((place) => {
        const pos = positions[place.id];
        if (!pos) return null;
        return (
          <PlaceMarker
            key={place.id}
            place={place}
            order={orderByPlace[place.id]}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            onShortPress={onShortPress}
          />
        );
      })}

      <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/90 border border-slate-200 shadow-sm">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-[10px] font-medium text-slate-600">{providerLabel}</span>
      </div>
    </div>
  );
}

export function MapMessage({ text }: { text: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500 text-sm">
      {text}
    </div>
  );
}
