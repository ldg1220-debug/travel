"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Clock, Hourglass, Search, PenLine } from "lucide-react";
import { TimeBox } from "@/components/ScheduleModal";
import { PlacesSearchInput } from "./PlacesSearchInput";
import { PlaceGlyph } from "./icons";
import { styleForCategory } from "@/lib/placeStyle";
import type { Place, Region } from "@/lib/types";
import {
  MINUTE_STEPS,
  DURATION_OPTIONS,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  DAY_MINUTES,
  formatDateLabelShort,
  pad2,
} from "@/lib/timeline";

/** Neutral accent for this modal — unlike ScheduleModal, there's no place (and so no place.color) yet when this opens. Matches MonthCalendar's own default accent elsewhere in the app. */
const ACCENT = "#943A00";

interface RangeSelectPlaceModalProps {
  date: string;
  startMinutes: number;
  durationMinutes: number;
  region: Region;
  onRegionChange: (region: Region) => void;
  /** Minute-precise overlap check against the rest of the plan, same shape as ScheduleModal's. */
  hasConflict: (date: string, startMinutes: number, durationMinutes: number) => boolean;
  /** Approximate coordinates for a manually-typed (unsearched) place — the caller averages the plan's other stops, falling back to a generic city center, since there's no real geocoding for hand-typed text. */
  fallbackCoords: () => { lat: number; lng: number };
  onClose: () => void;
  /** `place` is either a real search hit or a synthesized one for a manually-typed name (no real coordinates — see the manual-entry branch below). */
  onConfirm: (place: Place, startMinutes: number, durationMinutes: number) => void;
}

/**
 * Step 2 of drag-to-create: the time range is already staked out on the grid
 * (this just lets it be fine-tuned), and what's still missing is *which*
 * place fills it. Replaces the old flow — a bare place-search list that
 * registered the drop the instant something was tapped, with the dragged
 * time silently locked in — with a single form that keeps the time editable
 * alongside an initially-empty place slot: search for a real place, or (없는
 * 곳이거나 그냥 이름만 적어두고 싶을 때) type a name manually with no search
 * lookup at all.
 */
export function RangeSelectPlaceModal({
  date,
  startMinutes: initialStart,
  durationMinutes: initialDuration,
  region,
  onRegionChange,
  hasConflict,
  fallbackCoords,
  onClose,
  onConfirm,
}: RangeSelectPlaceModalProps) {
  const [startMinutes, setStartMinutes] = useState(initialStart);
  const [duration, setDuration] = useState(initialDuration);
  const [placeMode, setPlaceMode] = useState<"search" | "manual">("search");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [manualName, setManualName] = useState("");

  const hour = Math.floor(startMinutes / 60);
  const minute = startMinutes % 60;
  const endTotalMinutes = startMinutes + duration;
  const endHour = Math.floor(endTotalMinutes / 60) % 24;
  const endMinute = endTotalMinutes % 60;

  const durationForStartCandidate = (candidateStart: number) => {
    const keepEndFixed = endTotalMinutes - candidateStart;
    return keepEndFixed >= MIN_DURATION_MINUTES ? Math.min(keepEndFixed, MAX_DURATION_MINUTES) : duration;
  };
  const handleStartHourChange = (h: number) => {
    const candidate = h * 60 + minute;
    if (hasConflict(date, candidate, durationForStartCandidate(candidate))) {
      const freeMinute = MINUTE_STEPS.find((m) => !hasConflict(date, h * 60 + m, durationForStartCandidate(h * 60 + m)));
      if (freeMinute != null) {
        setDuration(durationForStartCandidate(h * 60 + freeMinute));
        setStartMinutes(h * 60 + freeMinute);
        return;
      }
    }
    setDuration(durationForStartCandidate(candidate));
    setStartMinutes(candidate);
  };
  const handleStartMinuteChange = (m: number) => {
    const candidate = hour * 60 + m;
    setDuration(durationForStartCandidate(candidate));
    setStartMinutes(candidate);
  };
  const handleEndHourChange = (h: number) => {
    let next = h * 60 + endMinute - startMinutes;
    if (next <= 0) next += DAY_MINUTES;
    if (next >= MIN_DURATION_MINUTES) setDuration(Math.min(next, MAX_DURATION_MINUTES));
  };
  const handleEndMinuteChange = (m: number) => {
    let next = endHour * 60 + m - startMinutes;
    if (next <= 0) next += DAY_MINUTES;
    if (next >= MIN_DURATION_MINUTES) setDuration(Math.min(next, MAX_DURATION_MINUTES));
  };

  const manualNameTrimmed = manualName.trim();
  const canConfirm = placeMode === "search" ? selectedPlace != null : manualNameTrimmed.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (placeMode === "search" && selectedPlace) {
      onConfirm(selectedPlace, startMinutes, duration);
      return;
    }
    if (placeMode === "manual" && manualNameTrimmed) {
      // No real coordinates for a hand-typed name — approximated to the
      // plan's own footprint (the caller averages the plan's other stops,
      // falling back to a generic city center) rather than left at (0,0),
      // which would drop a marker in the ocean off the Gulf of Guinea.
      const id = `manual-${crypto.randomUUID()}`;
      const { color, icon } = styleForCategory("Place", id);
      const place: Place = {
        id,
        placeId: id,
        name: manualNameTrimmed,
        category: "Place",
        color,
        icon,
        ...fallbackCoords(),
      };
      onConfirm(place, startMinutes, duration);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative flex max-h-[88vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          <div className="flex shrink-0 items-center justify-between">
            <p className="text-[15px] font-bold text-slate-900">{formatDateLabelShort(date)} 일정 추가</p>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <X size={14} color="#64748b" />
            </button>
          </div>

          <div className="mt-3 -mr-1 flex-1 overflow-y-auto pr-1">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <Clock size={12} /> 시작 · 종료 시간
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
                accentColor={ACCENT}
              />
              <span className="shrink-0 text-slate-300">→</span>
              <TimeBox
                label="종료"
                hour={endHour}
                minute={endMinute}
                onHourChange={handleEndHourChange}
                onMinuteChange={handleEndMinuteChange}
                accentColor={ACCENT}
              />
            </div>
            {endTotalMinutes >= DAY_MINUTES && (
              <p className="mt-1.5 text-[11px] font-medium text-amber-600">
                🌙 다음날 {pad2(endHour)}:{pad2(endMinute)}까지 이어지는 일정이에요
              </p>
            )}

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
                    background: duration === d.minutes ? ACCENT : "white",
                    color: duration === d.minutes ? "white" : "#0f172a",
                    borderColor: duration === d.minutes ? ACCENT : "#e5e7eb",
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="mb-2 mt-4 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">장소</p>
              <div className="flex overflow-hidden rounded-full border border-slate-200 text-[11px] font-semibold">
                <button
                  onClick={() => setPlaceMode("search")}
                  className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${
                    placeMode === "search" ? "bg-slate-900 text-white" : "bg-white text-slate-500"
                  }`}
                >
                  <Search size={11} /> 검색
                </button>
                <button
                  onClick={() => setPlaceMode("manual")}
                  className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${
                    placeMode === "manual" ? "bg-slate-900 text-white" : "bg-white text-slate-500"
                  }`}
                >
                  <PenLine size={11} /> 직접 입력
                </button>
              </div>
            </div>

            {placeMode === "search" ? (
              selectedPlace ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `${selectedPlace.color}1A`, border: `1px solid ${selectedPlace.color}33` }}
                  >
                    <PlaceGlyph icon={selectedPlace.icon} size={14} color={selectedPlace.color} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{selectedPlace.name}</p>
                    {selectedPlace.address && <p className="truncate text-[11px] text-slate-400">{selectedPlace.address}</p>}
                  </div>
                  <button
                    onClick={() => setSelectedPlace(null)}
                    className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-200"
                  >
                    변경
                  </button>
                </div>
              ) : (
                <>
                  <PlacesSearchInput region={region} onSelect={setSelectedPlace} />
                  <div className="mt-1.5 flex justify-end gap-1.5 text-[11px]">
                    <button
                      onClick={() => onRegionChange("domestic")}
                      className={`rounded-full px-2 py-0.5 font-semibold ${region === "domestic" ? "bg-slate-900 text-white" : "text-slate-400"}`}
                    >
                      국내
                    </button>
                    <button
                      onClick={() => onRegionChange("international")}
                      className={`rounded-full px-2 py-0.5 font-semibold ${region === "international" ? "bg-slate-900 text-white" : "text-slate-400"}`}
                    >
                      해외
                    </button>
                  </div>
                </>
              )
            ) : (
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="장소 이름을 입력하세요 (검색 없이 바로 추가)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-slate-400"
              />
            )}
          </div>

          <div className="mt-4 shrink-0">
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="h-12 w-full rounded-2xl text-sm font-semibold text-white transition-transform enabled:active:scale-[0.98] disabled:opacity-40"
              style={{ background: ACCENT }}
            >
              일정에 추가
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
