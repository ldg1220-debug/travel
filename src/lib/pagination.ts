/** Windowed page-number strip for a numbered pager: 1, …, cur-1, cur, cur+1, …, total — collapsing runs into a single "gap" marker once there are too many pages to show all of them. */
export function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) result.push("gap");
    result.push(p);
  });
  return result;
}
