"use client";

import { useDroppable } from "@dnd-kit/core";
import { Icon } from "./Icon";
import type { ItineraryItem, Place } from "@/lib/types";
import { SLOT_HEIGHT, TIMELINE_HOURS, pad2 } from "@/lib/timeline";

interface TimelineViewProps {
  date: string;
  items: ItineraryItem[];
  placesById: Record<string, Place>;
  orderByPlace: Record<string, number>;
  hoverHour: number | null;
  onRemove: (id: string) => void;
}

export function TimelineView({ date, items, placesById, orderByPlace, hoverHour, onRemove }: TimelineViewProps) {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <Icon name="clock" size={12} color="white" />
          </div>
          <div className="text-[13px] font-semibold text-slate-900">Today&apos;s Plan</div>
          <div className="text-[11px] text-slate-500 tabular">
            {items.length} stop{items.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">09:00 — 21:00</div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
        <div className="relative">
          <div className="absolute left-[50px] top-2 bottom-2 w-px bg-slate-200" />
          {TIMELINE_HOURS.map((hour) => {
            const item = items.find((i) => Number(i.time.split(":")[0]) === hour) ?? null;
            const place = item ? placesById[item.placeId] ?? null : null;
            return (
              <HourSlot
                key={hour}
                date={date}
                hour={hour}
                item={item}
                place={place}
                order={item ? orderByPlace[item.placeId] : undefined}
                highlighted={hoverHour === hour}
                onRemove={onRemove}
              />
            );
          })}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}

interface HourSlotProps {
  date: string;
  hour: number;
  item: ItineraryItem | null;
  place: Place | null;
  order: number | undefined;
  highlighted: boolean;
  onRemove: (id: string) => void;
}

function HourSlot({ date, hour, item, place, order, highlighted, onRemove }: HourSlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${date}-${hour}`, data: { date, hour } });
  const showHighlight = highlighted || isOver;

  // The itinerary isn't region-scoped, so an item's place may not be in the
  // currently displayed (region-filtered) place list — fall back to the
  // item's own stored name rather than silently hiding a scheduled stop.
  const display = item ? place ?? { name: item.name, category: "", color: "#64748B", icon: "pin" as const } : null;

  return (
    <div ref={setNodeRef} className="relative flex items-stretch" style={{ height: SLOT_HEIGHT }}>
      <div className="w-[50px] shrink-0 flex items-start justify-end pr-3 pt-1">
        <span className="text-[11px] font-semibold text-slate-400 tabular">{pad2(hour)}:00</span>
      </div>

      <div className="absolute left-[46px] top-1.5 flex items-center justify-center" style={{ width: 8, height: 8 }}>
        <div className="w-2 h-2 rounded-full bg-white border border-slate-300" />
      </div>

      <div
        className={`flex-1 ml-2 mr-1 my-1 rounded-xl border transition-all duration-150 ${
          display ? "border-transparent" : showHighlight ? "border-dashed timeline-slot-highlight" : "border-dashed border-slate-200"
        }`}
      >
        {display && item ? (
          <div
            className="h-full rounded-xl overflow-hidden flex items-center relative"
            style={{ background: `${display.color}0F`, border: `1px solid ${display.color}33` }}
          >
            <div className="w-1.5 self-stretch" style={{ background: display.color }} />
            <div className="flex-1 px-3 py-2 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: display.color }}>
                <Icon name={display.icon} size={14} color="white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-slate-900 truncate">{display.name}</div>
                <div className="text-[10.5px] text-slate-500 tabular">
                  {item.time}
                  {display.category ? ` · ${display.category}` : ""}
                </div>
              </div>
              {order != null && (
                <div className="tabular text-[11px] font-semibold text-white px-2 py-0.5 rounded-full" style={{ background: display.color }}>
                  #{order}
                </div>
              )}
              <button
                onClick={() => onRemove(item.id)}
                className="w-6 h-6 rounded-full hover:bg-white/70 flex items-center justify-center"
                aria-label="Remove"
              >
                <Icon name="x" size={12} color="#94a3b8" />
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            {showHighlight ? (
              <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#FF6B6B" }}>
                <Icon name="plus" size={12} color="#FF6B6B" />
                Drop here to schedule
              </div>
            ) : (
              <div className="text-[11px] text-slate-300 font-medium">— empty</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
