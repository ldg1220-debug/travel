"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PlaceGlyph } from "./icons";
import type { TrendCard } from "@/lib/mockTrends";
import type { Place } from "@/lib/types";

async function fetchTrends(): Promise<TrendCard[]> {
  const res = await fetch("/api/travel-scheduler/trends");
  if (!res.ok) throw new Error("Failed to load trends");
  const data = (await res.json()) as { trends: TrendCard[] };
  return data.trends;
}

interface TrendSheetProps {
  /** Portal target so the sheet stays inside the phone-frame mockup instead of the full viewport. */
  container: HTMLElement | null;
  onDown: (place: Place, e: React.PointerEvent) => void;
  onUp: (place: Place) => void;
  onMove: (e: React.PointerEvent) => void;
  onCancel: () => void;
  pressingId: string | null;
  onTrendsLoaded: (places: Place[]) => void;
}

/** Bottom sheet listing hashtag-curated trend spots — cards support the same tap/long-press-drag as map pins. */
export function TrendSheet({ container, onDown, onUp, onMove, onCancel, pressingId, onTrendsLoaded }: TrendSheetProps) {
  const { data: trends = [] } = useQuery({
    queryKey: ["travel-scheduler-trends"],
    queryFn: fetchTrends,
  });

  // Put every trend spot on the map as soon as it's fetched, same as the
  // main app's bottom sheet does for its region's trend list.
  useEffect(() => {
    if (trends.length > 0) onTrendsLoaded(trends.map((t) => t.place));
  }, [trends, onTrendsLoaded]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3.5 py-2 text-[12px] font-semibold text-slate-700 shadow-md">
          <Sparkles size={13} /> Trending spots
        </button>
      </SheetTrigger>
      <SheetContent container={container} side="bottom" className="h-[70%]">
        <SheetHeader>
          <SheetTitle>✨ Trending in Fukuoka &amp; Yufuin</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-6">
          {trends.map((trend) => (
            <TrendCardRow
              key={trend.id}
              trend={trend}
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
  pressing: boolean;
  onDown: (place: Place, e: React.PointerEvent) => void;
  onUp: (place: Place) => void;
  onMove: (e: React.PointerEvent) => void;
  onCancel: () => void;
}

function TrendCardRow({ trend, pressing, onDown, onUp, onMove, onCancel }: TrendCardRowProps) {
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
        </div>
      </div>
    </div>
  );
}
