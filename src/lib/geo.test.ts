import { describe, expect, it } from "vitest";
import { haversineDistanceMeters, projectPlacesToPercent } from "./geo";
import type { Place } from "./types";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistanceMeters({ lat: 37.5665, lng: 126.978 }, { lat: 37.5665, lng: 126.978 })).toBe(0);
  });

  it("roughly matches the known Seoul-Busan distance (~325km)", () => {
    const seoul = { lat: 37.5665, lng: 126.978 };
    const busan = { lat: 35.1796, lng: 129.0756 };
    const meters = haversineDistanceMeters(seoul, busan);
    expect(meters).toBeGreaterThan(300_000);
    expect(meters).toBeLessThan(350_000);
  });
});

function place(id: string, lat: number, lng: number): Place {
  return { id, name: id, lat, lng } as Place;
}

describe("projectPlacesToPercent", () => {
  it("returns an empty object for no places", () => {
    expect(projectPlacesToPercent([])).toEqual({});
  });

  it("keeps every projected point within the padded 0-100 box", () => {
    const places = [place("a", 37.5, 126.9), place("b", 37.6, 127.0), place("c", 37.55, 126.95)];
    const result = projectPlacesToPercent(places);
    for (const p of places) {
      const { x, y } = result[p.id];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
  });

  it("doesn't divide by zero when every place shares the same coordinates", () => {
    const result = projectPlacesToPercent([place("solo", 37.5, 126.9)]);
    expect(Number.isFinite(result.solo.x)).toBe(true);
    expect(Number.isFinite(result.solo.y)).toBe(true);
  });
});
