import { describe, expect, it } from "vitest";
import { scheduleDay, splitByDay } from "./route";
import { shiftISODate } from "@/lib/timeline";
import type { CourseBriefSpot } from "@/lib/server/courseBrief";

// 작업지시서 2026-09-08 "블로그에서 넘어온 코스가 비어 있습니다" §3:
// splitByDay가 course-brief 응답의 `day` 필드를 직접 쓰는지(예전엔
// toNextMinutes==null 휴리스틱으로 날짜 경계를 추론했다) 확인한다.

function spot(day: 1 | 2 | 3, order: number, toNextMinutes: number | null): CourseBriefSpot {
  return {
    name: `spot-${day}-${order}`,
    category: "관광",
    rating: null,
    reviewCount: null,
    lat: 35 + order * 0.001,
    lng: 129 + order * 0.001,
    order,
    day,
    toNextMinutes,
    toNextMode: "walk",
  };
}

describe("splitByDay — day 필드를 그대로 쓴다", () => {
  it("groups a single-day course into exactly one group", () => {
    const spots = [spot(1, 1, 10), spot(1, 2, 15), spot(1, 3, null)];
    const groups = splitByDay(spots);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("groups a two-day course into exactly two groups, in day order", () => {
    const spots = [spot(1, 1, 10), spot(1, 2, null), spot(2, 3, 8), spot(2, 4, null)];
    const groups = splitByDay(spots);
    expect(groups).toHaveLength(2);
    expect(groups[0].every((s) => s.day === 1)).toBe(true);
    expect(groups[1].every((s) => s.day === 2)).toBe(true);
  });

  it("still groups correctly even if toNextMinutes is null mid-day (the old heuristic's failure mode)", () => {
    // 예전 toNextMinutes==null 휴리스틱이었다면 이 null 하나 때문에
    // 1일차가 둘로 쪼개졌을 것이다 — day 필드를 직접 쓰면 흔들리지 않는다.
    const spots = [spot(1, 1, null), spot(1, 2, 20), spot(1, 3, null)];
    const groups = splitByDay(spots);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("returns an empty array for an empty input", () => {
    expect(splitByDay([])).toEqual([]);
  });
});

describe("splitByDay + scheduleDay 통합 — 계획의 날짜 수가 실제 day 수와 일치한다", () => {
  it("produces exactly as many distinct dates as real days for a 1-day course (통영 회귀 방지)", () => {
    const spots = [spot(1, 1, 12), spot(1, 2, 9), spot(1, 3, null)];
    const dayGroups = splitByDay(spots);
    const startDate = "2026-09-08";
    const items = dayGroups.flatMap((dayStops, dayIndex) => scheduleDay(dayStops, shiftISODate(startDate, dayIndex), `content-${dayIndex}`));

    const distinctDates = new Set(items.map((i) => i.date));
    expect(distinctDates.size).toBe(1); // 요청 days=1과 일치
    expect(items).toHaveLength(3);
  });

  it("produces exactly as many distinct dates as real days for a 2-day course (오사카 회귀 방지 — 빈 날 없음)", () => {
    const spots = [spot(1, 1, 12), spot(1, 2, null), spot(2, 3, 7), spot(2, 4, 5), spot(2, 5, null)];
    const dayGroups = splitByDay(spots);
    const startDate = "2026-09-08";
    const items = dayGroups.flatMap((dayStops, dayIndex) => scheduleDay(dayStops, shiftISODate(startDate, dayIndex), `content-${dayIndex}`));

    const distinctDates = new Set(items.map((i) => i.date));
    expect(distinctDates.size).toBe(2); // 요청 days=2와 일치 — 빈 날짜가 추가로 붙지 않는다
    expect(items).toHaveLength(5);
  });
});
