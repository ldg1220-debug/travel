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
    // "오사카거리"는 실제 도시가 아니라 도로명일 뿐이지만, 부분 문자열
    // 매칭이라 "오사카"가 그대로 걸린다 — 세 번째 힌트에서까지 찾는다는
    // 것만 확인하면 되므로 다른 매핑 도시명과 안 겹치는 조각을 쓴다.
    expect(resolveTripComCity("헤리티지글램핑", undefined, "강남구 오사카거리 12")).toEqual(TRIP_COM_CITY_IDS["오사카"]);
  });

  it("returns null for an unmapped city (e.g. 김해·창원 — 작업지시서가 명시한 미커버 도시)", () => {
    expect(resolveTripComCity("롯데호텔앤리조트", "김해")).toBeNull();
    expect(resolveTripComCity(undefined, "창원")).toBeNull();
  });

  it("returns null when no hints are given", () => {
    expect(resolveTripComCity()).toBeNull();
  });

  it("resolves a top-level region name like 부산 (작업지시서 2026-08-24, ②-1·②-4)", () => {
    // PlannerBoard.tsx는 currentCity를 placeName 자리로 그대로 넘기고,
    // DiscoverClient.tsx는 place.address만 넘긴다 — 둘 다 실제 호출
    // 형태 그대로 확인한다.
    expect(resolveTripComCity("부산")).toEqual(TRIP_COM_CITY_IDS["부산"]);
    expect(resolveTripComCity(undefined, undefined, "부산광역시 해운대구 ...")).toEqual(TRIP_COM_CITY_IDS["부산"]);
  });

  it("resolves the newly-added cities (작업지시서 2026-08-24 ②-1 실측값)", () => {
    expect(resolveTripComCity("도쿄")).toEqual(TRIP_COM_CITY_IDS["도쿄"]);
    expect(resolveTripComCity("후쿠오카")).toEqual(TRIP_COM_CITY_IDS["후쿠오카"]);
    expect(resolveTripComCity("서귀포")).toEqual(TRIP_COM_CITY_IDS["서귀포"]);
    expect(resolveTripComCity("광저우")).toEqual(TRIP_COM_CITY_IDS["광저우"]);
    expect(resolveTripComCity("심천")).toEqual(TRIP_COM_CITY_IDS["심천"]);
  });
});
