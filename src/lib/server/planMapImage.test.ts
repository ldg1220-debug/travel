import { describe, expect, it } from "vitest";
import { buildPlanMapSpotsAndPaths } from "./planMapImage";
import type { ItineraryItem } from "@/lib/types";

// 작업지시서 2026-09-15 "공유 품질 4건" §1: og:image용 정적 지도 좌표·경로
// 조립이 course-brief와 같은 규칙(번호는 시작점부터 순서대로)을 따르는지
// 확인한다.
//
// 작업지시서 2026-09-15 "OG 이미지 구도 3건" §3-①: 전 일정이 아니라
// 스팟이 가장 많은 하루만 그린다 — 여러 날에 걸쳐 넓게 퍼진 계획(후쿠오카
// ~유후인~아프리칸사파리)을 한 장에 담으면 축척이 무너져 도심 스팟들이
// 한 점으로 뭉치는 문제였다.

function item(date: string, time: string, lat: number, lng: number): ItineraryItem {
  return { id: `${date}-${time}`, placeId: `${date}-${time}`, name: `spot-${date}-${time}`, date, time, durationMinutes: 60, coordinates: { lat, lng } };
}

describe("buildPlanMapSpotsAndPaths", () => {
  it("draws only the day with the most spots, ignoring other days entirely", () => {
    const items = [
      // day 1: 1 spot
      item("2026-05-22", "09:00", 33.59, 130.4),
      // day 2: 3 spots (busiest) — should be the only day drawn
      item("2026-05-23", "14:00", 33.6, 130.42),
      item("2026-05-23", "09:00", 33.59, 130.41),
      item("2026-05-23", "11:00", 33.595, 130.415),
      // day 3: 2 spots
      item("2026-05-24", "09:00", 33.27, 130.35),
      item("2026-05-24", "10:00", 33.28, 130.36),
    ];
    const { spots } = buildPlanMapSpotsAndPaths(items);
    expect(spots).toHaveLength(3);
    // numbered 1..N within the chosen day only, ordered by time
    expect(spots.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(spots[0]).toMatchObject({ lat: 33.59, lng: 130.41 });
    expect(spots[2]).toMatchObject({ lat: 33.6, lng: 130.42 });
  });

  it("picks the first date encountered when multiple days tie for most spots", () => {
    const items = [
      item("2026-05-23", "09:00", 33.59, 130.41),
      item("2026-05-23", "10:00", 33.6, 130.42),
      item("2026-05-22", "09:00", 33.5, 130.3),
      item("2026-05-22", "10:00", 33.51, 130.31),
    ];
    const { spots } = buildPlanMapSpotsAndPaths(items);
    expect(spots).toHaveLength(2);
    expect(spots[0]).toMatchObject({ lat: 33.5, lng: 130.3 });
  });

  it("draws a path only between consecutive stops within the chosen day", () => {
    const items = [
      item("2026-05-22", "09:00", 35.1, 129.1),
      item("2026-05-23", "09:00", 35.2, 129.2),
      item("2026-05-23", "14:00", 35.21, 129.21),
      item("2026-05-23", "18:00", 35.22, 129.22),
    ];
    const { mapPaths } = buildPlanMapSpotsAndPaths(items);
    // day 2026-05-23 has 3 stops -> 2 legs; day 2026-05-22 (1 stop) is dropped entirely
    expect(mapPaths).toHaveLength(2);
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
