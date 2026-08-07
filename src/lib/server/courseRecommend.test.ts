import { describe, expect, it } from "vitest";
import { radiusKmFor, parseTravelMode, parseTimeToMinutes, buildDynamicSlots, isValidPlace, passesQualityGate, THEME_LABELS, type CourseTheme } from "./courseRecommend";
import type { Place } from "@/lib/types";

function place(overrides: Partial<Place> = {}): Place {
  return { id: "p1", placeId: "p1", name: "실제 장소", category: "restaurant", color: "#000", lat: 37.5, lng: 127.0, icon: "pin", ...overrides };
}

describe("radiusKmFor", () => {
  it("defaults to car speed (25km/h) when mode is omitted — unchanged behavior for every pre-existing caller", () => {
    expect(radiusKmFor(60)).toBe(25);
    expect(radiusKmFor(15)).toBeCloseTo(6.25);
  });

  it("returns null for 0 minutes (제한없음) regardless of mode", () => {
    expect(radiusKmFor(0, "walk")).toBeNull();
    expect(radiusKmFor(0, "car")).toBeNull();
  });

  it("scales down for walk and transit — the same minute budget covers much less ground on foot", () => {
    const walk = radiusKmFor(60, "walk")!;
    const transit = radiusKmFor(60, "transit")!;
    const car = radiusKmFor(60, "car")!;
    expect(walk).toBeLessThan(transit);
    expect(transit).toBeLessThan(car);
    expect(walk).toBeCloseTo(4.8);
    expect(transit).toBeCloseTo(18);
  });
});

describe("parseTravelMode", () => {
  it("defaults to car for missing/unrecognized input", () => {
    expect(parseTravelMode(null)).toBe("car");
    expect(parseTravelMode("bike")).toBe("car");
  });

  it("accepts the three valid modes", () => {
    expect(parseTravelMode("walk")).toBe("walk");
    expect(parseTravelMode("transit")).toBe("transit");
    expect(parseTravelMode("car")).toBe("car");
  });
});

describe("parseTimeToMinutes", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });

  it("returns null for missing or malformed input", () => {
    expect(parseTimeToMinutes(null)).toBeNull();
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("not-a-time")).toBeNull();
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("12:60")).toBeNull();
  });
});

describe("isValidPlace", () => {
  it("accepts a normal, real-looking place", () => {
    expect(isValidPlace(place())).toBe(true);
  });

  it("rejects an empty id or name", () => {
    expect(isValidPlace(place({ id: "" }))).toBe(false);
    expect(isValidPlace(place({ name: "" }))).toBe(false);
    expect(isValidPlace(place({ name: "   " }))).toBe(false);
  });

  it("rejects missing/non-finite coordinates", () => {
    expect(isValidPlace(place({ lat: NaN }))).toBe(false);
    expect(isValidPlace(place({ lng: Infinity }))).toBe(false);
  });

  it("rejects the (0,0) 'null island' coordinate — the value a mistakenly-empty location field would silently carry", () => {
    expect(isValidPlace(place({ lat: 0, lng: 0 }))).toBe(false);
  });

  it("accepts a legitimate place that happens to sit exactly on the equator or prime meridian (only true (0,0) is rejected)", () => {
    expect(isValidPlace(place({ lat: 0, lng: 127.0 }))).toBe(true);
    expect(isValidPlace(place({ lat: 37.5, lng: 0 }))).toBe(true);
  });
});

describe("passesQualityGate", () => {
  it("always passes domestic (Kakao Local never provides rating/reviews)", () => {
    expect(passesQualityGate(place({ rating: undefined, reviewCount: undefined }), "domestic")).toBe(true);
    expect(passesQualityGate(place({ rating: undefined, reviewCount: undefined }), "domestic", "restaurant")).toBe(true);
  });

  it("rejects an overseas place with no rating/review data at all — the 오사카 실측 '형경' case (no rating shown in the UI)", () => {
    expect(passesQualityGate(place({ rating: undefined, reviewCount: undefined }), "overseas")).toBe(false);
  });

  it("rejects an overseas place below its category's minimum review count", () => {
    expect(passesQualityGate(place({ rating: 4.5, reviewCount: 1, category: "restaurant" }), "overseas", "restaurant")).toBe(false);
  });

  it("accepts an overseas place meeting its category's minimum review count", () => {
    expect(passesQualityGate(place({ rating: 4.5, reviewCount: 5, category: "restaurant" }), "overseas", "restaurant")).toBe(true);
  });

  it("uses a lower bar for attractions than restaurants/cafes", () => {
    expect(passesQualityGate(place({ rating: 4.0, reviewCount: 2 }), "overseas", "attraction")).toBe(true);
    expect(passesQualityGate(place({ rating: 4.0, reviewCount: 2 }), "overseas", "restaurant")).toBe(false);
  });

  it("falls back to the default threshold when no slot category is given", () => {
    expect(passesQualityGate(place({ rating: 4.0, reviewCount: 3 }), "overseas")).toBe(true);
    expect(passesQualityGate(place({ rating: 4.0, reviewCount: 2 }), "overseas")).toBe(false);
  });
});

describe("buildDynamicSlots", () => {
  const theme: CourseTheme = "balanced";

  it("returns an empty array when the budget is inverted or zero-length", () => {
    expect(buildDynamicSlots(theme, 600, 600)).toEqual([]);
    expect(buildDynamicSlots(theme, 600, 300)).toEqual([]);
  });

  it("keeps slot order identical to the template order (DP layer order relies on array order, not hour)", () => {
    const slots = buildDynamicSlots(theme, 10 * 60, 21 * 60);
    expect(slots.map((s) => s.key)).toEqual(["am-sight", "market", "lunch", "pm-sight", "cafe", "night", "dinner"]);
  });

  it("every produced slot's hour stays within the requested budget", () => {
    const startMinutes = 14 * 60; // 14:00
    const endMinutes = 21 * 60; // 21:00
    const slots = buildDynamicSlots(theme, startMinutes, endMinutes);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.hour).toBeGreaterThanOrEqual(Math.floor(startMinutes / 60));
      expect(s.hour).toBeLessThanOrEqual(Math.ceil(endMinutes / 60));
    }
  });

  it("drops a meal slot entirely when the budget never overlaps that meal's window", () => {
    // 15:00~17:00 예산 — 점심(11:00~14:30)도 저녁(17:30~20:30)도 안 걸침.
    const slots = buildDynamicSlots(theme, 15 * 60, 17 * 60);
    expect(slots.some((s) => s.meal)).toBe(false);
    expect(slots.find((s) => s.key === "lunch")).toBeUndefined();
    expect(slots.find((s) => s.key === "dinner")).toBeUndefined();
  });

  it("keeps a meal slot when the budget overlaps its window, even partially", () => {
    // 13:00~16:00 — 점심 창(11:00~14:30)과 13:00~14:30 구간이 겹친다.
    const slots = buildDynamicSlots(theme, 13 * 60, 16 * 60);
    const lunch = slots.find((s) => s.key === "lunch");
    expect(lunch).toBeDefined();
    expect(lunch!.meal).toBe(true);
  });

  it("falls back cleanly to an empty array (caller falls back to THEME_SLOTS) for every theme when given a full-day budget — never throws", () => {
    for (const t of Object.keys(THEME_LABELS) as CourseTheme[]) {
      expect(() => buildDynamicSlots(t, 9 * 60, 22 * 60)).not.toThrow();
    }
  });
});
