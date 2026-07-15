"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pad2, todayISODate } from "@/lib/timeline";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

interface CalendarCell {
  date: string;
  inMonth: boolean;
}

function isoFromParts(year: number, month: number, day: number): string {
  const d = new Date(year, month, day);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Always a fixed 6-row (42-cell) grid, so the modal's height never jumps between months. */
function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const startOffset = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let i = startOffset; i > 0; i--) cells.push({ date: isoFromParts(year, month, 1 - i), inMonth: false });
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: isoFromParts(year, month, day), inMonth: true });
  let trailing = 1;
  while (cells.length < 42) cells.push({ date: isoFromParts(year, month, daysInMonth + trailing++), inMonth: false });

  return cells;
}

interface MonthCalendarProps {
  /** Currently selected ISO date. */
  selected: string;
  onSelect: (date: string) => void;
  /** Highlight color for the selected day — defaults to near-black to match the app's default UI. */
  accentColor?: string;
  /** ISO dates that get a small dot under the day number (e.g. days that already have scheduled stops) — lets the month view double as an at-a-glance overview, not just a date picker. */
  markedDates?: Set<string>;
}

/**
 * Small month-grid date picker (Notion/Google Calendar style) — any date,
 * past or future month, is reachable via the ‹ › month nav instead of only
 * a short "next N days" window.
 */
export function MonthCalendar({ selected, onSelect, accentColor = "#111827", markedDates }: MonthCalendarProps) {
  const [selYear, selMonth] = selected.split("-").map(Number);
  const [viewYear, setViewYear] = useState(selYear);
  const [viewMonth, setViewMonth] = useState(selMonth - 1); // 0-indexed

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = todayISODate();

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = (cell: CalendarCell) => {
    if (!cell.inMonth) {
      const [y, m] = cell.date.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
    onSelect(cell.date);
  };

  return (
    <div>
      <div className="flex items-center justify-between px-0.5 pb-2">
        <button
          onClick={goPrevMonth}
          aria-label="이전 달"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13px] font-semibold text-slate-900 tabular-nums">
          {viewYear}년 {viewMonth + 1}월
        </span>
        <button
          onClick={goNextMonth}
          aria-label="다음 달"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w} className="text-center text-[10px] font-semibold text-slate-400">
            {w}
          </span>
        ))}
        {cells.map((cell) => {
          const isSelected = cell.date === selected;
          const isToday = cell.date === today;
          const marked = markedDates?.has(cell.date) ?? false;
          return (
            <div key={cell.date} className="relative flex items-center justify-center py-0.5">
              <button
                onClick={() => handleDayClick(cell)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-medium tabular-nums transition-colors ${
                  isSelected ? "" : cell.inMonth ? "text-slate-900" : "text-slate-300"
                }`}
                style={{
                  background: isSelected ? accentColor : "transparent",
                  color: isSelected ? "white" : undefined,
                  boxShadow: isToday && !isSelected ? `inset 0 0 0 1.5px ${accentColor}66` : "none",
                }}
              >
                {Number(cell.date.split("-")[2])}
              </button>
              {marked && (
                <span
                  className="pointer-events-none absolute bottom-0.5 h-1 w-1 rounded-full"
                  style={{ background: isSelected ? "white" : accentColor }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
