import { courseSpanLabel, formatDateLabel, formatDateLabelShort } from "@/lib/timeline";

/**
 * 계획의 날짜를 화면에 보여 줄 때의 공용 규칙 — 작업지시서 2026-10-19 "#328 검증" §2③. 날짜가 의미 없는 계획(날짜 미정으로 담은 내 계획 = 항목에 dayNumber,
 * 또는 지금 보고 있는 course-open 콘텐츠 일정 = contentView)은 날짜 문자열 대신 "N일차"로 보여 주고, 그 밖의 계획은 기존 날짜 표기 그대로다.
 */
type DayItem = { date: string; dayNumber?: number };

/** 이 날짜가 몇 일차인가 — 날짜 대신 일차로 보여야 하는 계획이 아니면 null. */
export function planDayNumber(date: string, items: DayItem[], contentView: boolean): number | null {
  const fromItem = items.find((i) => i.date === date && i.dayNumber != null)?.dayNumber;
  if (fromItem != null) return fromItem;
  if (!contentView) return null;
  const dates = [...new Set(items.map((i) => i.date))].sort();
  const idx = dates.indexOf(date);
  return idx >= 0 ? idx + 1 : null;
}

/** "7/3 (월)" 또는 "N일차". `long`이면 날짜일 때 "7월 3일 월요일". */
export function formatPlanDay(date: string, items: DayItem[], contentView: boolean, long = false): string {
  const n = planDayNumber(date, items, contentView);
  if (n != null) return `${n}일차`;
  return long ? formatDateLabel(date) : formatDateLabelShort(date);
}

/** 상단 헤더 날짜 줄 — 콘텐츠 일정이면 "2박3일 코스", 날짜 미정 계획이면 "N일차", 그 밖엔 기존 날짜. */
export function planHeaderDateLabel(activeDate: string, items: DayItem[], contentView: boolean): string {
  if (contentView && items.length > 0) {
    const dates = new Set(items.map((i) => i.date));
    return `${courseSpanLabel(dates.size)} 코스`;
  }
  return formatPlanDay(activeDate, items, false, true);
}
