import { describe, expect, it } from "vitest";
import { classifyPlan, deriveTripStatus, hasCompletedTrip } from "./tripStatus";
import type { ItineraryItem, SavedPlan } from "./types";

const TODAY = "2026-08-14";

function item(date: string, name = "스팟"): ItineraryItem {
  return { id: `${date}-${Math.random()}`, placeId: "p1", name, date, time: "10:00", durationMinutes: 60, coordinates: { lat: 0, lng: 0 } };
}

function plan(id: string, city: string, items: ItineraryItem[]): SavedPlan {
  return { id, name: city, savedAt: 0, items, places: [], activeDate: items[0]?.date ?? TODAY, currentCity: city, region: "domestic" };
}

// today를 명시적으로 고정한다 — deriveTripStatus는 기본값이 실제
// 오늘(todayISODate())이라, 안 넘기면 테스트가 실행되는 실제 날짜에
// 따라 "trip spanning today"/"ongoing" 같은 픽스처가 매일 어긋난다
// (과거 버전이 이 인자가 없어서 겪었던 문제 그대로).
describe("deriveTripStatus", () => {
  it("returns null when there are no candidates", () => {
    expect(deriveTripStatus([], [], "새 여행", TODAY)).toBeNull();
  });

  it("classifies a trip spanning today as ongoing, day = today's index", () => {
    const p = plan("1", "부산", [item("2026-08-13"), item("2026-08-14"), item("2026-08-15")]);
    const status = deriveTripStatus([p], [], "새 여행", TODAY);
    expect(status).toMatchObject({ kind: "ongoing", city: "부산", dayNumber: 2, dayDate: TODAY, daysUntil: 0 });
  });

  it("classifies a future-only trip as upcoming with correct daysUntil", () => {
    const p = plan("1", "제주", [item("2026-08-20"), item("2026-08-21")]);
    const status = deriveTripStatus([p], [], "새 여행", TODAY);
    expect(status).toMatchObject({ kind: "upcoming", city: "제주", daysUntil: 6 });
  });

  it("excludes a trip that has already fully ended", () => {
    const p = plan("1", "경주", [item("2026-08-01"), item("2026-08-02")]);
    expect(deriveTripStatus([p], [], "새 여행", TODAY)).toBeNull();
  });

  it("picks the day with the fewest stops as the day to finish planning", () => {
    // Day1(08-20): 2곳, Day2(08-21): 1곳 → 스팟이 더 적은 Day2를 골라야 함
    const p = plan("1", "부산", [item("2026-08-20"), item("2026-08-20"), item("2026-08-21")]);
    const status = deriveTripStatus([p], [], "새 여행", TODAY);
    expect(status).toMatchObject({ dayNumber: 2, dayDate: "2026-08-21" });
  });

  it("prefers an ongoing plan over a nearer upcoming one", () => {
    const ongoing = plan("1", "부산", [item("2026-08-14")]);
    const upcoming = plan("2", "제주", [item("2026-08-15")]);
    const status = deriveTripStatus([upcoming, ongoing], [], "새 여행", TODAY);
    expect(status).toMatchObject({ kind: "ongoing", city: "부산" });
  });

  it("falls back to the draft (unsaved) itinerary when there are no saved plans", () => {
    const status = deriveTripStatus([], [item("2026-08-16")], "도쿄", TODAY);
    expect(status).toMatchObject({ kind: "upcoming", planId: null, city: "도쿄" });
  });
});

describe("classifyPlan", () => {
  it("returns draft for a plan with no items", () => {
    expect(classifyPlan(plan("1", "새 여행", []), TODAY)).toBe("draft");
  });
  it("returns ongoing when today falls within the plan's date range", () => {
    expect(classifyPlan(plan("1", "부산", [item("2026-08-13"), item("2026-08-15")]), TODAY)).toBe("ongoing");
  });
  it("returns upcoming when the plan starts in the future", () => {
    expect(classifyPlan(plan("1", "제주", [item("2026-08-20")]), TODAY)).toBe("upcoming");
  });
  it("returns completed when the plan is fully in the past", () => {
    expect(classifyPlan(plan("1", "경주", [item("2026-08-01")]), TODAY)).toBe("completed");
  });
});

describe("hasCompletedTrip", () => {
  it("is false with no plans", () => {
    expect(hasCompletedTrip([], TODAY)).toBe(false);
  });
  it("is true when at least one saved plan has fully ended", () => {
    const past = plan("1", "경주", [item("2026-08-01")]);
    const upcoming = plan("2", "제주", [item("2026-08-20")]);
    expect(hasCompletedTrip([past, upcoming], TODAY)).toBe(true);
  });
  it("is false when every plan is still upcoming/ongoing/draft", () => {
    const upcoming = plan("1", "제주", [item("2026-08-20")]);
    const draft = plan("2", "새 여행", []);
    expect(hasCompletedTrip([upcoming, draft], TODAY)).toBe(false);
  });
});
