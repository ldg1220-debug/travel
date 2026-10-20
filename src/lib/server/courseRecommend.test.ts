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
  isBeachByName,
  isIsland,
  isJetty,
  isNonAttractionVenue,
  isPier,
  isRegionItself,
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

// 작업지시서 2026-10-20 "평점은 장소를 눌렀을 때만" §1② — 품질 게이트에서 평점·리뷰 수 조건을 뺐다. 관광과 무관한 시설 유형만 거른다.
describe("passesQualityGate", () => {
  it("always passes domestic (Kakao Local never provides rating/reviews)", () => {
    expect(passesQualityGate(place({ rating: undefined, reviewCount: undefined }), "domestic")).toBe(true);
    expect(passesQualityGate(place({ rating: undefined, reviewCount: undefined }), "domestic", "restaurant")).toBe(true);
  });

  it("평점·리뷰 수가 없어도 해외 후보를 떨어뜨리지 않는다(코스 후보는 평점을 받지 않는다)", () => {
    expect(passesQualityGate(place({ rating: undefined, reviewCount: undefined }), "overseas")).toBe(true);
    expect(passesQualityGate(place({ rating: undefined, reviewCount: undefined, category: "restaurant" }), "overseas", "restaurant")).toBe(true);
    expect(passesQualityGate(place({ rating: 3.1, reviewCount: 1, category: "attraction" }), "overseas", "attraction")).toBe(true); // 값이 있어도 보지 않는다
  });

  it("관광과 무관한 시설 유형(은행·주유소·병원·학교 등)은 해외에서 뺀다", () => {
    for (const category of ["bank", "gas_station", "hospital", "school", "parking", "atm"]) {
      expect(passesQualityGate(place({ category }), "overseas")).toBe(false);
    }
    expect(passesQualityGate(place({ category: "tourist_attraction" }), "overseas", "attraction")).toBe(true);
    expect(passesQualityGate(place({ category: "restaurant" }), "overseas", "restaurant")).toBe(true);
  });
});

describe("applyQualityGate", () => {
  it("관광과 무관한 시설만 걸러내고 나머지는 순서 그대로 둔다", () => {
    const mixed = [
      place({ id: "a", category: "tourist_attraction" }),
      place({ id: "bank", category: "bank" }),
      place({ id: "b", category: "museum" }),
    ];
    expect(applyQualityGate(mixed, "overseas", "attraction").map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("never filters domestic candidates (no rating signal to gate on)", () => {
    const domestic = [place({ id: "d1", rating: undefined, reviewCount: undefined, category: "attraction" })];
    expect(applyQualityGate(domestic, "domestic", "attraction")).toHaveLength(1);
  });
});

// 오사카 3박4일 다일정 실측(5차)에서 발견 — 유니버설 스튜디오 재팬이
// 공항 출발일 "오전 명소" 슬롯에 1시간짜리로 배정됨 (GitHub issue #156).
describe("isLargeFacility", () => {
  // 작업지시서 2026-10-07 "#297 검증" §2 — 종일시설 = (이름 사전 일치) OR (테마파크 타입 AND 리뷰 3만 이상).
  it("flags theme-park types when they are big (30k+ reviews)", () => {
    expect(isLargeFacility(place({ category: "amusement_park", reviewCount: 90000 }))).toBe(true); // 유니버설 스튜디오 재팬류
    expect(isLargeFacility(place({ category: "water_park", reviewCount: 50000 }))).toBe(true);
    expect(isLargeFacility(place({ category: "theme_park", reviewCount: 30000 }))).toBe(true);
  });

  it("flags a known all-day theme park by name even with few reviews (USJ · 에버랜드 · 디즈니씨)", () => {
    expect(isLargeFacility(place({ category: "amusement_park", name: "유니버설 스튜디오 재팬" }))).toBe(true);
    expect(isLargeFacility(place({ category: "amusement_park", name: "Everland" }))).toBe(true);
    expect(isLargeFacility(place({ category: "amusement_park", name: "도쿄 디즈니씨", reviewCount: 500 }))).toBe(true);
  });

  // 작업지시서 2026-10-07 "#296 검증" §2 — 수족관·동물원은 2~3시간·반나절이라 종일시설이 아니다.
  it("does not flag aquariums or zoos, however many reviews they have (해유관 · SEA LIFE · 타롱가)", () => {
    expect(isLargeFacility(place({ category: "aquarium", name: "오사카 해유관", reviewCount: 70000 }))).toBe(false);
    expect(isLargeFacility(place({ category: "aquarium", name: "SEA LIFE Sydney Aquarium", reviewCount: 40000 }))).toBe(false);
    expect(isLargeFacility(place({ category: "zoo", name: "Taronga Zoo Sydney", reviewCount: 50000 }))).toBe(false);
    expect(isLargeFacility(place({ category: "amusement_center", name: "Game Center", reviewCount: 90000 }))).toBe(false);
  });

  it("does not flag a small attraction with a facility type (시로이코이비토 파크 — 1~2시간 견학)", () => {
    expect(isLargeFacility(place({ category: "amusement_park", name: "시로이코이비토 파크", reviewCount: 16000 }))).toBe(false);
    expect(isLargeFacility(place({ category: "zoo", name: "Small Petting Zoo", reviewCount: 29999 }))).toBe(false);
    expect(isLargeFacility(place({ category: "amusement_park" }))).toBe(false); // 리뷰 수도 이름 사전도 없다
  });

  // 작업지시서 2026-10-07 "#297 검증" §2 — 이름 사전은 타입과 무관하게 인정한다(#297에서 타입 AND로 묶었더니
  // USJ·디즈니랜드의 Google 타입이 테마파크 타입이 아닐 때 시설에서 빠졌다). 실제 응답의 타입 값은 아직
  // 확인하지 못해, 가능한 값을 모두 넣어 둔다.
  it.each(["amusement_park", "theme_park", "tourist_attraction", "point_of_interest", "establishment", "park", "event_venue", ""])(
    "recognizes USJ and Tokyo Disneyland by name whatever the Google type is (%s)",
    (category) => {
      expect(isLargeFacility(place({ category, name: "유니버설 스튜디오 재팬", reviewCount: 120 }))).toBe(true);
      expect(isLargeFacility(place({ category, name: "Universal Studios Japan", reviewCount: 120 }))).toBe(true);
      expect(isLargeFacility(place({ category, name: "도쿄 디즈니랜드", reviewCount: 120 }))).toBe(true);
      expect(isLargeFacility(place({ category, name: "Tokyo DisneySea", reviewCount: 120 }))).toBe(true);
    },
  );

  it("does not treat side businesses of a dictionary name as the park (스토어 · 호텔 · 타워 · 몰 · 아쿠아리움 · 시티워크)", () => {
    for (const [category, name] of [
      ["store", "디즈니 스토어"],
      ["tourist_attraction", "Disney Store Shibuya"],
      ["shopping_mall", "롯데월드몰"],
      ["tourist_attraction", "롯데월드타워 서울스카이"],
      ["lodging", "도쿄 디즈니랜드 호텔"],
      ["tourist_attraction", "Disney Ambassador Hotel"],
      ["tourist_attraction", "롯데월드 아쿠아리움"],
      ["shopping_mall", "유니버설 시티워크 오사카"],
      ["cafe", "유니버설 카페"],
      ["restaurant", "Universal Studios Restaurant"],
    ] as const) {
      expect(isLargeFacility(place({ category, name })), `${category} ${name}`).toBe(false);
    }
  });

  it("recognizes domestic parks (Kakao broad category) by the dictionary, but not a broad category alone", () => {
    expect(isLargeFacility(place({ category: "관광명소", name: "에버랜드" }))).toBe(true);
    expect(isLargeFacility(place({ category: "관광명소", name: "롯데월드 어드벤처" }))).toBe(true);
    expect(isLargeFacility(place({ category: "관광명소", name: "경복궁" }))).toBe(false);
  });

  it("never treats an aquarium or zoo as a facility, even with a dictionary name", () => {
    expect(isLargeFacility(place({ category: "aquarium", name: "Universal Aquarium", reviewCount: 90000 }))).toBe(false);
    expect(isLargeFacility(place({ category: "zoo", name: "Disney Animal Zoo", reviewCount: 90000 }))).toBe(false);
  });

  it("is case-insensitive (Google may return the type in either case depending on the call site)", () => {
    expect(isLargeFacility(place({ category: "AMUSEMENT_PARK", reviewCount: 90000 }))).toBe(true);
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
    expect(result).toEqual([{ id: "p1", displayName: { text: "오사카성" }, searchRank: 0 }]);
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

describe("isTravelAgency — 한글 투어 업체 (작업지시서 2026-10-06 '#293 검증' §2)", () => {
  it("catches Korean tour operators (한바다호핑투어 · 세부 시티투어 · 트래블)", () => {
    for (const name of ["한바다호핑투어", "세부 시티투어", "현지 트래블", "Cebu 호핑 투어"]) {
      expect(isTravelAgency(place({ category: "point_of_interest", name }))).toBe(true);
    }
  });

  it("does not drop a ferry terminal or marina just because its name says 투어, nor ordinary spots", () => {
    expect(isTravelAgency(place({ category: "ferry_terminal", name: "호핑 투어 선착장" }))).toBe(false);
    expect(isTravelAgency(place({ category: "marina", name: "Star Marina" }))).toBe(false);
    expect(isTravelAgency(place({ category: "tourist_attraction", name: "카와산 폭포" }))).toBe(false);
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

  // 작업지시서 2026-09-29 "#280 검증" §2 — 코타키나발루(말레이)·발리(인도네시아)의
  // "Pantai", 제주의 "해수욕장" 등 이름 판정이 놓치던 어휘.
  it("recognizes other-language words for beach (Pantai, 해수욕장, ビーチ, Bãi biển)", () => {
    expect(isBeach(place({ category: "tourist_attraction", name: "Pantai Tanjung Aru" }))).toBe(true);
    expect(isBeach(place({ category: "tourist_attraction", name: "협재해수욕장" }))).toBe(true);
    expect(isBeach(place({ category: "tourist_attraction", name: "宮古ビーチ" }))).toBe(true);
    expect(isBeach(place({ category: "tourist_attraction", name: "Bãi biển Mỹ Khê" }))).toBe(true);
  });

  it("does not count a hotel/restaurant/café/spa just because its name says beach", () => {
    expect(isBeach(place({ category: "resort_hotel", name: "Beach Resort & Hotel" }))).toBe(false);
    expect(isBeach(place({ category: "seafood_restaurant", name: "Pantai Seafood Restaurant" }))).toBe(false);
    expect(isBeach(place({ category: "cafe", name: "Beach Cafe" }))).toBe(false);
    // 최종 스팟의 한글 버킷(liveCategoryBucket)도 같은 기준
    expect(isBeach({ category: "음식점", name: "비치 레스토랑" })).toBe(false);
    expect(isBeach({ category: "숙소", name: "비치 호텔" })).toBe(false);
  });

  it("trusts Google's beach type even when the name has no beach word (섬 이름 등)", () => {
    expect(isBeach(place({ category: "beach", name: "Caohagan Island" }))).toBe(true);
  });
});

// 작업지시서 2026-09-29 "#281 검증: 코타키나발루가 열렸습니다. 휴양지에도
// 대표 명소를" §2② — 섬은 배로만 가 도로 경로가 없어 라우팅에서 빠졌다.
describe("isIsland — 섬 판정 (작업지시서 2026-09-29 '#281 검증' §2②)", () => {
  it("trusts Google's island type", () => {
    expect(isIsland(place({ category: "island", name: "Manukan" }))).toBe(true);
  });

  it("recognizes island words in the name (섬, Island, Pulau)", () => {
    expect(isIsland(place({ category: "tourist_attraction", name: "마누칸 섬" }))).toBe(true);
    expect(isIsland(place({ category: "tourist_attraction", name: "사피 섬(툰쿠 압둘 라만 해양공원)" }))).toBe(true);
    expect(isIsland(place({ category: "tourist_attraction", name: "Caohagan Island" }))).toBe(true);
    expect(isIsland(place({ category: "tourist_attraction", name: "Pulau Gaya" }))).toBe(true);
  });

  it("does not count a restaurant/hotel just because its name says island, nor unrelated words", () => {
    expect(isIsland(place({ category: "seafood_restaurant", name: "Island Grill" }))).toBe(false);
    expect(isIsland(place({ category: "resort_hotel", name: "Gaya Island Resort" }))).toBe(false);
    expect(isIsland(place({ category: "tourist_attraction", name: "섬유박물관" }))).toBe(false);
    expect(isIsland(place({ category: "tourist_attraction", name: "사바 주립 모스크" }))).toBe(false);
  });
});

describe("isNonAttractionVenue — 식당·숙소·카페·스파 등 명소가 아닌 시설", () => {
  it("flags venue types and Korean buckets", () => {
    expect(isNonAttractionVenue({ category: "restaurant" })).toBe(true);
    expect(isNonAttractionVenue({ category: "resort_hotel" })).toBe(true);
    expect(isNonAttractionVenue({ category: "spa" })).toBe(true);
    expect(isNonAttractionVenue({ category: "음식점" })).toBe(true);
  });

  it("does not flag attractions or a missing category", () => {
    expect(isNonAttractionVenue({ category: "tourist_attraction" })).toBe(false);
    expect(isNonAttractionVenue({ category: "island" })).toBe(false);
    expect(isNonAttractionVenue({})).toBe(false);
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

// 작업지시서 2026-09-29 "#283 검증" §2 — 배는 선착장에서 탄다. 선착장이
// 섬 앞에 끼워질 후보가 되려면 공항·버스터미널 제외 규칙에 걸리면 안 된다.
describe("isJetty — 섬 앞 선착장 판정 (작업지시서 2026-09-29 '#283 검증' §2)", () => {
  it("recognizes ferry terminals/marinas by type and jetties by name", () => {
    expect(isJetty(place({ category: "ferry_terminal", name: "Jesselton Point" }))).toBe(true);
    expect(isJetty(place({ category: "marina", name: "Star Marina" }))).toBe(true);
    expect(isJetty(place({ category: "tourist_attraction", name: "제셀톤 선착장" }))).toBe(true);
    expect(isJetty(place({ category: "tourist_attraction", name: "Jesselton Ferry Terminal" }))).toBe(true);
    expect(isJetty(place({ category: "tourist_attraction", name: "Hilutungan Jetty" }))).toBe(true);
  });

  it("does not count a restaurant/hotel just because its name says jetty, nor unrelated words", () => {
    expect(isJetty(place({ category: "restaurant", name: "Jetty Seafood Restaurant" }))).toBe(false);
    expect(isJetty(place({ category: "tourist_attraction", name: "Pierre Museum" }))).toBe(false);
    expect(isJetty(place({ category: "tourist_attraction", name: "사바 주립 모스크" }))).toBe(false);
  });
});

describe("isPier — marina를 뺀 선착장 (작업지시서 2026-09-29 '#284 검증' §2)", () => {
  it("is a jetty that is not a marina", () => {
    expect(isPier(place({ category: "ferry_terminal", name: "제셀톤 선착장" }))).toBe(true);
    expect(isPier(place({ category: "tourist_attraction", name: "Jesselton Ferry Terminal" }))).toBe(true);
  });

  it("excludes marinas (지시서 목록 jetty/선착장/ferry terminal/pier에 없다)", () => {
    expect(isPier(place({ category: "marina", name: "Star Marina" }))).toBe(false);
    expect(isPier(place({ category: "tourist_attraction", name: "Sutera Harbour Marina" }))).toBe(false);
  });
});

// 작업지시서 2026-09-29 "#285 검증: 세부에서 '세부 섬'으로 배를 탑니다" §2 —
// 구글이 섬 전체(세부 섬 ★4.5·리뷰 1,746)를 하나의 장소로 돌려줘 섬 앵커·배 구간·
// 선착장 삽입 규칙을 전부 탔다.
describe("isRegionItself — 지역 자체는 스팟이 아니다 (작업지시서 2026-09-29 '#285 검증' §2)", () => {
  it("excludes the region itself in Korean and English (세부 섬 · Cebu · Cebu Island · Cebu City)", () => {
    for (const name of ["세부", "세부 섬", "세부섬", "Cebu", "Cebu Island", "Cebu City", "세부 시티", "CEBU ISLAND"]) {
      expect(isRegionItself(place({ category: "tourist_attraction", name }), "세부")).toBe(true);
    }
  });

  it("matches a name with the other-language spelling in parentheses, and a nativeName", () => {
    expect(isRegionItself(place({ name: "세부 섬 (Cebu Island)" }), "세부")).toBe(true);
    expect(isRegionItself(place({ name: "Some Localized Name", nativeName: "Cebu Island" }), "세부")).toBe(true);
  });

  it("excludes the larger area the region belongs to (제주도 · Jeju Island for 서귀포, 발리 · Bali for 우붓)", () => {
    expect(isRegionItself(place({ name: "제주도" }), "서귀포")).toBe(true);
    expect(isRegionItself(place({ name: "Jeju Island" }), "서귀포")).toBe(true);
    expect(isRegionItself(place({ name: "Bali" }), "우붓")).toBe(true);
    expect(isRegionItself(place({ name: "발리 섬" }), "발리")).toBe(true); // 별칭으로 들어와도
  });

  it("excludes area-type places (locality/administrative area) regardless of name", () => {
    expect(isRegionItself(place({ category: "locality", name: "Lapu-Lapu City" }), "세부")).toBe(true);
    expect(isRegionItself(place({ category: "administrative_area_level_1", name: "Central Visayas" }), "세부")).toBe(true);
  });

  it("keeps a real attached island and ordinary spots (Caohagan · Sapi · Cebu Taoist Temple)", () => {
    expect(isRegionItself(place({ category: "island", name: "Caohagan Island" }), "세부")).toBe(false);
    expect(isRegionItself(place({ category: "island", name: "사피 섬" }), "코타키나발루")).toBe(false);
    expect(isRegionItself(place({ category: "place_of_worship", name: "Cebu Taoist Temple" }), "세부")).toBe(false);
    expect(isRegionItself(place({ category: "tourist_attraction", name: "세부 시티 갤러리" }), "세부")).toBe(false);
  });
});

describe("isRegionItself — 오사카성 류·구역 타입 방문지는 남긴다 (작업지시서 2026-09-30 '#290 검증' §3)", () => {
  it("keeps places whose name merely starts with the region name (오사카성 · 오사카 수족관 가이유칸 · 오사카역)", () => {
    for (const name of ["오사카성", "오사카 수족관 가이유칸", "오사카역", "Osaka Castle", "Osaka Aquarium Kaiyukan"]) {
      expect(isRegionItself(place({ category: "tourist_attraction", name }), "오사카")).toBe(false);
    }
  });

  it("keeps a famous landmark of another city (시드니 오페라 하우스 · Sydney Opera House)", () => {
    expect(isRegionItself(place({ category: "tourist_attraction", name: "시드니 오페라 하우스" }), "시드니")).toBe(false);
    expect(isRegionItself(place({ category: "performing_arts_theater", name: "Sydney Opera House" }), "시드니")).toBe(false);
  });

  it("still excludes the region itself and city-level admin types (세부 섬 · 오사카시 · Osaka locality)", () => {
    expect(isRegionItself(place({ name: "세부 섬" }), "세부")).toBe(true);
    expect(isRegionItself(place({ name: "오사카시" }), "오사카")).toBe(true);
    expect(isRegionItself(place({ category: "locality", name: "Osaka" }), "오사카")).toBe(true);
  });

  it("keeps a neighborhood-typed spot (난바·우메다 as sublocality/colloquial_area) but drops one named after the region", () => {
    expect(isRegionItself(place({ category: "sublocality", name: "우메다" }), "오사카")).toBe(false);
    expect(isRegionItself(place({ category: "colloquial_area", name: "난바" }), "오사카")).toBe(false);
    expect(isRegionItself(place({ category: "colloquial_area", name: "오사카 시내" }), "오사카")).toBe(true);
  });
});

describe("isTransitFacility — 페리 선착장은 제외하지 않는다 (작업지시서 2026-09-29 '#283 검증' §2)", () => {
  it("keeps a ferry terminal whose name contains 'terminal' out of the transit filter", () => {
    expect(isTransitFacility(place({ category: "tourist_attraction", name: "Jesselton Ferry Terminal" }))).toBe(false);
    expect(isTransitFacility(place({ category: "ferry_terminal", name: "세부 여객 터미널" }))).toBe(false);
  });

  it("still filters real airports and bus terminals", () => {
    expect(isTransitFacility(place({ category: "point_of_interest", name: "Kota Kinabalu International Airport" }))).toBe(true);
    expect(isTransitFacility(place({ category: "point_of_interest", name: "Bus Terminal" }))).toBe(true);
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

  // 작업지시서 2026-10-06 "#294 검증" §3
  it("flags a generic restaurant whose name has Hangul (Unclejack 엉클잭하우스 — 세부의 한인 식당)", () => {
    expect(isKoreanRestaurant(place({ category: "restaurant", name: "Unclejack 엉클잭하우스" }))).toBe(true);
    expect(isKoreanRestaurant(place({ category: "restaurant", name: "풍류정" }))).toBe(true);
  });

  it("does not flag a cuisine-specific restaurant or a non-restaurant just because the name has Hangul (ko-localized names)", () => {
    expect(isKoreanRestaurant(place({ category: "seafood_restaurant", name: "란타우 플로팅 네이티브 레스토랑" }))).toBe(false);
    expect(isKoreanRestaurant(place({ category: "tourist_attraction", name: "산 페드로 요새" }))).toBe(false);
  });
});

// 작업지시서 2026-09-29 "#277 검증: 세 가지는 됐고, 7일 코스에서 해변이
// 사라졌습니다" §3-② — 스파를 갖춘 호텔("웰컴 호텔")이 "스파 마사지"
// 검색에 걸려 두 번째 숙소로 들어간 실측이 있었다. 이름 패턴은 쓰지
// 않는다 — 호텔 이름이 너무 다양해 오탐 위험이 크다고 판단.
describe("isLodging — 이름 패턴 (작업지시서 2026-10-06 '#293 검증' §3)", () => {
  it("catches guest houses / hostels / hotels whose primaryType is not a lodging type", () => {
    for (const name of ["세부 게스트하우스", "Cebu Guest House", "Mactan Hostel", "웰컴 호텔", "Grand Hotel"]) {
      expect(isLodging(place({ category: "point_of_interest", name }))).toBe(true);
    }
  });

  it("does not catch a restaurant or spa inside a hotel, nor ordinary attractions", () => {
    expect(isLodging(place({ category: "restaurant", name: "Grand Hotel Buffet" }))).toBe(false);
    expect(isLodging(place({ category: "spa", name: "Shangri-La Hotel Spa" }))).toBe(false);
    expect(isLodging(place({ category: "tourist_attraction", name: "레아신전" }))).toBe(false);
  });
});

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

// 작업지시서 2026-10-13 "새 대표 일수 코스 점검" §1 — 괌 4일: 식당·디너쇼가 해변·섬으로, 해변이 공원으로.
describe("섬·해변 판정 — 식음료·공연 시설 제외, 이름 끝 일치 (2026-10-13 §1)", () => {
  it("식당·바·디너쇼는 이름에 Beach/Island/비치가 있어도 해변·섬이 아니다", () => {
    expect(isBeach(place({ category: "restaurant", name: "괌 더비치 바 레스토랑" }))).toBe(false);
    expect(isBeach(place({ category: "tourist_attraction", name: "괌 더비치 바 레스토랑" }))).toBe(false); // primaryType 을 몰라도 이름의 식음료 표지
    expect(isIsland(place({ category: "event_venue", name: "Fish Eye Island Cultural Dinner Show" }))).toBe(false);
    expect(isIsland(place({ category: "tourist_attraction", name: "Fish Eye Island Cultural Dinner Show" }))).toBe(false);
    expect(isIsland(place({ category: "bar_and_grill", name: "Gaya Island Grill" }))).toBe(false);
  });
  it("섬은 이름이 섬/Island 로 끝나거나 Pulau·Isla 로 시작할 때만 — 중간의 Island 는 아니다", () => {
    expect(isIsland(place({ category: "tourist_attraction", name: "사피 섬" }))).toBe(true);
    expect(isIsland(place({ category: "tourist_attraction", name: "Sapi Island" }))).toBe(true);
    expect(isIsland(place({ category: "tourist_attraction", name: "마누칸 섬 (Pulau Manukan)" }))).toBe(true);
    expect(isIsland(place({ category: "tourist_attraction", name: "Pulau Sapi" }))).toBe(true);
    expect(isIsland(place({ category: "island", name: "아무 이름" }))).toBe(true);
    expect(isIsland(place({ category: "tourist_attraction", name: "Island Hopping Tour Center" }))).toBe(false);
    expect(isIsland(place({ category: "tourist_attraction", name: "섬마을 공원" }))).toBe(false);
  });
  it("이름이 해변·Beach·비치로 끝나면(괄호 표기 포함) primaryType 이 park 여도 해변", () => {
    expect(isBeach(place({ category: "park", name: "이파오 해변(스노클링)" }))).toBe(true);
    expect(isBeach(place({ category: "park", name: "탄중 리팟 해변" }))).toBe(true);
    expect(isBeach(place({ category: "park", name: "Tanjung Aru Beach" }))).toBe(true);
    expect(isBeach(place({ category: "nature_preserve", name: "리티디안 포인트" }))).toBe(true);
    expect(isBeachByName(place({ category: "restaurant", name: "Sunset Beach" }))).toBe(false);
  });
});

describe("isLargeFacility — 캐리비안 베이 (2026-10-13 §4)", () => {
  it("캐리비안 베이는 타입·리뷰 수와 무관하게 종일시설", () => {
    expect(isLargeFacility({ category: "tourist_attraction", name: "캐리비안 베이" })).toBe(true);
    expect(isLargeFacility({ name: "캐리비안베이" })).toBe(true);
    expect(isLargeFacility({ category: "restaurant", name: "캐리비안 베이 푸드코트 레스토랑" })).toBe(false);
  });
});

// 작업지시서 2026-10-20 "평점은 장소를 눌렀을 때만" — 후보 검색은 항상 Pro 필드(평점 없음), 영업 중이 아닌 곳은 빼고 응답 순서를 순위로 단다.
describe("googleTop — Pro 필드 · 영업 상태 · 순위", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("평점 필드(rating · userRatingCount · priceLevel)를 요청하지 않는다 — Enterprise 한도와 무관하게", async () => {
    vi.stubEnv("MAPS_BUDGET_OVERRIDE", '{"text-enterprise":0}');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ places: [{ id: "p1", displayName: { text: "오사카성" } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await googleTop("오사카 관광지", "test-key");
    const mask = (fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers["X-Goog-FieldMask"];
    expect(mask).not.toMatch(/rating|userRatingCount|priceLevel/i);
    expect(mask).toContain("places.businessStatus");
    expect(result).toEqual([{ id: "p1", displayName: { text: "오사카성" }, searchRank: 0 }]);
  });

  it("OPERATIONAL 이 아닌 후보는 빼고(상태가 없으면 둔다), 순위는 응답 안의 원래 위치다", async () => {
    const places = [
      { id: "a", businessStatus: "OPERATIONAL" },
      { id: "closed", businessStatus: "CLOSED_PERMANENTLY" },
      { id: "temp", businessStatus: "CLOSED_TEMPORARILY" },
      { id: "nostatus" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ places }) }));
    const result = await googleTop("오사카 관광지", "test-key");
    expect(result.map((p) => [p.id, p.searchRank])).toEqual([["a", 0], ["nostatus", 3]]);
  });
});
