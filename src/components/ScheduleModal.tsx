"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Clock, CalendarDays, Trash2, Wallet, Hourglass } from "lucide-react";
import { PlaceGlyph } from "@/app/(app)/planner/icons";
import { Input } from "@/components/ui/input";
import { MonthCalendar } from "@/components/MonthCalendar";
import type { Place } from "@/lib/types";
import {
  MINUTE_STEPS,
  TIMELINE_HOURS,
  DURATION_OPTIONS,
  DEFAULT_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  DAY_MINUTES,
  formatDateLabelShort,
  pad2,
} from "@/lib/timeline";

/** Compact "시작"/"종료" time box — two native <select>s with hand-authored
 * 24-hour labels ("00".."23"), so the display never flips to a locale's
 * AM/PM (unlike a native <input type="time">, which renders 12-hour in
 * some browsers regardless of the 24h value it holds). */
function TimeBox({
  label,
  hour,
  minute,
  onHourChange,
  onMinuteChange,
  disabledHour,
  disabledMinute,
  accentColor,
}: {
  label: string;
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  disabledHour?: (h: number) => boolean;
  disabledMinute?: (m: number) => boolean;
  accentColor: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <span className="shrink-0 text-[11px] font-medium text-slate-500">{label}</span>
      <select
        value={hour}
        onChange={(e) => onHourChange(Number(e.target.value))}
        className="min-w-0 flex-1 appearance-none rounded-lg border-0 bg-slate-50 py-1.5 text-center text-[13px] font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-2"
        style={{ ["--tw-ring-color" as string]: `${accentColor}55` }}
        aria-label={`${label} 시`}
      >
        {TIMELINE_HOURS.map((h) => {
          const taken = disabledHour?.(h) ?? false;
          return (
            <option key={h} value={h} disabled={taken}>
              {/* 비활성 옵션은 네이티브 <select>가 플랫폼마다 다르게(또는 아예
                  안) 색을 바꿔주므로, 색에만 기대지 않고 라벨 자체에 "마감"을
                  붙여 항상 구분되게 한다. */}
              {taken ? `${pad2(h)} · 마감` : pad2(h)}
            </option>
          );
        })}
      </select>
      <span className="shrink-0 text-slate-400">:</span>
      <select
        value={minute}
        onChange={(e) => onMinuteChange(Number(e.target.value))}
        className="min-w-0 flex-1 appearance-none rounded-lg border-0 bg-slate-50 py-1.5 text-center text-[13px] font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-2"
        style={{ ["--tw-ring-color" as string]: `${accentColor}55` }}
        aria-label={`${label} 분`}
      >
        {MINUTE_STEPS.map((m) => {
          const taken = disabledMinute?.(m) ?? false;
          return (
            <option key={m} value={m} disabled={taken}>
              {taken ? `${pad2(m)} · 마감` : pad2(m)}
            </option>
          );
        })}
      </select>
    </div>
  );
}

interface ScheduleModalProps {
  place: Place;
  initialDate: string;
  initialHour?: number;
  initialMinute?: number;
  /** Excludes the item currently being edited from the "taken" check. Only used to pick a reasonable default hour when creating a stop with no initial time. */
  isHourTaken: (date: string, hour: number) => boolean;
  /** Minute-precise overlap check (excludes the item being edited) — drives which start hours are actually disabled, so a stop can be booked right after another one ends within the same hour. */
  hasConflict: (date: string, startMinutes: number, durationMinutes: number) => boolean;
  mode?: "create" | "edit";
  /** Shows an optional estimated-budget input (Planner uses this; Discover doesn't need it). */
  showBudget?: boolean;
  initialBudget?: number;
  /** Shows the 머무는 시간 (stay-duration) picker (Planner uses this; Discover's quick-add doesn't). */
  showDuration?: boolean;
  initialDuration?: number;
  onClose: () => void;
  onConfirm: (date: string, hour: number, minute: number, budget?: number, durationMinutes?: number) => void;
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
  hasConflict,
  mode = "create",
  showBudget = false,
  initialBudget,
  showDuration = false,
  initialDuration,
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
  const [duration, setDuration] = useState(initialDuration ?? DEFAULT_DURATION_MINUTES);
  // Derived end time, clamped so a stay can't be typed/dragged past midnight
  // (mirrors the same clamp itineraryStore.resizeItem applies on drag).
  const startTotalMinutes = hour * 60 + minute;
  const maxDuration = DAY_MINUTES - startTotalMinutes;
  const clampedDuration = Math.min(duration, maxDuration);
  const endTotalMinutes = startTotalMinutes + clampedDuration;
  const endHour = Math.floor(endTotalMinutes / 60) % 24;
  const endMinute = endTotalMinutes % 60;

  // Picking a start hour is independent of the minute select next to it, so
  // checking a conflict against only the *currently* selected minute (still
  // whatever it was before, often 0) can make a genuinely free hour look
  // blocked — e.g. an existing 10:00-10:30 stop makes "10 · minute 0"
  // conflict, so hour 10 would wrongly disable itself even though 10:30 is
  // open. If the new hour conflicts at the current minute, snap the minute
  // to the first free step within that hour instead of leaving a dead end
  // the user can't click their way out of.
  const previewDuration = showDuration ? duration : DEFAULT_DURATION_MINUTES;
  const handleStartHourChange = (h: number) => {
    if (hasConflict(date, h * 60 + minute, previewDuration)) {
      const freeMinute = MINUTE_STEPS.find((m) => !hasConflict(date, h * 60 + m, previewDuration));
      if (freeMinute != null) setMinute(freeMinute);
    }
    setHour(h);
  };
  const handleEndHourChange = (h: number) => {
    const nextDuration = h * 60 + endMinute - startTotalMinutes;
    if (nextDuration >= MIN_DURATION_MINUTES) setDuration(Math.min(nextDuration, maxDuration));
  };
  const handleEndMinuteChange = (m: number) => {
    const nextDuration = endHour * 60 + m - startTotalMinutes;
    if (nextDuration >= MIN_DURATION_MINUTES) setDuration(Math.min(nextDuration, maxDuration));
  };
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
            aria-label="닫기"
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
                {place.category || "장소"}
              </p>
              <p className="truncate text-[17px] font-semibold leading-tight text-slate-900">{place.name}</p>
            </div>
          </div>

          <div className="mt-4 -mr-1 flex-1 overflow-y-auto pr-1">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <CalendarDays size={12} /> 날짜 선택
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
                    <Clock size={12} /> {showDuration ? "시작 · 종료 시간" : "시간 선택"}
                  </p>
                  <div className="flex items-center gap-2">
                    <TimeBox
                      label="시작"
                      hour={hour}
                      minute={minute}
                      onHourChange={handleStartHourChange}
                      onMinuteChange={setMinute}
                      disabledHour={(h) => MINUTE_STEPS.every((m) => hasConflict(date, h * 60 + m, previewDuration))}
                      disabledMinute={(m) => hasConflict(date, hour * 60 + m, previewDuration)}
                      accentColor={place.color}
                    />
                    {showDuration && (
                      <>
                        <span className="shrink-0 text-slate-300">→</span>
                        <TimeBox
                          label="종료"
                          hour={endHour}
                          minute={endMinute}
                          onHourChange={handleEndHourChange}
                          onMinuteChange={handleEndMinuteChange}
                          accentColor={place.color}
                        />
                      </>
                    )}
                  </div>

                  {showDuration && (
                    <>
                      <p className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <Hourglass size={12} /> 머무는 시간
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {DURATION_OPTIONS.map((d) => (
                          <button
                            key={d.minutes}
                            onClick={() => setDuration(d.minutes)}
                            className="rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-colors"
                            style={{
                              background: clampedDuration === d.minutes ? place.color : "white",
                              color: clampedDuration === d.minutes ? "white" : "#0f172a",
                              borderColor: clampedDuration === d.minutes ? place.color : "#e5e7eb",
                            }}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {showBudget && (
                    <>
                      <label className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <Wallet size={12} /> 예상 예산 (¥)
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
              <span className="text-xs text-slate-500">일정</span>
              <span className="text-base font-semibold tabular-nums text-slate-900">
                {formatDateLabelShort(date)}
                {dateTouched ? ` · ${pad2(hour)}:${pad2(minute)}` : ""}
                {dateTouched && showDuration ? ` · ${DURATION_OPTIONS.find((d) => d.minutes === duration)?.label ?? `${duration}분`}` : ""}
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              {mode === "edit" && onDelete && (
                <button
                  onClick={onDelete}
                  aria-label="일정에서 삭제"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={() => onConfirm(date, hour, minute, budget.trim() ? Number(budget) : undefined, showDuration ? duration : undefined)}
                className="h-12 flex-1 rounded-2xl text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                style={{ background: place.color }}
              >
                {mode === "edit" ? "일정 수정" : "일정에 추가"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
