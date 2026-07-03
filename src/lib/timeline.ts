/** Daily timeline window: 00:00 - 23:00 (flexible, Notion-style full day) */
export const TIMELINE_HOURS = Array.from({ length: 24 }, (_, i) => i);
export const SLOT_HEIGHT = 56;
export const MINUTE_STEPS = [0, 15, 30, 45];
/** Number of day columns shown at once in the multi-day timeline grid. */
export const VISIBLE_DAYS = 3;

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTime(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function hourFromTime(time: string): number {
  return Number(time.split(":")[0]);
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
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/** Compact "Mon 7/3" style label for narrow column headers / date chips. */
export function formatDateLabelShort(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday} ${m}/${d}`;
}

/** `count` consecutive ISO dates starting at `date` (inclusive). */
export function dateWindow(date: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftISODate(date, i));
}
