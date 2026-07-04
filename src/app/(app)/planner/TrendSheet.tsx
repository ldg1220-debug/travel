"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useItineraryStore } from "@/store/itineraryStore";
import { PlaceGlyph } from "./icons";
import { haversineDistanceMeters } from "@/lib/geo";
import type { TrendCard } from "@/lib/mockTrends";
import type { Place } from "@/lib/types";

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

async function fetchTrends(): Promise<TrendCard[]> {
  const res = await fetch("/api/planner/trends");
  if (!res.ok) throw new Error("Failed to load trends");
  const data = (await res.json()) as { trends: TrendCard[] };
  return data.trends;
}

interface TrendSheetProps {
  /** Optional portal target — defaults to document.body (a real full-viewport bottom sheet). */
  container?: HTMLElement | null;
  /**
   * Controlled open state, owned by the parent — a card press needs to be
   * able to dismiss the sheet at the *right* moment (once a click resolves
   * to modal-or-not, or once a long-press genuinely starts dragging), not
   * on raw pointerdown, which would shift the cards mid-tap and could
   * cause the matching pointerup to land on the wrong element entirely.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDown: (place: Place, e: React.PointerEvent) => void;
  onUp: (place: Place) => void;
  onMove: (e: React.PointerEvent) => void;
  onCancel: () => void;
  pressingId: string | null;
  onTrendsLoaded: (places: Place[]) => void;
  /**
   * Coordinates of the day's already-scheduled stops — when present, trend
   * cards are sorted nearest-first (and annotated with distance) so that
   * adding a next stop naturally continues the day's route instead of
   * suggesting something across town.
   */
  nearAnchors?: { lat: number; lng: number }[];
}

/** Bottom sheet listing hashtag-curated trend spots — cards support the same tap/long-press-drag as map pins. */
export function TrendSheet({
  container,
  open,
  onOpenChange,
  onDown,
  onUp,
  onMove,
  onCancel,
  pressingId,
  onTrendsLoaded,
  nearAnchors,
}: TrendSheetProps) {
  const currentCity = useItineraryStore((s) => s.currentCity);
  const { data: trends = [] } = useQuery({
    queryKey: ["planner-trends"],
    queryFn: fetchTrends,
  });

  // Put every trend spot on the map as soon as it's fetched, same as the
  // main app's bottom sheet does for its region's trend list.
  useEffect(() => {
    if (trends.length > 0) onTrendsLoaded(trends.map((t) => t.place));
  }, [trends, onTrendsLoaded]);

  const hasAnchors = Boolean(nearAnchors && nearAnchors.length > 0);

  // Pairs each trend with its distance to the nearest already-scheduled
  // stop (or null with no stops yet), then sorts nearest-first. With no
  // anchors every distance is null and the sort is a no-op (stable sort
  // preserves the original curated order).
  const rankedTrends = useMemo(() => {
    const withDistance = trends.map((trend) => ({
      trend,
      distanceMeters:
        nearAnchors && nearAnchors.length > 0
          ? Math.min(...nearAnchors.map((a) => haversineDistanceMeters(a, trend.place)))
          : null,
    }));
    return withDistance.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  }, [trends, nearAnchors]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3.5 py-2 text-[12px] font-semibold text-slate-700 shadow-md">
          <Sparkles size={13} /> 인기 스팟
        </button>
      </SheetTrigger>
      <SheetContent container={container} side="bottom" className="h-[70%]">
        <SheetHeader>
          <SheetTitle>✨ {currentCity} 인기 스팟</SheetTitle>
        </SheetHeader>
        {hasAnchors && (
          <p className="px-4 text-[11px] text-slate-400">오늘 일정 근처 순으로 정렬했어요</p>
        )}
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-6 pt-2">
          {rankedTrends.map(({ trend, distanceMeters }) => (
            <TrendCardRow
              key={trend.id}
              trend={trend}
              distanceMeters={distanceMeters}
              pressing={pressingId === trend.place.id}
              onDown={onDown}
              onUp={onUp}
              onMove={onMove}
              onCancel={onCancel}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface TrendCardRowProps {
  trend: TrendCard;
  distanceMeters: number | null;
  pressing: boolean;
  onDown: (place: Place, e: React.PointerEvent) => void;
  onUp: (place: Place) => void;
  onMove: (e: React.PointerEvent) => void;
  onCancel: () => void;
}

function TrendCardRow({ trend, distanceMeters, pressing, onDown, onUp, onMove, onCancel }: TrendCardRowProps) {
  const { place, hashtag } = trend;
  return (
    <div
      onPointerDown={(e) => onDown(place, e)}
      onPointerUp={() => onUp(place)}
      onPointerMove={onMove}
      onPointerCancel={onCancel}
      className="flex cursor-pointer touch-none select-none items-center gap-3 rounded-2xl border border-slate-100 p-2.5"
      style={{ transform: pressing ? "scale(0.97)" : "scale(1)", transition: "transform 150ms ease-out" }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: place.color }}
      >
        <PlaceGlyph icon={place.icon} size={18} color="white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold text-[#FF6B6B]">{hashtag}</div>
        <div className="truncate text-[13px] font-semibold text-slate-900">{place.name}</div>
        <div className="text-[11px] text-slate-500">
          {place.category}
          {place.rating != null ? ` · ★ ${place.rating.toFixed(1)}` : ""}
          {distanceMeters != null ? ` · 📍 ${formatDistance(distanceMeters)}` : ""}
        </div>
      </div>
    </div>
  );
}
