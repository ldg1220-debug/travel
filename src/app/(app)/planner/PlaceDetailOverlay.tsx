"use client";

import { useState } from "react";
import { GoogleMap } from "@react-google-maps/api";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGoogleMapsStatus } from "./MapProvider";
import { PlaceGlyph } from "./icons";
import { Pin } from "./PlannerBoard";
import type { Place } from "@/lib/types";

const CATEGORY_OPTIONS = ["Cafe", "Restaurant", "Attraction", "Lodging", "Museum", "Park"];

interface PlaceDetailOverlayProps {
  /** null = closed. Doubles as both "add new" (from search/trends) and "edit existing" (from the saved list) — upsertSavedPlace on the store handles both uniformly. */
  place: Place | null;
  onClose: () => void;
  onSave: (place: Place) => void;
  /** Present only when there's somewhere meaningful to schedule it (an activeDate) — renders a second "일정에 추가" action. */
  onSchedule?: (place: Place) => void;
}

/**
 * "딥 다이브" detail overlay — a bottom sheet over whatever the planner
 * tab underneath was showing, so switching tabs/dates while it's open
 * isn't possible and closing it always returns to the exact same state.
 * Mini map reuses the same MapProvider-loaded SDK as the main planner
 * map (no second script load).
 */
export function PlaceDetailOverlay({ place, onClose, onSave, onSchedule }: PlaceDetailOverlayProps) {
  const { isLoaded: mapsLoaded } = useGoogleMapsStatus();

  return (
    <AnimatePresence>
      {place && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative flex max-h-[88%] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {/* mini map */}
            <div className="relative h-40 shrink-0 bg-[#eef2f4]">
              {mapsLoaded ? (
                <GoogleMap
                  key={place.id}
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  center={{ lat: place.lat, lng: place.lng }}
                  zoom={15}
                  // Belt-and-suspenders alongside the center/zoom props above:
                  // explicitly panTo/setZoom on load so this place's real
                  // coordinates always win, never a stale default.
                  onLoad={(map) => {
                    map.panTo({ lat: place.lat, lng: place.lng });
                    map.setZoom(15);
                  }}
                  options={{ disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">지도 로딩 중…</div>
              )}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-lg">
                <Pin place={place} solid />
              </div>
              <button
                onClick={onClose}
                aria-label="닫기"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow"
              >
                <X size={14} color="#64748b" />
              </button>
            </div>

            {/* Keyed on place.id so switching to a different place (without
                the overlay ever fully closing) resets the form's local
                state via remount, instead of syncing it from a prop effect. */}
            <PlaceDetailForm key={place.id} place={place} onSave={onSave} onSchedule={onSchedule} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface PlaceDetailFormProps {
  place: Place;
  onSave: (place: Place) => void;
  onSchedule?: (place: Place) => void;
}

function PlaceDetailForm({ place, onSave, onSchedule }: PlaceDetailFormProps) {
  const [category, setCategory] = useState(place.category);
  const [memo, setMemo] = useState(place.memo ?? "");

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${place.color}1A`, border: `1px solid ${place.color}33` }}
        >
          <PlaceGlyph icon={place.icon} size={20} color={place.color} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-tight text-slate-900">{place.name}</p>
          <p className="truncate text-[12px] text-slate-500">{place.address ?? place.category}</p>
        </div>
      </div>

      <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wide text-slate-500">카테고리</p>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_OPTIONS.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              category === c ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <label className="mb-2 mt-4 block text-[11px] font-medium uppercase tracking-wide text-slate-500">메모</label>
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="이 장소에 대한 메모를 남겨보세요"
        rows={3}
        className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
      />

      <div className="mt-5 flex gap-2">
        <Button
          onClick={() => onSave({ ...place, category, memo: memo.trim() || undefined })}
          className="h-12 flex-1 rounded-2xl text-sm font-semibold text-white"
          style={{ background: place.color }}
        >
          저장하기
        </Button>
        {onSchedule && (
          <Button
            onClick={() => onSchedule({ ...place, category, memo: memo.trim() || undefined })}
            variant="outline"
            className="h-12 flex-1 rounded-2xl border-slate-300 text-sm font-semibold text-slate-700"
          >
            일정에 추가
          </Button>
        )}
      </div>
    </div>
  );
}
