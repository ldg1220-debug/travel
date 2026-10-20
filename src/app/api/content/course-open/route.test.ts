import { describe, expect, it } from "vitest";
import { isStaleContentPlan, roundUpTo5, scheduleDay, splitByDay } from "./route";
import { shiftISODate } from "@/lib/timeline";
import type { CourseBriefSpot } from "@/lib/server/courseBrief";

// 작업지시서 2026-09-08 "블로그에서 넘어온 코스가 비어 있습니다" §3:
// splitByDay가 course-brief 응답의 `day` 필드를 직접 쓰는지(예전엔
// toNextMinutes==null 휴리스틱으로 날짜 경계를 추론했다) 확인한다.

function spot(day: 1 | 2 | 3, order: number, toNextMinutes: number | null): CourseBriefSpot {
  return {
    name: `spot-${day}-${order}`,
    category: "관광",
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

// 작업지시서 2026-10-16 "코스 → 일정 저장 후 장소 정보가 안 보임" §2-①·④.
describe("scheduleDay — 실제 placeId · 분류 · 5분 단위 시작 시각", () => {
  const REAL_ID = "ChIJ0123456789abcdefghijk";

  it("uses the brief's real Google placeId and keeps category/coordinates; falls back to a synthetic id otherwise", () => {
    const withId = { ...spot(1, 1, 10), placeId: REAL_ID };
    const withoutId = spot(1, 2, null);
    const [a, b] = scheduleDay([withId, withoutId], "2026-10-16", "content-0");
    expect(a.placeId).toBe(REAL_ID);
    expect(a.id).toBe("content-0-0"); // 항목 id 는 계획 안 합성값 그대로
    expect(a.category).toBe("관광");
    expect(a.coordinates).toEqual({ lat: withId.lat, lng: withId.lng });
    expect(b.placeId).toBe("content-0-1");
  });

  it("rejects a non-Google (Kakao-style) id", () => {
    const [a] = scheduleDay([{ ...spot(1, 1, null), placeId: "12345678" }], "2026-10-16", "content-0");
    expect(a.placeId).toBe("content-0-0");
  });

  it("rounds every start time up to a 5-minute step after adding travel time", () => {
    const spots = [spot(1, 1, 17), spot(1, 2, 13), spot(1, 3, 36), spot(1, 4, 7), spot(1, 5, null)];
    const items = scheduleDay(spots, "2026-10-16", "content-0");
    for (const it of items) expect(Number(it.time.split(":")[1]) % 5).toBe(0);
    // 09:00 + 60(체류) + 17 = 10:17 → 10:20, +60+13 = 11:33 → 11:35 ...
    expect(items.map((i) => i.time).slice(0, 3)).toEqual(["09:00", "10:20", "11:35"]);
  });
});

describe("roundUpTo5", () => {
  it("rounds up and leaves multiples of 5 alone", () => {
    expect(roundUpTo5(617)).toBe(620);
    expect(roundUpTo5(620)).toBe(620);
    expect(roundUpTo5(601)).toBe(605);
  });
});

// 작업지시서 2026-10-16 "#326 검증" §3① — 오래된 공유 일정은 교체 대상.
describe("isStaleContentPlan", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  const fresh = () => scheduleDay([spot(1, 1, 10), spot(1, 2, null)], "2026-10-16", "content-ab12cd34-0", "2026-10-16T08:00:00Z");

  it("keeps a fresh schema-2 plan with placeId and coordinates", () => {
    expect(isStaleContentPlan(fresh(), now)).toBe(false);
  });
  it("treats empty / pre-#326 (no schema version) plans as stale", () => {
    expect(isStaleContentPlan([], now)).toBe(true);
    const legacy = fresh().map(({ planSchemaVersion: _v, ...rest }) => { void _v; return rest; });
    expect(isStaleContentPlan(legacy, now)).toBe(true);
  });
  it("treats a plan with a missing placeId or coordinates as stale", () => {
    expect(isStaleContentPlan(fresh().map((i, n) => (n === 0 ? { ...i, placeId: "" } : i)), now)).toBe(true);
    expect(isStaleContentPlan(fresh().map((i, n) => (n === 1 ? { ...i, coordinates: { lat: 0, lng: 0 } } : i)), now)).toBe(true);
  });
  it("treats a plan older than 24 hours as stale", () => {
    const old = scheduleDay([spot(1, 1, null)], "2026-10-14", "content-x-0", "2026-10-15T11:00:00Z");
    expect(isStaleContentPlan(old, now)).toBe(true);
  });
});
