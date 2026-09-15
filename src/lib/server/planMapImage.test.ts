import { describe, expect, it } from "vitest";
import { buildPlanMapSpots, fetchPlanDayRoutePaths } from "./planMapImage";
import type { ItineraryItem } from "@/lib/types";
import type { LegRouteResult } from "./courseBrief";

// 작업지시서 2026-09-15 "공유 품질 4건" §1: og:image용 정적 지도 좌표·경로
// 조립이 course-brief와 같은 규칙(번호는 시작점부터 순서대로)을 따르는지
// 확인한다.
//
// 작업지시서 2026-09-15 "OG 이미지 구도 3건" §3-①: 전 일정이 아니라
// 스팟이 가장 많은 하루만 그린다.
//
// 작업지시서 2026-09-15 "OG 지도 잔여 2건" §2·§3: 대표 하루 안의 이상치는
// 화면(viewport) 계산에서 빼고, 경로선은 실제 도로 경로를 조회한다.

function item(date: string, time: string, lat: number, lng: number): ItineraryItem {
  return { id: `${date}-${time}`, placeId: `${date}-${time}`, name: `spot-${date}-${time}`, date, time, durationMinutes: 60, coordinates: { lat, lng } };
}

describe("buildPlanMapSpots", () => {
  it("selects only the day with the most spots, ignoring other days entirely", () => {
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
    const { spots, dayItems } = buildPlanMapSpots(items);
    expect(spots).toHaveLength(3);
    expect(dayItems).toHaveLength(3);
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
    const { spots } = buildPlanMapSpots(items);
    expect(spots).toHaveLength(2);
    expect(spots[0]).toMatchObject({ lat: 33.5, lng: 130.3 });
  });

  it("keeps every stop of the chosen day as a marker, even a far outlier — but centers the viewport on the core cluster (작업지시서 2026-09-15 'OG 지도 잔여 2건' §2)", () => {
    const items = [
      // downtown cluster — 6 stops within ~1km of each other
      item("2026-05-23", "09:00", 33.59, 130.4),
      item("2026-05-23", "10:00", 33.591, 130.401),
      item("2026-05-23", "11:00", 33.592, 130.402),
      item("2026-05-23", "12:00", 33.593, 130.403),
      item("2026-05-23", "13:00", 33.594, 130.404),
      item("2026-05-23", "14:00", 33.595, 130.405),
      // a single stop ~15km away (다자이후 같은 단독 방문지)
      item("2026-05-23", "18:00", 33.52, 130.53),
    ];
    const { spots, viewport } = buildPlanMapSpots(items);
    expect(spots).toHaveLength(7); // 이상치도 마커로는 남는다
    expect(viewport).not.toBeNull();
    // viewport center should sit near the downtown cluster, not dragged toward the outlier
    expect(viewport!.center.lat).toBeCloseTo(33.5925, 1);
    expect(viewport!.center.lng).toBeCloseTo(130.4025, 1);
  });

  it("returns an empty viewport-free result for an empty itinerary", () => {
    expect(buildPlanMapSpots([])).toEqual({ spots: [], dayItems: [], viewport: null });
  });
});

describe("fetchPlanDayRoutePaths — 작업지시서 2026-09-15 'OG 지도 잔여 2건' §3", () => {
  const a = item("2026-05-23", "09:00", 33.59, 130.4);
  const b = item("2026-05-23", "10:00", 33.6, 130.42);
  const c = item("2026-05-23", "11:00", 33.61, 130.43);

  it("returns no paths for a single-stop day", () => {
    return fetchPlanDayRoutePaths([a]).then((paths) => expect(paths).toHaveLength(0));
  });

  it("draws a real (non-grey) path for a leg the router resolved", async () => {
    const fakeRoute = async (): Promise<LegRouteResult> => ({
      distanceM: 500,
      durationMin: 6,
      path: [a.coordinates, { lat: 33.595, lng: 130.41 }, b.coordinates],
      estimated: false,
    });
    const paths = await fetchPlanDayRoutePaths([a, b], fakeRoute);
    expect(paths).toHaveLength(1);
    expect(paths[0]).not.toContain("0x9e9e9e"); // 회색(추정) 팔레트가 아니다
  });

  it("greys out a leg the router could only estimate (도보 구간이 직선으로 그려집니다 규칙과 동일)", async () => {
    const fakeRoute = async (): Promise<LegRouteResult> => ({
      distanceM: 500,
      durationMin: 6,
      path: [a.coordinates, b.coordinates],
      estimated: true,
    });
    const paths = await fetchPlanDayRoutePaths([a, b], fakeRoute);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain("0x9e9e9e");
  });

  it("fetches one leg per consecutive pair within the day", async () => {
    const calls: Array<{ lat: number; lng: number }> = [];
    const fakeRoute = async (from: { lat: number; lng: number }): Promise<LegRouteResult> => {
      calls.push(from);
      return { distanceM: 100, durationMin: 2, path: null, estimated: true };
    };
    const paths = await fetchPlanDayRoutePaths([a, b, c], fakeRoute);
    expect(paths).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});
