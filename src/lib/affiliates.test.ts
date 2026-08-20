import { describe, it, expect } from "vitest";
import { bookingProviders, isLodging } from "./affiliates";

// bookingProviders reads affiliate ids from process.env.NEXT_PUBLIC_* at
// module load time — none of these are set in this test process (see
// .env, all blank), so every real OTA is "unapproved" here and gets
// filtered out (PR #203 policy: no id → not shown). That's actually a
// useful, deterministic baseline: it lets these tests assert on exactly
// the two things that don't depend on approval state — the campground
// gate hiding 트립닷컴 and adding the non-affiliate Naver fallback —
// without needing to mock env vars.
describe("bookingProviders", () => {
  it("returns nothing for an ordinary lodging when no program is approved", () => {
    expect(bookingProviders("어느 호텔", "domestic")).toEqual([]);
    expect(bookingProviders("어느 호텔", "international")).toEqual([]);
  });

  it("hides 트립닷컴 and adds a non-affiliate Naver fallback for a campground-name lodging (작업지시서 2026-08-14, '더숨포레스트' 사례)", () => {
    const providers = bookingProviders("더숨포레스트 카라반", "domestic");
    expect(providers.some((p) => p.key === "trip")).toBe(false);
    expect(providers).toEqual([
      expect.objectContaining({ key: "naver", isAffiliate: false }),
    ]);
  });

  it("hides 트립닷컴 for a Google campground category even when the name doesn't hint at it", () => {
    const providers = bookingProviders("스카이뷰 리조트", "international", undefined, "campground");
    expect(providers.some((p) => p.key === "trip")).toBe(false);
    expect(providers.some((p) => p.key === "naver")).toBe(true);
  });

  it("does not add the Naver fallback for a non-campground lodging", () => {
    expect(bookingProviders("어느 호텔", "domestic")).toEqual([]);
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
