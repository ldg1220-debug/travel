import { describe, expect, it } from "vitest";
import {
  radiusKmFor,
  parseTravelMode,
  parseTimeToMinutes,
  buildDynamicSlots,
  isValidPlace,
  passesQualityGate,
  applyQualityGate,
  sameShop,
  isLargeFacility,
  cuisineKeyword,
  THEME_LABELS,
  type CourseTheme,
} from "./courseRecommend";
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

describe("sameShop", () => {
  it("still matches the original prefix case (single-word brand + branch suffix)", () => {
    expect(sameShop("우오신", "우오신 우메다점")).toBe(true);
  });

  // 오사카 3박4일 다일정 2차 실측에서 실제로 새어나간 케이스 — 지점
  // 접미사가 서로 다른 형태(공백 유무, "분점" vs "점")라 기존 접두
  // 매칭으로는 안 잡혔다.
  it("matches 규카츠 모토무라's three branch listings from the Osaka multi-day run", () => {
    expect(sameShop("규카츠 모토무라 난바 분점", "규카츠 모토무라 도톤보리점")).toBe(true);
    expect(sameShop("규카츠 모토무라 난바 분점", "규카츠 모토무라 난바점")).toBe(true);
    expect(sameShop("규카츠 모토무라 도톤보리점", "규카츠 모토무라 난바점")).toBe(true);
  });

  it("matches 메이드리밍's two branch listings (differing region-name word count)", () => {
    expect(sameShop("메이드리밍 오사카 닛폰바시 오타로드점", "메이드리밍 오사카 난바점")).toBe(true);
  });

  it("does not match unrelated places, including ones sharing only their first word", () => {
    expect(sameShop("오사카 성", "오사카 스테이션 시티")).toBe(false);
    expect(sameShop("도톤보리", "구로몬 시장")).toBe(false);
  });

  // 3차 실측 — brandKey(이름 맨 앞 2어절)도 못 잡은 사례: 같은 집이
  // "Gyumon Dotonbori 2nd"(Day2)와 광고 문구가 상호 자리를 차지해
  // 실제 브랜드("GYUMON")가 맨 끝에 붙은 "세계에서 가장 저렴하고
  // 맛있는 와규 스키야키 GYUMON"(Day3)로 표기가 완전히 달랐다.
  it("matches a promotional-phrase-prefixed name to its plain counterpart via a shared brand-like Latin token", () => {
    expect(sameShop("Gyumon Dotonbori 2nd", "세계에서 가장 저렴하고 맛있는 와규 스키야키 GYUMON")).toBe(true);
  });

  it("brand key comparison is case-insensitive", () => {
    expect(sameShop("Gyumon Dotonbori", "GYUMON DOTONBORI")).toBe(true);
  });

  it("does not treat a shared English location word as a brand match (false-positive guard)", () => {
    expect(sameShop("Namba Grill House", "Namba Sushi Bar")).toBe(false);
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
    expect(passesQualityGate(place({ rating: 4.5, reviewCount: 12, category: "restaurant" }), "overseas", "restaurant")).toBe(true);
  });

  // 3차 실측 — 하한을 처음엔(2차 수정) 명소 100까지 올렸는데, 그게 아래
  // applyQualityGate의 옛 "부족하면 미달로 채우기" 폴백과 상쇄돼(하한이
  // 높을수록 통과 후보가 부족해져 폴백이 더 자주 발동) "형경"이 재등장하는
  // 회귀가 났다. 폴백을 없앤 지금은 하한을 현실적인 수준(40)으로
  // 낮췄다 — 여전히 restaurant/cafe(12/10)보다는 훨씬 높다.
  it("uses a higher bar for attractions than restaurants/cafes, but not so high that it starves normal cities", () => {
    expect(passesQualityGate(place({ rating: 4.2, reviewCount: 30 }), "overseas", "attraction")).toBe(false);
    expect(passesQualityGate(place({ rating: 4.2, reviewCount: 50 }), "overseas", "attraction")).toBe(true);
    expect(passesQualityGate(place({ rating: 4.0, reviewCount: 15 }), "overseas", "restaurant")).toBe(true);
  });

  it("falls back to the default threshold when no slot category is given", () => {
    expect(passesQualityGate(place({ rating: 4.0, reviewCount: 15 }), "overseas")).toBe(true);
    expect(passesQualityGate(place({ rating: 4.0, reviewCount: 2 }), "overseas")).toBe(false);
  });
});

describe("applyQualityGate", () => {
  it("returns only gate-passing candidates", () => {
    const mixed = [
      place({ id: "a", rating: 4.5, reviewCount: 50000, category: "attraction" }),
      place({ id: "b", rating: 4.3, reviewCount: 20000, category: "attraction" }),
      place({ id: "low-review", rating: 4.2, reviewCount: 5, category: "attraction" }),
    ];
    expect(applyQualityGate(mixed, "overseas", "attraction").map((p) => p.id)).toEqual(["a", "b"]);
  });

  // 3차 실측에서 확인된 회귀의 재발 방지 테스트 — 이전엔 통과 후보가
  // 부족하면 하한 미달 후보로 채웠는데, 그 폴백이 하한 인상과 상쇄돼
  // "형경"류가 다시 새어 나왔다(요약: PR #155 논의 참고). 폴백을 완전히
  // 없앴으니 통과 후보가 하나도 없으면(또는 적으면) 슬롯은 그냥 비어야
  // 하고, 미달 후보가 섞여 들어가면 안 된다.
  it("never backfills with under-threshold candidates, even when that leaves very few (or zero) results", () => {
    const thin = [
      place({ id: "weak-1", rating: 4.1, reviewCount: 5, category: "attraction" }),
      place({ id: "weak-2", rating: 4.9, reviewCount: 30, category: "attraction" }), // 평점 높아도 하한(40) 미달
    ];
    expect(applyQualityGate(thin, "overseas", "attraction")).toEqual([]);
  });

  it("never filters domestic candidates (no rating signal to gate on)", () => {
    const domestic = [place({ id: "d1", rating: undefined, reviewCount: undefined, category: "attraction" })];
    expect(applyQualityGate(domestic, "domestic", "attraction")).toHaveLength(1);
  });
});

// 오사카 3박4일 다일정 실측(5차)에서 발견 — 유니버설 스튜디오 재팬이
// 공항 출발일 "오전 명소" 슬롯에 1시간짜리로 배정됨 (GitHub issue #156).
describe("isLargeFacility", () => {
  it("flags Google Places primaryType values for day-consuming venues", () => {
    expect(isLargeFacility(place({ category: "amusement_park" }))).toBe(true); // 유니버설 스튜디오 재팬류
    expect(isLargeFacility(place({ category: "aquarium" }))).toBe(true); // 오사카 해유관류
    expect(isLargeFacility(place({ category: "zoo" }))).toBe(true);
    expect(isLargeFacility(place({ category: "water_park" }))).toBe(true);
  });

  it("is case-insensitive (Google may return the type in either case depending on the call site)", () => {
    expect(isLargeFacility(place({ category: "AMUSEMENT_PARK" }))).toBe(true);
  });

  it("does not flag ordinary attractions or a bare public park", () => {
    expect(isLargeFacility(place({ category: "tourist_attraction" }))).toBe(false);
    expect(isLargeFacility(place({ category: "park" }))).toBe(false); // 평범한 공원(예: 도톤보리바시) — 대형 시설이 아님
    expect(isLargeFacility(place({ category: "restaurant" }))).toBe(false);
  });

  it("handles Kakao's broad category strings (never flags them — Kakao doesn't have this granularity)", () => {
    expect(isLargeFacility(place({ category: "관광명소" }))).toBe(false);
  });
});

// 다일정 실측(오사카)에서 관찰 — 규카츠가 서로 다른 브랜드(모토무라/
// 요사쿠라)로 2번 나옴 (GitHub issue #157). cuisineKeyword 자체는
// "이름 → 종류" 추출만 하는 순수 함수 — 실제 감점 로직(cuisinePenalty)은
// courseRecommendV2.ts에 있어 여기선 안 다룬다(그쪽은 courseRoute.ts
// 등과 같은 이유로 orchestration이라 단위테스트 대상 밖).
describe("cuisineKeyword", () => {
  it("extracts a recognized cuisine keyword from a place name", () => {
    expect(cuisineKeyword("규카츠 모토무라 난바 분점")).toBe("규카츠");
    expect(cuisineKeyword("규카츠 요사쿠라 나가호리바시점")).toBe("규카츠");
    expect(cuisineKeyword("Gyumon Dotonbori 2nd")).toBeUndefined(); // 영문 표기엔 한글 키워드가 안 걸림 — 알려진 한계
  });

  it("returns undefined when the name carries no recognizable cuisine signal (most business names don't)", () => {
    expect(cuisineKeyword("우오신")).toBeUndefined();
    expect(cuisineKeyword("오사카 성")).toBeUndefined();
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
