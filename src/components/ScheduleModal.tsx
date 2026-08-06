"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Clock, CalendarDays, Wallet, Hourglass } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { PlaceGlyph } from "@/app/(app)/planner/icons";
import { Input } from "@/components/ui/input";
import { MonthCalendar } from "@/components/MonthCalendar";
import { CURRENCY_OPTIONS, currencySymbol, type CurrencyCode, type Place } from "@/lib/types";
import {
  MINUTE_STEPS,
  TIMELINE_HOURS,
  DURATION_OPTIONS,
  DEFAULT_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  DAY_MINUTES,
  formatDateLabelShort,
  pad2,
} from "@/lib/timeline";

/** Compact "시작"/"종료" time box — two native <select>s with hand-authored
 * 24-hour labels ("00".."23"), so the display never flips to a locale's
 * AM/PM (unlike a native <input type="time">, which renders 12-hour in
 * some browsers regardless of the 24h value it holds). */
export function TimeBox({
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
  /** Which currency the budget is in — 항공/숙소는 원화, 현지 식비는 그 나라 통화인 식으로 항목마다 다를 수 있어 지역이 아니라 이 필드로 고른다. Defaults to "KRW". */
  initialCurrency?: CurrencyCode;
  /** Shows the 머무는 시간 (stay-duration) picker (Planner uses this; Discover's quick-add doesn't). */
  showDuration?: boolean;
  initialDuration?: number;
  onClose: () => void;
  onConfirm: (date: string, hour: number, minute: number, budget?: number, durationMinutes?: number, currency?: CurrencyCode) => void;
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
  initialCurrency = "KRW",
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
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);
  const [duration, setDuration] = useState(initialDuration ?? DEFAULT_DURATION_MINUTES);
  // Derived end time. A stay can run past midnight (e.g. 22:00 → next-day
  // 06:00) up to MAX_DURATION_MINUTES — mirrors the same clamp
  // itineraryStore.resizeItem applies. `endHour`/`endMinute` below are
  // wrapped (%24) for display only; `endTotalMinutes` itself stays an
  // absolute past-1440 value when the stay crosses midnight.
  const startTotalMinutes = hour * 60 + minute;
  const maxDuration = MAX_DURATION_MINUTES;
  const clampedDuration = Math.min(duration, maxDuration);
  const endTotalMinutes = startTotalMinutes + clampedDuration;
  const endHour = Math.floor(endTotalMinutes / 60) % 24;
  const endMinute = endTotalMinutes % 60;

  const previewDuration = showDuration ? duration : DEFAULT_DURATION_MINUTES;
  // 종료 컨트롤은 시작을 고정한 채 길이만 바꾼다(handleEndHourChange 등).
  // 시작 컨트롤도 대칭으로 종료를 고정한 채 길이를 바꿔야 하는데, 예전엔
  // 시작을 바꿔도 길이가 그대로라 종료가 같이 밀렸다 — "마감" 판정도 그
  // 낡은(길게 고정된) 길이로만 계산해서, 실제로는 비어있는 이른 시간대까지
  // 막아버리는 버그로 이어졌다(예: 종료 09:00을 먼저 정해 9시간짜리 길이가
  // 됐는데, 그 9시간짜리 길이로 다른 시작 후보를 검사하니 진짜 비어있는
  // 시간대도 어딘가와 겹쳐 보였음). 종료를 고정했을 때 나오는 길이가
  // 최소 길이 이상이면 그걸 쓰고, 아니면(후보 시작이 종료보다 늦는 등)
  // 기존처럼 현재 길이를 유지한 채 미끄러뜨린다.
  const durationForStartCandidate = (startMinutes: number) => {
    if (!showDuration) return previewDuration;
    const keepEndFixed = endTotalMinutes - startMinutes;
    return keepEndFixed >= MIN_DURATION_MINUTES ? Math.min(keepEndFixed, MAX_DURATION_MINUTES) : previewDuration;
  };
  // Picking a start hour/minute is independent of the other select next to
  // it, so checking a conflict against only the *currently* selected minute
  // (still whatever it was before, often 0) can make a genuinely free hour
  // look blocked — e.g. an existing 10:00-10:30 stop makes "10 · minute 0"
  // conflict, so hour 10 would wrongly disable itself even though 10:30 is
  // open. If the new hour conflicts at the current minute, snap the minute
  // to the first free step within that hour instead of leaving a dead end
  // the user can't click their way out of.
  const handleStartHourChange = (h: number) => {
    if (hasConflict(date, h * 60 + minute, durationForStartCandidate(h * 60 + minute))) {
      const freeMinute = MINUTE_STEPS.find((m) => !hasConflict(date, h * 60 + m, durationForStartCandidate(h * 60 + m)));
      if (freeMinute != null) {
        setMinute(freeMinute);
        if (showDuration) setDuration(durationForStartCandidate(h * 60 + freeMinute));
        setHour(h);
        return;
      }
    }
    if (showDuration) setDuration(durationForStartCandidate(h * 60 + minute));
    setHour(h);
  };
  const handleStartMinuteChange = (m: number) => {
    if (showDuration) setDuration(durationForStartCandidate(hour * 60 + m));
    setMinute(m);
  };
  // An end clock-time at or before the start's rolls over to "next day"
  // (there's no separate end-date picker — only the stay's length implies
  // it) — e.g. start 22:00, pick end hour "06" → 8-hour overnight stay,
  // not a rejected negative duration.
  const handleEndHourChange = (h: number) => {
    let nextDuration = h * 60 + endMinute - startTotalMinutes;
    if (nextDuration <= 0) nextDuration += DAY_MINUTES;
    if (nextDuration >= MIN_DURATION_MINUTES) setDuration(Math.min(nextDuration, maxDuration));
  };
  const handleEndMinuteChange = (m: number) => {
    let nextDuration = endHour * 60 + m - startTotalMinutes;
    if (nextDuration <= 0) nextDuration += DAY_MINUTES;
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
                      onMinuteChange={handleStartMinuteChange}
                      disabledHour={(h) => MINUTE_STEPS.every((m) => hasConflict(date, h * 60 + m, durationForStartCandidate(h * 60 + m)))}
                      disabledMinute={(m) => hasConflict(date, hour * 60 + m, durationForStartCandidate(hour * 60 + m))}
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
                  {showDuration && endTotalMinutes >= DAY_MINUTES && (
                    <p className="mt-1.5 text-[11px] font-medium text-amber-600">🌙 다음날 {pad2(endHour)}:{pad2(endMinute)}까지 이어지는 일정이에요</p>
                  )}

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
                        <Wallet size={12} /> 예상 예산
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                          className="h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-2 text-[13px] font-semibold text-slate-700 outline-none focus:border-indigo-400"
                        >
                          {CURRENCY_OPTIONS.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.symbol} {c.code}
                            </option>
                          ))}
                        </select>
                        <div className="relative flex-1">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                            {currencySymbol(currency)}
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
                  <CordixIcon name="trash" size={16} />
                </button>
              )}
              <button
                onClick={() =>
                  onConfirm(date, hour, minute, budget.trim() ? Number(budget) : undefined, showDuration ? duration : undefined, currency)
                }
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
