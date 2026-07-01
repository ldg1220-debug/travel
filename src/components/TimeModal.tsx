"use client";

import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { Place } from "@/lib/types";
import { MINUTE_STEPS, TIMELINE_HOURS, formatDateLabel, pad2, shiftISODate } from "@/lib/timeline";

interface TimeModalProps {
  place: Place;
  initialDate: string;
  isHourTaken: (date: string, hour: number) => boolean;
  onClose: () => void;
  onRegister: (date: string, hour: number, minute: number) => void;
}

export function TimeModal({ place, initialDate, isHourTaken, onClose, onRegister }: TimeModalProps) {
  const [date, setDate] = useState(initialDate);
  const [hour, setHour] = useState<number>(() => {
    const free = TIMELINE_HOURS.find((h) => !isHourTaken(initialDate, h));
    return free ?? TIMELINE_HOURS[0];
  });
  const [minute, setMinute] = useState(0);

  const dateOptions = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftISODate(initialDate, i)),
    [initialDate],
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-white rounded-3xl shadow-2xl p-5 animate-[modalIn_0.18s_ease-out]">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
          aria-label="Close"
        >
          <Icon name="x" size={14} color="#64748b" />
        </button>

        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: place.color + "1A", border: `1px solid ${place.color}33` }}
          >
            <Icon name={place.icon} size={20} color={place.color} />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
              {place.category}
            </div>
            <div className="text-[17px] font-semibold text-slate-900 leading-tight">{place.name}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2">
            Pick a date
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {dateOptions.map((d) => {
              const active = d === date;
              return (
                <button
                  key={d}
                  onClick={() => setDate(d)}
                  className="shrink-0 text-[11px] font-semibold rounded-xl px-3 py-2 transition-all"
                  style={{
                    background: active ? "#111827" : "white",
                    color: active ? "white" : "#0f172a",
                    border: active ? "1px solid #111827" : "1px solid #e5e7eb",
                  }}
                >
                  {formatDateLabel(d)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2 flex items-center gap-1.5">
            <Icon name="clock" size={12} color="#64748b" /> Pick a time
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {TIMELINE_HOURS.map((h) => {
              const taken = isHourTaken(date, h);
              const active = h === hour;
              return (
                <button
                  key={h}
                  disabled={taken}
                  onClick={() => setHour(h)}
                  className="shrink-0 tabular text-[13px] font-semibold rounded-xl transition-all"
                  style={{
                    width: 52,
                    height: 44,
                    background: active ? place.color : taken ? "#f1f5f9" : "white",
                    color: active ? "white" : taken ? "#cbd5e1" : "#0f172a",
                    border: active ? `1px solid ${place.color}` : "1px solid #e5e7eb",
                    boxShadow: active ? `0 6px 14px -6px ${place.color}80` : "none",
                    cursor: taken ? "not-allowed" : "pointer",
                  }}
                >
                  {pad2(h)}:00
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-1 bg-slate-100 rounded-xl p-1">
            {MINUTE_STEPS.map((m) => (
              <button
                key={m}
                onClick={() => setMinute(m)}
                className="flex-1 py-1.5 rounded-lg text-[12px] font-medium tabular transition-all"
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

          <div className="mt-4 flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50">
            <span className="text-[12px] text-slate-500">Scheduled at</span>
            <span className="text-[16px] font-semibold text-slate-900 tabular">
              {formatDateLabel(date)} · {pad2(hour)}:{pad2(minute)}
            </span>
          </div>
        </div>

        <button
          onClick={() => onRegister(date, hour, minute)}
          className="mt-5 w-full py-3 rounded-2xl text-white text-[14px] font-semibold tracking-wide transition-transform active:scale-[0.98]"
          style={{
            background: `linear-gradient(180deg, ${place.color}, ${place.color}dd)`,
            boxShadow: `0 10px 24px -10px ${place.color}`,
          }}
        >
          Register Schedule
        </button>
      </div>
    </div>
  );
}
