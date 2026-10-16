import { describe, expect, it } from "vitest";
import { catalogPlaceFor } from "./catalogPlace";
import type { ItineraryItem, Place } from "./types";

const place = (id: string, lat: number, lng: number): Place => ({ id, placeId: id, name: id, category: "", color: "#000", lat, lng, icon: "pin" as Place["icon"] });
const item = (placeId: string, lat: number, lng: number): ItineraryItem => ({ id: "i", placeId, name: "n", date: "2026-10-16", time: "09:00", durationMinutes: 60, coordinates: { lat, lng } });

describe("catalogPlaceFor", () => {
  it("matches by id when coordinates agree", () => {
    const p = place("a", 21.0285, 105.8542);
    expect(catalogPlaceFor(item("a", 21.0286, 105.8543), [p])).toBe(p);
  });
  it("ignores an id collision with a place in another city (후쿠오카 vs 하노이 회귀)", () => {
    expect(catalogPlaceFor(item("content-0-0", 21.0285, 105.8542), [place("content-0-0", 33.59, 130.4)])).toBeNull();
  });
  it("trusts the id when the item has no usable coordinates", () => {
    const p = place("a", 33.59, 130.4);
    expect(catalogPlaceFor(item("a", 0, 0), [p])).toBe(p);
  });
});
