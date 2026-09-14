import { describe, expect, it } from "vitest";
import { buildPlanMapSpotsAndPaths } from "./planMapImage";
import type { ItineraryItem } from "@/lib/types";

// 작업지시서 2026-09-15 "공유 품질 4건" §1: og:image용 정적 지도 좌표·경로
// 조립이 course-brief와 같은 규칙(날짜 경계는 안 잇는다, 번호는 전체
// 여정에서 이어진다)을 따르는지 확인한다.

function item(date: string, time: string, lat: number, lng: number): ItineraryItem {
  return { id: `${date}-${time}`, placeId: `${date}-${time}`, name: `spot-${date}-${time}`, date, time, durationMinutes: 60, coordinates: { lat, lng } };
}

describe("buildPlanMapSpotsAndPaths", () => {
  it("numbers spots continuously across days and orders each day by time", () => {
    const items = [
      item("2026-09-20", "14:00", 35.2, 129.2),
      item("2026-09-20", "09:00", 35.1, 129.1),
      item("2026-09-21", "10:00", 35.3, 129.3),
    ];
    const { spots } = buildPlanMapSpotsAndPaths(items);
    expect(spots.map((s) => s.order)).toEqual([1, 2, 3]);
    // day 1's 09:00 stop (35.1,129.1) sorts before its 14:00 stop despite input order
    expect(spots[0]).toMatchObject({ order: 1, lat: 35.1, lng: 129.1 });
    expect(spots[1]).toMatchObject({ order: 2, lat: 35.2, lng: 129.2 });
    expect(spots[2]).toMatchObject({ order: 3, lat: 35.3, lng: 129.3 });
  });

  it("draws a path only between consecutive same-day stops, not across the day boundary", () => {
    const items = [item("2026-09-20", "09:00", 35.1, 129.1), item("2026-09-20", "14:00", 35.2, 129.2), item("2026-09-21", "10:00", 35.3, 129.3)];
    const { mapPaths } = buildPlanMapSpotsAndPaths(items);
    // one leg within day 1 (09:00->14:00); none crossing into day 2 (only one stop that day)
    expect(mapPaths).toHaveLength(1);
  });

  it("colors each day's path segments differently", () => {
    const items = [
      item("2026-09-20", "09:00", 35.1, 129.1),
      item("2026-09-20", "10:00", 35.11, 129.11),
      item("2026-09-20", "11:00", 35.12, 129.12),
      item("2026-09-21", "09:00", 35.2, 129.2),
      item("2026-09-21", "10:00", 35.21, 129.21),
    ];
    const { mapPaths } = buildPlanMapSpotsAndPaths(items);
    // day 1 has 2 legs (colored the same as each other), day 2 has 1 leg (a different color)
    expect(mapPaths).toHaveLength(3);
    const day1Color = mapPaths[0].match(/color:(0x[0-9a-f]+)/)?.[1];
    const day2Color = mapPaths[2].match(/color:(0x[0-9a-f]+)/)?.[1];
    expect(mapPaths[1]).toContain(day1Color!);
    expect(day1Color).not.toBe(day2Color);
  });

  it("returns no paths for a single-stop day", () => {
    const { mapPaths, spots } = buildPlanMapSpotsAndPaths([item("2026-09-20", "09:00", 35.1, 129.1)]);
    expect(spots).toHaveLength(1);
    expect(mapPaths).toHaveLength(0);
  });

  it("returns empty spots/paths for an empty itinerary", () => {
    expect(buildPlanMapSpotsAndPaths([])).toEqual({ spots: [], mapPaths: [] });
  });
});
