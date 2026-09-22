import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseBrief, CourseBriefSpot } from "@/lib/server/courseBrief";

// 작업지시서 2026-09-22 "sitemap에 올린 코스 페이지 20개가 전부
// 404입니다" §2 — 기존 19개 단위 테스트(coursePages.test.ts)는 게이트
// 함수(isCoursePageEnabled/isCourseBriefThin 등)를 직접 불렀을 뿐, 실제
// 라우트(generateMetadata + 페이지 컴포넌트)를 부르지 않아 "메타데이터는
// 성공하고 본문만 notFound()를 던진다"는 이번 회귀를 못 잡았다(문서
// §2 "단위 테스트는 게이트 함수를 직접 부르고, 실제 라우트를 부르지
// 않습니다"). 이 테스트는 실제 page.tsx 모듈(generateMetadata + 기본
// export)을 그대로 불러 두 곳이 같은 입력에 대해 항상 같은 결론을
// 내는지 확인한다 — getCachedCourseBrief를 모킹해 결정적인 입력을 준다
// (courseBrief.ts는 Postgres pool을 끌고 오므로 이 저장소의 다른
// 테스트들처럼 순수 함수만 테스트하는 대신, 여기선 불가피하게 처음으로
// vi.mock을 쓴다 — region.tsx가 실제로 부르는 모듈 경계 자체가
// 회귀의 원인이라 우회할 수 없다).

const getCachedCourseBriefMock = vi.fn<(region: string, days: 1 | 2 | 3) => Promise<CourseBrief | null>>();

vi.mock("@/lib/server/courseBrief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/courseBrief")>();
  return {
    ...actual,
    getCachedCourseBrief: (region: string, days: 1 | 2 | 3) => getCachedCourseBriefMock(region, days),
  };
});

vi.mock("@/lib/server/coursePageLinks", () => ({
  fetchRelatedTripPosts: vi.fn().mockResolvedValue([]),
}));

function spot(overrides: Partial<CourseBriefSpot> = {}): CourseBriefSpot {
  return {
    name: "황리단길",
    category: "상권",
    rating: 4.5,
    reviewCount: 1200,
    lat: 35.83,
    lng: 129.21,
    order: 1,
    day: 1,
    toNextMinutes: 12,
    toNextMode: "walk",
    ...overrides,
  };
}

function thickBrief(overrides: Partial<CourseBrief> = {}): CourseBrief {
  return {
    region: "경주",
    days: 3,
    totalDistanceKm: 19.8,
    spots: Array.from({ length: 12 }, (_, i) => spot({ order: i + 1, day: ((i % 3) + 1) as 1 | 2 | 3 })),
    imageUrl: null,
    appUrl: "https://www.tradule.co.kr/api/content/course-open?region=%EA%B2%BD%EC%A3%BC&days=3",
    ratingSource: "google",
    distanceSource: "route",
    dayTotals: [],
    ...overrides,
  };
}

describe("generateMetadata와 CoursePage가 같은 입력에 대해 항상 일치한다 (§2 회귀 방지)", () => {
  beforeEach(() => {
    getCachedCourseBriefMock.mockReset();
  });

  it("실제 코스가 캐시에 있으면 메타데이터가 실제 제목을 쓰고, 본문도 notFound()를 던지지 않는다", async () => {
    getCachedCourseBriefMock.mockResolvedValue(thickBrief());
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "경주", days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toContain("12곳");
    expect(metadata.title).toContain("19.8km");

    await expect(CoursePage({ params })).resolves.toBeTruthy();
  });

  it("캐시가 비어 있으면(아직 안 채워짐) 메타데이터도 본문도 똑같이 '못 찾음'으로 일치한다", async () => {
    getCachedCourseBriefMock.mockResolvedValue(null);
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "경주", days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("코스를 찾을 수 없어요 - 트레쥴");

    await expect(CoursePage({ params })).rejects.toThrow();
  });

  it("허용목록에 없는 지역은 캐시에 실제 코스가 있어도 둘 다 '못 찾음'으로 일치한다", async () => {
    getCachedCourseBriefMock.mockResolvedValue(thickBrief({ region: "발리" }));
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "발리", days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("코스를 찾을 수 없어요 - 트레쥴");
    await expect(CoursePage({ params })).rejects.toThrow();
    expect(getCachedCourseBriefMock).not.toHaveBeenCalled();
  });

  it("얇은 콘텐츠(스팟<5)면 캐시 히트여도 둘 다 '못 찾음'으로 일치한다", async () => {
    getCachedCourseBriefMock.mockResolvedValue(thickBrief({ spots: [spot(), spot(), spot()] }));
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "경주", days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("코스를 찾을 수 없어요 - 트레쥴");
    await expect(CoursePage({ params })).rejects.toThrow();
  });
});
