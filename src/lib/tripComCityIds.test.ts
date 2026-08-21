import { describe, it, expect } from "vitest";
import { resolveTripComCity, TRIP_COM_CITY_IDS } from "./tripComCityIds";

describe("resolveTripComCity", () => {
  it("matches a plain city name", () => {
    expect(resolveTripComCity("서울")).toEqual(TRIP_COM_CITY_IDS["서울"]);
  });

  it("matches a city name embedded in a longer address", () => {
    expect(resolveTripComCity(undefined, undefined, "경기도 수원시 팔달구 ..."))
      .toEqual(TRIP_COM_CITY_IDS["수원"]);
  });

  it("matches across multiple hint fragments, using whichever one has it", () => {
    expect(resolveTripComCity("헤리티지글램핑", undefined, "부산 해운대구 오사카거리 12")).toEqual(TRIP_COM_CITY_IDS["오사카"]);
  });

  it("returns null for an unmapped city (e.g. 김해·창원 — 작업지시서가 명시한 미커버 도시)", () => {
    expect(resolveTripComCity("롯데호텔앤리조트", "김해")).toBeNull();
    expect(resolveTripComCity(undefined, "창원")).toBeNull();
  });

  it("returns null when no hints are given", () => {
    expect(resolveTripComCity()).toBeNull();
  });
});
