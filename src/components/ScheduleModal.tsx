"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Clock, CalendarDays, Trash2, Wallet } from "lucide-react";
import { PlaceGlyph } from "@/app/(app)/planner/icons";
import { Input } from "@/components/ui/input";
import { MonthCalendar } from "@/components/MonthCalendar";
import type { Place } from "@/lib/types";
import { MINUTE_STEPS, TIMELINE_HOURS, formatDateLabelShort, pad2 } from "@/lib/timeline";

interface ScheduleModalProps {
  place: Place;
  initialDate: string;
  initialHour?: number;
  initialMinute?: number;
  /** Excludes the item currently being edited from the "taken" check. */
  isHourTaken: (date: string, hour: number) => boolean;
  mode?: "create" | "edit";
  /** Shows an optional estimated-budget input (Planner uses this; Discover doesn't need it). */
  showBudget?: boolean;
  initialBudget?: number;
  onClose: () => void;
  onConfirm: (date: string, hour: number, minute: number, budget?: number) => void;
  onDelete?: () => void;
}

/**
 * Shared date + time picker used to schedule (or reschedule) a place —
 * every entry point that lands a place on the itinerary funnels through
 * this instead of silently auto-filling the next free hour, so the user
 * always gets to say *when* a stop happens. The date picker is a real
 * month calendar (Notion/Google Calendar style) rather than a short
 * "next 14 days" strip, so any month is reachable via the ‹ › nav.
 */
export function ScheduleModal({
  place,
  initialDate,
  initialHour,
  initialMinute = 0,
  isHourTaken,
  mode = "create",
  showBudget = false,
  initialBudget,
  onClose,
  onConfirm,
  onDelete,
}: ScheduleModalProps) {
  const [date, setDate] = useState(initialDate);
  const [hour, setHour] = useState<number>(() => {
    if (initialHour != null) return initialHour;
    const free = TIMELINE_HOURS.find((h) => !isHourTaken(initialDate, h));
    return free ?? TIMELINE_HOURS[0];
  });
  const [minute, setMinute] = useState(initialMinute);
  const [budget, setBudget] = useState(initialBudget != null ? String(initialBudget) : "");
  // Editing an existing stop already has a concrete time to show/change;
  // creating a new one reveals the time picker only once the user actually
  // taps a day on the calendar, so the flow reads as "pick a date → then a
  // time appears for it" instead of dumping every control on screen at once.
  const [dateTouched, setDateTouched] = useState(mode === "edit");

  const handleSelectDate = (d: string) => {
    setDate(d);
    setDateTouched(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative flex max-h-[88vh] w-full max-w-[380px] flex-col rounded-3xl bg-white p-5 shadow-2xl"
          initial={{ scale: 0.92, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 10, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            aria-label="Close"
          >
            <X size={14} color="#64748b" />
          </button>

          <div className="flex shrink-0 items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ background: `${place.color}1A`, border: `1px solid ${place.color}33` }}
            >
              <PlaceGlyph icon={place.icon} size={20} color={place.color} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {place.category || "Place"}
              </p>
              <p className="truncate text-[17px] font-semibold leading-tight text-slate-900">{place.name}</p>
            </div>
          </div>

          <div className="mt-4 -mr-1 flex-1 overflow-y-auto pr-1">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <CalendarDays size={12} /> Pick a date
            </p>
            <MonthCalendar selected={date} onSelect={handleSelectDate} accentColor={place.color} />

            <AnimatePresence>
              {dateTouched && (
                <motion.div
                  key={date}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <p className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <Clock size={12} /> Pick a time
                  </p>
                  <div className="-mx-1 grid max-h-[168px] grid-cols-6 gap-1.5 overflow-y-auto px-1 pb-1">
                    {TIMELINE_HOURS.map((h) => {
                      const taken = isHourTaken(date, h);
                      const active = h === hour;
                      return (
                        <button
                          key={h}
                          disabled={taken}
                          onClick={() => setHour(h)}
                          className="h-10 rounded-xl text-[12.5px] font-semibold tabular-nums transition-all disabled:cursor-not-allowed"
                          style={{
                            background: active ? place.color : taken ? "#f1f5f9" : "white",
                            color: active ? "white" : taken ? "#cbd5e1" : "#0f172a",
                            border: active ? `1px solid ${place.color}` : "1px solid #e5e7eb",
                          }}
                        >
                          {pad2(h)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
                    {MINUTE_STEPS.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMinute(m)}
                        className="flex-1 rounded-lg py-1.5 text-xs font-medium tabular-nums transition-all"
                        style={{
                          background: minute === m ? "white" : "transparent",
                          color: minute === m ? "#0f172a" : "#64748b",
                          boxShadow: minute === m ? "0 1px 3px rgba(15,23,42,0.08)" : "none",
                        }}
                      >
                        :{pad2(m)}
                      </button>
                    ))}
                  </div>

                  {showBudget && (
                    <>
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
                          value={budget}
                          onChange={(e) => setBudget(e.target.value)}
                          placeholder="0"
                          className="h-11 rounded-xl pl-7 text-sm font-semibold tabular-nums"
                        />
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-4 shrink-0">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="text-xs text-slate-500">Scheduled at</span>
              <span className="text-base font-semibold tabular-nums text-slate-900">
                {formatDateLabelShort(date)}
                {dateTouched ? ` · ${pad2(hour)}:${pad2(minute)}` : ""}
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              {mode === "edit" && onDelete && (
                <button
                  onClick={onDelete}
                  aria-label="Remove from itinerary"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={() => onConfirm(date, hour, minute, budget.trim() ? Number(budget) : undefined)}
                className="h-12 flex-1 rounded-2xl text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                style={{ background: place.color }}
              >
                {mode === "edit" ? "Update Schedule" : "Register Schedule"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
