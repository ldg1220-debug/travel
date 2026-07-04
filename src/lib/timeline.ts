/** Daily timeline window: 00:00 - 23:00 (flexible, Notion-style full day) */
export const TIMELINE_HOURS = Array.from({ length: 24 }, (_, i) => i);
export const SLOT_HEIGHT = 56;
export const MINUTE_STEPS = [0, 15, 30, 45];
/** Number of day columns shown at once in the multi-day timeline grid. */
export const VISIBLE_DAYS = 3;
/** A newly-scheduled stop's default length before anyone drags its resize handle. */
export const DEFAULT_DURATION_MINUTES = 60;
/** Shortest a stop can be resized down to. */
export const MIN_DURATION_MINUTES = 15;
/** Resize-drag snapping granularity. */
export const RESIZE_STEP_MINUTES = 15;
export const DAY_MINUTES = 24 * 60;

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTime(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function hourFromTime(time: string): number {
  return Number(time.split(":")[0]);
}

/** Minutes since midnight for an "HH:mm" string. */
export function minutesFromTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** True if [aStart, aStart+aDuration) and [bStart, bStart+bDuration) overlap. */
export function rangesOverlap(aStart: number, aDuration: number, bStart: number, bDuration: number): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

export function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  return `${y}-${m}-${d}`;
}

export function shiftISODate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString("ko-KR", { weekday: "long" });
  return `${m}월 ${d}일 ${weekday}`;
}

/** Compact "7/3 (월)" style label for narrow column headers / date chips. */
export function formatDateLabelShort(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString("ko-KR", { weekday: "short" });
  return `${m}/${d} (${weekday})`;
}

/** `count` consecutive ISO dates starting at `date` (inclusive). */
export function dateWindow(date: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftISODate(date, i));
}
