import { describe, expect, it } from "vitest";
import {
  ENABLED_COURSE_PAGES,
  ENABLED_COURSE_PAGE_REGIONS,
  buildCourseIntro,
  buildCourseItemListJsonLd,
  buildCourseTouristTripJsonLd,
  buildSpotDescription,
  daysToLabel,
  isCourseBriefThin,
  isCoursePageEnabled,
  labelToDays,
  matchEnabledCourseRegion,
} from "./coursePages";
import type { CourseBriefSpot } from "./server/courseBrief";
import type { TravelMode } from "./server/courseRecommend";

// 작업지시서 2026-09-18 "트레쥴이 구글에 7페이지만 올라가 있습니다" §4/§5:
// /course/{지역}/{일수} 공개 페이지의 URL 라벨 변환, 1단계 공개 허용목록,
// 얇은 콘텐츠 판정, 설명문 생성 로직을 검증한다.

function spot(overrides: Partial<CourseBriefSpot> = {}): CourseBriefSpot {
  return {
    name: "오호리공원",
    category: "공원",
    rating: 4.5,
    reviewCount: 1200,
    lat: 33.59,
    lng: 130.4,
    order: 1,
    day: 1,
    toNextMinutes: 12,
    toNextMode: "walk" as TravelMode,
    ...overrides,
  };
}

describe("daysToLabel / labelToDays", () => {
  it("round-trips every supported day count", () => {
    expect(daysToLabel(1)).toBe("당일치기");
    expect(daysToLabel(2)).toBe("1박2일");
    expect(daysToLabel(3)).toBe("2박3일");
    expect(labelToDays("당일치기")).toBe(1);
    expect(labelToDays("1박2일")).toBe(2);
    expect(labelToDays("2박3일")).toBe(3);
  });

  it("returns null for an unknown label", () => {
    expect(labelToDays("3박4일")).toBeNull();
    expect(labelToDays("")).toBeNull();
  });
});

describe("isCoursePageEnabled — 1단계 허용목록 (§5)", () => {
  it("enables an allow-listed domestic region at 2박3일(3)", () => {
    expect(isCoursePageEnabled("경주", 3)).toBe(true);
  });

  it("disables the same region at any other day count (phase 1 is 2박3일 only)", () => {
    expect(isCoursePageEnabled("경주", 1)).toBe(false);
    expect(isCoursePageEnabled("경주", 2)).toBe(false);
  });

  it("disables a region not on the phase-1 allow list even at 2박3일", () => {
    expect(isCoursePageEnabled("종로", 3)).toBe(false);
  });

  it("keeps the allow list to exactly the documented phase-1 scope", () => {
    expect(ENABLED_COURSE_PAGES.length).toBe(24);
    expect(ENABLED_COURSE_PAGE_REGIONS.length).toBe(24);
  });
});

describe("isCoursePageEnabled — 광역명(서울·부산·제주·인천)은 1박2일만 켜져 있다 (§3)", () => {
  it("enables each metro/province-level region at 1박2일(days=2)", () => {
    for (const region of ["서울", "부산", "제주", "인천"]) {
      expect(isCoursePageEnabled(region, 2)).toBe(true);
    }
  });

  it("does not enable those regions at any other day count — days=3 wasn't verified for them", () => {
    for (const region of ["서울", "부산", "제주", "인천"]) {
      expect(isCoursePageEnabled(region, 1)).toBe(false);
      expect(isCoursePageEnabled(region, 3)).toBe(false);
    }
  });

  it("does not enable the existing city-level regions at days=2 — they're 2박3일-only", () => {
    expect(isCoursePageEnabled("경주", 2)).toBe(false);
  });
});

describe("isCoursePageEnabled — 유니코드 정규화(NFC/NFD)가 달라도 같은 지역으로 인식한다 (작업지시서 2026-09-23 §1)", () => {
  it("enables a region whose URL-decoded string is NFD-decomposed (visually identical, different code points)", () => {
    const nfd = "경주".normalize("NFD");
    expect(nfd).not.toBe("경주"); // 전제 확인 — 실제로 다른 문자열이어야 이 테스트가 의미 있다
    expect(isCoursePageEnabled(nfd, 3)).toBe(true);
  });
});

describe("matchEnabledCourseRegion — 후기 제목 → 코스 페이지 역방향 링크 (§4)", () => {
  it("finds an enabled region name inside the title", () => {
    expect(matchEnabledCourseRegion("경주에서 보낸 2박3일")).toBe("경주");
  });

  it("returns null when no enabled region name appears", () => {
    expect(matchEnabledCourseRegion("아무 지역도 없는 제목")).toBeNull();
  });

  it("prefers whichever enabled region appears first in the title when multiple match", () => {
    expect(matchEnabledCourseRegion("강릉 갔다가 경주도 들렀어요")).toBe("강릉");
  });
});

describe("isCourseBriefThin — 얇은 콘텐츠 판정 (§5)", () => {
  it("flags a course with fewer than 5 spots", () => {
    expect(isCourseBriefThin([spot(), spot(), spot()])).toBe(true);
  });

  it("flags a course where half or more spots have no rating", () => {
    const spots = [spot(), spot(), spot({ rating: null }), spot({ rating: null }), spot({ rating: null })];
    expect(isCourseBriefThin(spots)).toBe(true);
  });

  it("does not flag a healthy 5+ spot, mostly-rated course", () => {
    const spots = [spot(), spot(), spot(), spot(), spot(), spot({ rating: null })];
    expect(isCourseBriefThin(spots)).toBe(false);
  });
});

describe("buildCourseIntro — 지역마다 실제로 달라지는 소개 문장 (§5 템플릿 회피)", () => {
  it("mentions the actual top-rated spot's name, rating and review count", () => {
    const intro = buildCourseIntro({
      region: "경주",
      days: 3,
      totalDistanceKm: 24.3,
      spots: [spot({ name: "황리단길", rating: 4.8, reviewCount: 5000 }), spot({ name: "대릉원", rating: 4.2, reviewCount: 900 })],
    });
    expect(intro).toContain("경주");
    expect(intro).toContain("2박3일");
    expect(intro).toContain("황리단길");
    expect(intro).toContain("4.8");
    expect(intro).toContain("5,000");
  });

  it("still returns a sane sentence when no spot has a rating", () => {
    const intro = buildCourseIntro({ region: "안동", days: 3, totalDistanceKm: 10, spots: [spot({ rating: null, reviewCount: null })] });
    expect(intro).toContain("안동");
    expect(intro).not.toContain("undefined");
  });
});

describe("buildSpotDescription", () => {
  it("includes rating, review count, and next-leg travel info", () => {
    const desc = buildSpotDescription(spot({ toNextMinutes: 8, toNextMode: "walk" }));
    expect(desc).toContain("4.5");
    expect(desc).toContain("1,200");
    expect(desc).toContain("도보");
    expect(desc).toContain("8분");
  });

  it("says rating is unavailable rather than showing a blank", () => {
    const desc = buildSpotDescription(spot({ rating: null, reviewCount: null }));
    expect(desc).toContain("평점 정보 없음");
  });
});

describe("JSON-LD builders (§4)", () => {
  it("builds an ItemList with one ListItem per spot, positioned by order", () => {
    const jsonLd = buildCourseItemListJsonLd({ spots: [spot({ order: 1 }), spot({ order: 2, name: "동궁과 월지" })] }) as {
      "@type": string;
      itemListElement: { position: number; item: { name: string } }[];
    };
    expect(jsonLd["@type"]).toBe("ItemList");
    expect(jsonLd.itemListElement).toHaveLength(2);
    expect(jsonLd.itemListElement[1].position).toBe(2);
    expect(jsonLd.itemListElement[1].item.name).toBe("동궁과 월지");
  });

  it("omits aggregateRating for a spot with no rating", () => {
    const jsonLd = buildCourseItemListJsonLd({ spots: [spot({ rating: null, reviewCount: null })] }) as {
      itemListElement: { item: Record<string, unknown> }[];
    };
    expect(jsonLd.itemListElement[0].item.aggregateRating).toBeUndefined();
  });

  it("builds a TouristTrip wrapping the same itinerary", () => {
    const brief = { region: "경주", days: 3 as const, spots: [spot()], imageUrl: "https://example.com/map.png" };
    const jsonLd = buildCourseTouristTripJsonLd(brief, "설명") as { "@type": string; name: string; image: string };
    expect(jsonLd["@type"]).toBe("TouristTrip");
    expect(jsonLd.name).toBe("경주 2박3일 코스");
    expect(jsonLd.image).toBe("https://example.com/map.png");
  });
});
