"use client";

import { useDraggable } from "@dnd-kit/core";
import { MarkerPin } from "./MarkerPin";
import type { Place } from "@/lib/types";

interface PlaceMarkerProps {
  place: Place;
  order?: number;
  style: React.CSSProperties;
  onShortPress: (place: Place) => void;
}

/**
 * A single map pin. Tap = open the time-picker modal. Press & hold ~0.5s
 * (dnd-kit's `activationConstraint.delay`) = pick the marker up and drag it
 * onto an hour slot in the timeline below. Because dnd-kit never calls
 * `preventDefault` until the delay elapses, a quick tap still fires a
 * normal click, so both interactions share one pointer target.
 */
export function PlaceMarker({ place, order, style, onShortPress }: PlaceMarkerProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: place.id,
    data: { place },
  });

  return (
    <div
      className="absolute select-none"
      style={{ ...style, transform: "translate(-50%, -100%)", touchAction: "none" }}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={() => onShortPress(place)}
        className="cursor-pointer"
        style={{ opacity: isDragging ? 0.35 : 1 }}
      >
        <MarkerPin place={place} order={order} />
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap" style={{ top: 46 }}>
        <div className="px-2 py-0.5 rounded-full bg-white/95 text-[10px] font-medium text-slate-700 shadow-sm border border-slate-200/70">
          {place.name}
        </div>
      </div>
    </div>
  );
}
