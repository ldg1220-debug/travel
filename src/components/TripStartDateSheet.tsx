"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { courseSpanLabel, formatDateLabelShort, nextSaturday, shiftISODate, todayISODate } from "@/lib/timeline";

interface TripStartDateSheetProps {
  /** 일정이 걸치는 일수(공유 일정 그대로) — 요약의 "2박3일" 표기에 쓴다. */
  days: number;
  /** "담아가기" 시트인지, 이미 담은 날짜 미정 계획에 날짜를 정하는 시트인지 — 버튼 문구만 다르다. */
  mode: "copy" | "assign";
  onConfirm: (startDate: string) => void;
  /** copy 모드에서만 — 날짜 없이 1일차·2일차…로 담는다. */
  onUndated?: () => void;
  onClose: () => void;
  busy?: boolean;
}

/**
 * "언제 떠나세요?" — 작업지시서 2026-10-19 "내 계획으로 담아가기 때 여행 시작일 고르기" §1①. 기본 선택은 다음 토요일(오늘이 금·토면 그다음 주 토요일),
 * 과거 날짜는 고를 수 없다(달력 min + 확인 시 재검사).
 */
export function TripStartDateSheet({ days, mode, onConfirm, onUndated, onClose, busy = false }: TripStartDateSheetProps) {
  const today = todayISODate();
  const [startDate, setStartDate] = useState(() => nextSaturday(today));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate >= today;
  const spanDays = Math.max(1, days);
  const endDate = shiftISODate(startDate, spanDays - 1);
  const summary = valid
    ? `${formatDateLabelShort(startDate)}${spanDays > 1 ? ` ~ ${formatDateLabelShort(endDate)}` : ""} · ${courseSpanLabel(spanDays)}`
    : "오늘 이후 날짜를 골라 주세요";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[380px] rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"
          aria-label="닫기"
        >
          <Icon name="x" size={14} color="#64748b" />
        </button>
        <div className="text-[17px] font-semibold text-slate-900">언제 떠나세요?</div>
        <input
          type="date"
          value={startDate}
          min={today}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="여행 시작일"
          className="mt-4 h-12 w-full rounded-2xl border border-slate-200 px-4 text-[15px] text-slate-900 outline-none focus:border-slate-400"
        />
        <p className="mt-3 text-[13px] font-medium text-slate-700">{summary}</p>
        <button
          disabled={!valid || busy}
          onClick={() => onConfirm(startDate)}
          className="mt-4 h-12 w-full rounded-2xl bg-slate-900 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "담는 중…" : mode === "copy" ? "이 날짜로 담기" : "이 날짜로 정하기"}
        </button>
        {mode === "copy" && onUndated && (
          <button disabled={busy} onClick={onUndated} className="mt-3 block w-full text-center text-[13px] font-medium text-slate-500 underline disabled:opacity-50">
            날짜 미정으로 담기
          </button>
        )}
      </div>
    </div>
  );
}
