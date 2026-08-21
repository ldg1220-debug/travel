import { describe, it, expect } from "vitest";
import { bookingProviders, isLodging } from "./affiliates";

// bookingProviders reads affiliate ids from process.env.NEXT_PUBLIC_* at
// module load time — none of these are set in this test process (see
// .env, all blank), so every real OTA is "unapproved" here and gets
// filtered out (PR #203 policy: no id → not shown). That's actually a
// useful, deterministic baseline: it lets these tests assert on exactly
// the parts that don't depend on approval state — the campground gate and
// the 트립닷컴 cityId gate (작업지시서 2026-08-14, "트립닷컴 제휴 링크 형식
// 오류") — without needing to mock env vars. Since 트립닷컴 itself never
// survives the isAffiliate filter here regardless of gating, these tests
// only ever observe it indirectly through whether the non-affiliate Naver
// fallback got added in its place.
describe("bookingProviders", () => {
  it("returns nothing for an ordinary lodging in a mapped city (트립닷컴 is the only unresolved reason, no fallback needed)", () => {
    // "서울" is in the TRIP_COM_CITY_IDS seed — 트립닷컴 would be usable
    // here if approved, so no Naver fallback is added just because it
    // isn't approved yet (that's a separate, silent state — see PR #203).
    expect(bookingProviders("어느 호텔", "domestic", "서울")).toEqual([]);
  });

  it("falls back to Naver when the city can't be resolved to a 트립닷컴 cityId at all", () => {
    // No city/address hint given — resolveTripComCity has nothing to match against.
    const providers = bookingProviders("어느 호텔", "domestic");
    expect(providers).toEqual([expect.objectContaining({ key: "naver", isAffiliate: false })]);
  });

  it("falls back to Naver for an unmapped city like 김해 (작업지시서 실측 사례 — 서울 롯데호텔조차 city 파라미터 없이는 0건)", () => {
    const providers = bookingProviders("롯데호텔앤리조트", "domestic", "김해");
    expect(providers).toEqual([expect.objectContaining({ key: "naver", isAffiliate: false })]);
  });

  it("resolves a mapped city from the address hint alone, not just placeName/city", () => {
    // place.name/city 둘 다 도시명을 안 담고 있어도 address에 있으면 매칭돼야 한다.
    const providers = bookingProviders("헤리티지호텔", "domestic", undefined, undefined, "서울특별시 강남구 ...");
    // "서울"이 매칭되므로 트립닷컴은 (미승인이라) 안 뜨지만 그 이유가
    // cityId 미매핑이 아니므로 Naver 폴백도 필요 없다.
    expect(providers).toEqual([]);
  });

  it("hides 트립닷컴 and adds a non-affiliate Naver fallback for a campground-name lodging, even in a mapped city (작업지시서 2026-08-14, '더숨포레스트' 사례)", () => {
    const providers = bookingProviders("더숨포레스트 카라반", "domestic", "서울");
    expect(providers.some((p) => p.key === "trip")).toBe(false);
    expect(providers).toEqual([expect.objectContaining({ key: "naver", isAffiliate: false })]);
  });

  it("hides 트립닷컴 for a Google campground category even when the name doesn't hint at it", () => {
    const providers = bookingProviders("스카이뷰 리조트", "international", "오사카", "campground");
    expect(providers.some((p) => p.key === "trip")).toBe(false);
    expect(providers.some((p) => p.key === "naver")).toBe(true);
  });
});

describe("isLodging", () => {
  it("matches common English and Korean lodging categories", () => {
    expect(isLodging("hotel")).toBe(true);
    expect(isLodging("campground")).toBe(true);
    expect(isLodging("숙박")).toBe(true);
    expect(isLodging("restaurant")).toBe(false);
  });
});
