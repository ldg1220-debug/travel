import { describe, expect, it } from "vitest";
import { truncateDaySectionsToRows, type ShareImageDaySection } from "./ShareImageCapture";

// 작업지시서 2026-09-15 "공유 품질 4건" §2: 스토리(9:16) 공유 이미지가
// 첫날치만 담고 나머지 2/3이 빈 여백이던 문제 — 전체 일정을 날짜별로
// 이어서 채우되, 한 장에 담을 수 있는 만큼(MAX_STORY_ROWS)만 자른다.

function day(date: string, count: number): ShareImageDaySection {
  return { date, items: Array.from({ length: count }, (_, i) => ({ time: `0${i}:00`, name: `spot-${date}-${i}`, order: i + 1 })) };
}

describe("truncateDaySectionsToRows", () => {
  it("keeps every day intact when the total is under the cap", () => {
    const days = [day("2026-09-20", 3), day("2026-09-21", 4)];
    const { days: kept, truncatedCount } = truncateDaySectionsToRows(days, 20);
    expect(kept).toEqual(days);
    expect(truncatedCount).toBe(0);
  });

  it("truncates a later day's items once the row budget runs out mid-day", () => {
    const days = [day("2026-09-20", 5), day("2026-09-21", 5)];
    const { days: kept, truncatedCount } = truncateDaySectionsToRows(days, 7);
    expect(kept).toHaveLength(2);
    expect(kept[0].items).toHaveLength(5);
    expect(kept[1].items).toHaveLength(2);
    expect(truncatedCount).toBe(3);
  });

  it("drops an entire day once the budget is exhausted before reaching it", () => {
    const days = [day("2026-09-20", 5), day("2026-09-21", 5), day("2026-09-22", 5)];
    const { days: kept, truncatedCount } = truncateDaySectionsToRows(days, 5);
    expect(kept).toHaveLength(1);
    expect(kept[0].date).toBe("2026-09-20");
    expect(truncatedCount).toBe(10);
  });

  it("returns nothing kept and everything truncated for a zero row budget", () => {
    const days = [day("2026-09-20", 3)];
    const { days: kept, truncatedCount } = truncateDaySectionsToRows(days, 0);
    expect(kept).toEqual([]);
    expect(truncatedCount).toBe(3);
  });

  it("handles an empty day list", () => {
    expect(truncateDaySectionsToRows([], 20)).toEqual({ days: [], truncatedCount: 0 });
  });
});
