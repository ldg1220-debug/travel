import { describe, expect, it } from "vitest";
import {
  ENABLED_COURSE_PAGES,
  ENABLED_COURSE_PAGE_REGIONS,
  buildCourseBreadcrumbJsonLd,
  buildCourseDescription,
  buildCourseIntro,
  buildCourseTitle,
  courseCanonicalPath,
  groupSpotsByDay,
  pickRepresentativeSpots,
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

  // 작업지시서 2026-09-23 "자동 코스 일수 확장(도시형 5일·휴양형 7일)" §6 —
  // 4~7일 라벨이 새로 추가됐다. days=6·7은 "6박7일"이 아니라 "5박6일"·
  // "5박7일"이다(지시서 §6 원문 — 장거리 휴양지 상품 표기 관례).
  it("round-trips the new 4~7 day labels", () => {
    expect(daysToLabel(4)).toBe("3박4일");
    expect(daysToLabel(5)).toBe("4박5일");
    expect(daysToLabel(6)).toBe("5박6일");
    expect(daysToLabel(7)).toBe("5박7일");
    expect(labelToDays("3박4일")).toBe(4);
    expect(labelToDays("4박5일")).toBe(5);
    expect(labelToDays("5박6일")).toBe(6);
    expect(labelToDays("5박7일")).toBe(7);
  });

  it("returns null for an unknown label", () => {
    expect(labelToDays("6박7일")).toBeNull();
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
  // 작업지시서 2026-09-28 §2-② — 기준값(minSpots)은 이제 호출부가 넘긴다
  // (courseBrief.ts의 minViableSpots를 몰라도 되는 순수 함수로 유지하기
  // 위해서 — 파일 상단 docstring 참고). 여기서는 API와 같은 기준을
  // 재현하기 위해 5를 그대로 인자로 넘긴다.
  it("flags a course with fewer spots than the given minimum", () => {
    expect(isCourseBriefThin([spot(), spot(), spot()], 5)).toBe(true);
  });

  it("flags a course where half or more spots have no rating", () => {
    const spots = [spot(), spot(), spot({ rating: null }), spot({ rating: null }), spot({ rating: null })];
    expect(isCourseBriefThin(spots, 5)).toBe(true);
  });

  it("does not flag a healthy course at or above the given minimum, mostly-rated", () => {
    const spots = [spot(), spot(), spot(), spot(), spot(), spot({ rating: null })];
    expect(isCourseBriefThin(spots, 5)).toBe(false);
  });

  it("respects a lower minimum (e.g. resort-style days=1) — a 3-spot course isn't flagged as thin", () => {
    expect(isCourseBriefThin([spot(), spot(), spot()], 3)).toBe(false);
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

  // 작업지시서 2026-09-23 "코스 페이지가 열립니다 + 남은 4건" §5 — "향미사을(를)
  // 포함해"처럼 받침 유무와 무관하게 "을(를)"을 그대로 찍고 있었다.
  it("받침 있는 스팟명엔 '을'을 붙인다 (예: 황리단길)", () => {
    const intro = buildCourseIntro({ region: "경주", days: 3, totalDistanceKm: 10, spots: [spot({ name: "황리단길", rating: 4.8, reviewCount: 100 })] });
    expect(intro).toContain("황리단길을 포함해");
    expect(intro).not.toContain("을(를)");
  });

  it("받침 없는 스팟명엔 '를'을 붙인다 (예: 향미사)", () => {
    const intro = buildCourseIntro({ region: "부산", days: 1, totalDistanceKm: 5, spots: [spot({ name: "향미사", rating: 4.7, reviewCount: 185 })] });
    expect(intro).toContain("향미사를 포함해");
    expect(intro).not.toContain("을(를)");
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

  // 작업지시서 2026-09-29 "#282 검증" §2 — 섬 구간은 배. 분을 지어내지 않는다.
  it("says the next leg is by boat, without inventing minutes", () => {
    const desc = buildSpotDescription(spot({ toNextMode: "boat", toNextMinutes: null }));
    expect(desc).toContain("배로 이동");
    expect(desc).not.toContain("차량");
    expect(desc).not.toMatch(/\d+분/);
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

describe("검색 품질 — 제목·설명·대표 명소·canonical·일자 카드·BreadcrumbList (작업지시서 2026-10-08 §3)", () => {
  const brief = {
    region: "오사카",
    days: 3 as const,
    totalDistanceKm: 12.3,
    imageUrl: null,
    dayImageUrls: [null, null, null],
    dayTotals: [
      { day: 1 as const, distanceKm: 4.1, spotCount: 2 },
      { day: 2 as const, distanceKm: 3.0, spotCount: 2, facilityDay: true as const },
    ],
    spots: [
      spot({ name: "오사카 성", category: "관광지", rating: 4.6, reviewCount: 90000, order: 1, day: 1 }),
      spot({ name: "이치란 도톤보리", category: "음식점", rating: 4.5, reviewCount: 95000, order: 2, day: 1 }),
      spot({ name: "도톤보리", category: "관광지", rating: 4.5, reviewCount: 85000, order: 3, day: 2 }),
      spot({ name: "유니버설 스튜디오 재팬", category: "테마파크", rating: 4.6, reviewCount: 60000, order: 4, day: 2 }),
      spot({ name: "쓰텐카쿠", category: "관광지", rating: 4.2, reviewCount: 40000, order: 5, day: 3 }),
      spot({ name: "웰컴 호텔", category: "숙소", rating: 4.9, reviewCount: 99999, order: 6, day: 3, lodging: true }),
    ],
  };

  it("대표 명소는 식당·카페·숙소·선착장을 빼고 평점×리뷰 순으로 뽑는다", () => {
    expect(pickRepresentativeSpots(brief.spots, 3)).toEqual(["오사카 성", "도톤보리", "유니버설 스튜디오 재팬"]);
    expect(pickRepresentativeSpots([spot({ name: "제셀톤 선착장", category: "관광지" }), spot({ name: "Poin Spa", category: "기타" })], 2)).toEqual([]);
  });

  it("title: '{지역} {일수} 코스 — {N}곳 · {대표1}·{대표2} | 트레쥴', description: 대표 3곳 + 고정 문구", () => {
    expect(buildCourseTitle(brief)).toBe("오사카 2박3일 코스 — 6곳 · 오사카 성·도톤보리 | 트레쥴");
    expect(buildCourseDescription(brief)).toBe("오사카 2박3일 코스: 오사카 성, 도톤보리, 유니버설 스튜디오 재팬. 일자별 동선 지도 · 이동 시간 · 평점 정리.");
    // 6·7일은 URL 라벨과 같은 "5박6일"·"5박7일"
    expect(buildCourseTitle({ ...brief, region: "세부", days: 7 })).toContain("세부 5박7일 코스");
  });

  it("canonical 경로는 지역·일수 라벨을 인코딩해 한 가지로만 만든다", () => {
    expect(courseCanonicalPath("오사카", 3)).toBe(`/course/${encodeURIComponent("오사카")}/${encodeURIComponent("2박3일")}`);
  });

  it("groupSpotsByDay: 일자별 묶음에 이동거리·시설 날 표시가 붙는다", () => {
    const groups = groupSpotsByDay(brief);
    expect(groups.map((g) => [g.day, g.spots.length])).toEqual([[1, 2], [2, 2], [3, 2]]);
    expect(groups[0].distanceKm).toBe(4.1);
    expect(groups[1].facilityDay).toBe(true);
    expect(groups[2].distanceKm).toBeNull();
  });

  it("BreadcrumbList: 홈 > 코스 > {지역} {일수} 코스, 마지막 항목은 canonical 절대 주소", () => {
    const ld = buildCourseBreadcrumbJsonLd("오사카", 3) as { itemListElement: { position: number; name: string; item: string }[] };
    expect(ld.itemListElement.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(ld.itemListElement[2].name).toBe("오사카 2박3일 코스");
    expect(ld.itemListElement[2].item).toBe(`https://www.tradule.co.kr${courseCanonicalPath("오사카", 3)}`);
  });

  it("buildSpotDescription: 차량 폴백·직선 추정 구간은 그 사실을 적는다", () => {
    expect(buildSpotDescription(spot({ toNextMode: "car", toNextMinutes: 20, toNextFallback: "driving" }))).toContain("대중교통 정보가 없어 차량 기준 참고값");
    expect(buildSpotDescription(spot({ toNextMode: "car", toNextMinutes: 20, toNextSource: "straight" }))).toContain("직선거리 추정");
    expect(buildSpotDescription(spot({ toNextMode: "car", toNextMinutes: 20, toNextSource: "route" }))).not.toContain("추정");
  });
});
