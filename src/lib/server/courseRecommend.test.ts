import { afterEach, describe, expect, it, vi } from "vitest";
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
  isTravelAgency,
  isSpa,
  isBeach,
  isTransitFacility,
  isKoreanRestaurant,
  isLodging,
  cuisineKeyword,
  googleTop,
  THEME_LABELS,
  THEME_SLOTS,
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

// 작업지시서 2026-09-27 "해외 코스 후보가 2개로 무너졌습니다" A-1 —
// 실패를 조용히 빈 배열로 삼켜(status만 보고 return []) Vercel 로그에
// 아무것도 안 남는 바람에 고베 d2·교토 d1·오사카 d2가 왜 count=2로
// 무너졌는지 원인을 볼 수 없었다. 실패 시 상태코드·응답 본문을
// console.error로 남기도록 고쳤다 — 그 로그가 실제로 남는지 고정한다.
describe("googleTop — 실패 시 원인을 로그로 남긴다 (작업지시서 2026-09-27 A-1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns [] and logs status+body when Google Places rejects the request (예: 429 쿼터 초과, 403 키 권한 문제)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => '{"error":{"message":"Quota exceeded"}}' }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await googleTop("오사카 관광지", "test-key");

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("status=429"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Quota exceeded"));
  });

  it("still returns [] (never throws) even if reading the error body itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.reject(new Error("stream already read")),
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(googleTop("오사카 맛집", "test-key")).resolves.toEqual([]);
  });

  it("returns the parsed places on success (unchanged behavior)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ places: [{ id: "p1", displayName: { text: "오사카성" } }] }) }),
    );
    const result = await googleTop("오사카 관광지", "test-key");
    expect(result).toEqual([{ id: "p1", displayName: { text: "오사카성" } }]);
  });
});

// 작업지시서 2026-09-28 "새 기준선이 멀쩡한 도시를 떨어뜨립니다" §3 —
// 실측(세부 d3): 액티비티·해변·스파가 0곳, 음식점·관광지만 나왔다.
// 원인은 activity/relax 슬롯이 category:"attraction"을 그대로 써서
// Google 호출이 includedType="tourist_attraction"으로 강하게 제한되고
// (스파·투어업체가 배제됨), 검색어 뒤에도 "관광명소"가 붙었기 때문이다
// (fetchSlotCandidatesLive 주석 참고). 이 회귀가 되돌아오지 않도록
// resort 테마의 슬롯 구성을 고정한다.
describe("THEME_SLOTS.resort — activity/relax 슬롯은 category가 없어야 한다 (작업지시서 2026-09-28 §3)", () => {
  it("does not constrain activity/relax to the attraction Google type or append its label", () => {
    const activity = THEME_SLOTS.resort.find((s) => s.key === "activity");
    const relax = THEME_SLOTS.resort.find((s) => s.key === "relax");
    expect(activity?.category).toBeUndefined();
    expect(relax?.category).toBeUndefined();
  });

  it("keeps the dinner slot as a restaurant (unaffected by this fix)", () => {
    const dinner = THEME_SLOTS.resort.find((s) => s.key === "dinner");
    expect(dinner?.category).toBe("restaurant");
  });
});

// 작업지시서 2026-09-29 "세부 7일이 열렸는데, 여행사 사무실과 스파로
// 채워졌습니다" §3-② — activity 슬롯 검색어의 "투어"가 투어 업체를
// 부르는 원인으로 보여, 방문 대상을 가리키는 구체 명사로 바꿨다.
describe("THEME_SLOTS.resort — activity 슬롯 검색어에 '투어'가 없다 (작업지시서 2026-09-29 §3-②)", () => {
  it("no longer searches for '투어' (tour) — replaced with concrete beach/snorkeling nouns", () => {
    const activity = THEME_SLOTS.resort.find((s) => s.key === "activity");
    expect(activity?.keyword).not.toContain("투어");
    expect(activity?.keyword).toContain("해변");
  });
});

describe("isTravelAgency — 여행사 사무실 제외 (작업지시서 2026-09-29 §3-①)", () => {
  it("flags a place whose Google primaryType is travel_agency", () => {
    expect(isTravelAgency(place({ category: "travel_agency", name: "GEM Travels" }))).toBe(true);
  });

  it("flags a place whose name contains an English tour/travel word even with a different category", () => {
    expect(isTravelAgency(place({ category: "point_of_interest", name: "Cebu Daily Tours" }))).toBe(true);
    expect(isTravelAgency(place({ category: "point_of_interest", name: "Explore Cebu Tours & Travel" }))).toBe(true);
  });

  it("flags a place whose name contains 여행사", () => {
    expect(isTravelAgency(place({ category: "point_of_interest", name: "세부 홀리데이 여행사" }))).toBe(true);
  });

  it("does not flag an actual attraction or restaurant", () => {
    expect(isTravelAgency(place({ category: "tourist_attraction", name: "마젤란의 십자가" }))).toBe(false);
    expect(isTravelAgency(place({ category: "restaurant", name: "House of Lechon" }))).toBe(false);
  });
});

describe("isSpa — 휴양형 스파 상한 판정용 (작업지시서 2026-09-29 §3-③)", () => {
  it("flags a place by Google primaryType spa", () => {
    expect(isSpa(place({ category: "spa", name: "Cheeva Spa" }))).toBe(true);
  });

  it("flags a place by name even without a spa category", () => {
    expect(isSpa(place({ category: "point_of_interest", name: "Thai Royale Spa Cebu City Branch" }))).toBe(true);
    expect(isSpa(place({ category: "point_of_interest", name: "피톤치드 spa" }))).toBe(true);
  });

  it("does not flag an unrelated place", () => {
    expect(isSpa(place({ category: "restaurant", name: "Cabana Restaurant" }))).toBe(false);
  });
});

describe("isBeach — 휴양형 해변 보장 판정용 (작업지시서 2026-09-29 §3-④)", () => {
  it("flags a place by Google primaryType beach", () => {
    expect(isBeach(place({ category: "beach", name: "화이트 비치" }))).toBe(true);
  });

  it("flags a place by name even without a beach category", () => {
    expect(isBeach(place({ category: "point_of_interest", name: "막탄 해변" }))).toBe(true);
  });

  it("does not flag an unrelated place", () => {
    expect(isBeach(place({ category: "restaurant", name: "Cabana Restaurant" }))).toBe(false);
  });
});

// 작업지시서 2026-09-29 "#276 검증: 여행사는 빠졌고, 공항이 방문지로
// 들어갑니다" §2 — 해변/리조트 권역 검색이 공항을 함께 돌려줘, 세부
// 2박3일 2일차에 "막탄 세부 국제공항"이 방문지로 들어간 실측이 있었다.
describe("isTransitFacility — 공항·교통 시설 제외 (작업지시서 2026-09-29 '#276 검증' §2)", () => {
  it("flags a place by Google primaryType (airport, bus/train/transit station)", () => {
    expect(isTransitFacility(place({ category: "airport", name: "막탄 세부 국제공항" }))).toBe(true);
    expect(isTransitFacility(place({ category: "international_airport", name: "Mactan-Cebu International Airport" }))).toBe(true);
    expect(isTransitFacility(place({ category: "bus_station", name: "동부시외버스터미널" }))).toBe(true);
    expect(isTransitFacility(place({ category: "train_station", name: "Cebu Station" }))).toBe(true);
  });

  it("flags a place by name even without a matching category", () => {
    expect(isTransitFacility(place({ category: "point_of_interest", name: "Mactan-Cebu International Airport" }))).toBe(true);
    expect(isTransitFacility(place({ category: "point_of_interest", name: "센트럴 터미널" }))).toBe(true);
  });

  it("does not flag an actual attraction, restaurant, or beach", () => {
    expect(isTransitFacility(place({ category: "beach", name: "막탄 해변" }))).toBe(false);
    expect(isTransitFacility(place({ category: "restaurant", name: "House of Lechon" }))).toBe(false);
  });

  // 지시서 §2 — "페리 선착장은 호핑 출발지일 수 있으니 이번엔 건드리지
  // 마세요": ferry_terminal 타입이나 "선착장"/"페리" 이름은 걸리지 않아야 한다.
  it("does not flag a ferry pier by type or by name unless it says 터미널/airport/공항", () => {
    expect(isTransitFacility(place({ category: "ferry_terminal", name: "카오하간 선착장" }))).toBe(false);
  });
});

describe("isKoreanRestaurant — 해외 코스 한식당 상한 판정용 (작업지시서 2026-09-29 '#276 검증' §4)", () => {
  it("flags a place by Google primaryType korean_restaurant", () => {
    expect(isKoreanRestaurant(place({ category: "korean_restaurant", name: "88식당 88 korean restaurant" }))).toBe(true);
  });

  it("flags a place by name even without that category", () => {
    expect(isKoreanRestaurant(place({ category: "restaurant", name: "Da-In Korean Restaurant" }))).toBe(true);
    expect(isKoreanRestaurant(place({ category: "restaurant", name: "한식당 소반" }))).toBe(true);
  });

  it("does not flag a local (non-Korean) restaurant", () => {
    expect(isKoreanRestaurant(place({ category: "restaurant", name: "House of Lechon" }))).toBe(false);
  });
});

// 작업지시서 2026-09-29 "#277 검증: 세 가지는 됐고, 7일 코스에서 해변이
// 사라졌습니다" §3-② — 스파를 갖춘 호텔("웰컴 호텔")이 "스파 마사지"
// 검색에 걸려 두 번째 숙소로 들어간 실측이 있었다. 이름 패턴은 쓰지
// 않는다 — 호텔 이름이 너무 다양해 오탐 위험이 크다고 판단.
describe("isLodging — 휴양형 숙소 1곳 캡 판정용 (작업지시서 2026-09-29 '#277 검증' §3-②)", () => {
  it("flags a place by Google primaryType (hotel/lodging/resort_hotel/motel/etc.)", () => {
    expect(isLodging(place({ category: "hotel", name: "웰컴 호텔" }))).toBe(true);
    expect(isLodging(place({ category: "lodging", name: "샹그릴라 막탄 세부" }))).toBe(true);
    expect(isLodging(place({ category: "resort_hotel", name: "어떤 리조트" }))).toBe(true);
  });

  it("does not flag a place by name alone — only Google's type is trusted", () => {
    expect(isLodging(place({ category: "restaurant", name: "OO 호텔 레스토랑" }))).toBe(false);
  });

  it("does not flag an unrelated place", () => {
    expect(isLodging(place({ category: "spa", name: "Cheeva Spa" }))).toBe(false);
  });
});
