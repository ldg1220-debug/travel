import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseBrief, CourseBriefSpot } from "@/lib/server/courseBrief";

// 작업지시서 2026-09-22 "sitemap에 올린 코스 페이지 20개가 전부
// 404입니다" §2 — 기존 단위 테스트(coursePages.test.ts)는 게이트
// 함수(isCoursePageEnabled/isCourseBriefThin 등)를 직접 불렀을 뿐, 실제
// 라우트(generateMetadata + 페이지 컴포넌트)를 부르지 않아 "메타데이터는
// 성공하고 본문만 notFound()를 던진다"는 회귀를 못 잡았다. 이 테스트는
// 실제 page.tsx 모듈(generateMetadata + 기본 export)을 그대로 불러 두
// 곳이 같은 입력에 대해 항상 같은 결론을 내는지 확인한다 —
// getCourseBrief를 모킹해 결정적인 입력을 준다(courseBrief.ts는
// Postgres pool을 끌고 오므로 이 저장소의 다른 테스트들처럼 순수 함수만
// 테스트하는 대신, 여기선 불가피하게 vi.mock을 쓴다 — page.tsx가 실제로
// 부르는 모듈 경계 자체가 회귀의 원인이라 우회할 수 없다).
//
// 두 호출부가 실제로 결과를 공유하는지(React cache()가 통하는지)는 이
// 테스트로 검증할 수 없다 — 모킹된 getCourseBrief는 항상 같은 값을
// 돌려주므로 애초에 같은 값만 관찰된다. 그 dedup 자체은
// courseBrief.test.ts의 dedupeInFlight 테스트가 검증한다.

const getCourseBriefMock = vi.fn<(region: string, days: 1 | 2 | 3) => Promise<CourseBrief>>();

vi.mock("@/lib/server/courseBrief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/courseBrief")>();
  return {
    ...actual,
    getCourseBrief: (region: string, days: 1 | 2 | 3) => getCourseBriefMock(region, days),
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
    getCourseBriefMock.mockReset();
  });

  it("실제 코스가 있으면 메타데이터가 실제 제목을 쓰고, 본문도 notFound()를 던지지 않는다", async () => {
    getCourseBriefMock.mockResolvedValue(thickBrief());
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "경주", days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toContain("12곳");
    expect(metadata.title).toContain("19.8km");

    await expect(CoursePage({ params })).resolves.toBeTruthy();
  });

  // 작업지시서 2026-09-23 "404 원인 확정: params가 디코딩되지 않습니다" —
  // Vercel 런타임 로그로 확정된 진짜 원인: params.region/days가
  // 퍼센트 인코딩된 채로("%EA%B2%BD%EC%A3%BC") 들어오는 경우가
  // 있었는데, 그동안의 테스트는 항상 디코딩된 문자열("경주")을 직접
  // 넣어 이 경로를 한 번도 실행하지 않았다(§4의 지적 그대로).
  it("params가 퍼센트 인코딩된 채로 와도(실제 런타임 로그에서 확인된 상황) 정상 동작한다", async () => {
    getCourseBriefMock.mockResolvedValue(thickBrief());
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: encodeURIComponent("경주"), days: encodeURIComponent("2박3일") });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toContain("12곳");
    expect(metadata.title).toContain("19.8km");
    await expect(CoursePage({ params })).resolves.toBeTruthy();
    // 디코딩된 값으로 getCourseBrief를 불렀는지도 확인한다 — 인코딩된
    // 문자열 그대로 넘겼다면 isCoursePageEnabled에서 걸러져 아예 호출되지 않았을 것이다.
    expect(getCourseBriefMock).toHaveBeenCalledWith("경주", 3);
  });

  it("NFD(자모 분해)로 정규화된 params도 정상 동작한다 (#266의 NFC 정규화와 이번 디코딩이 함께 필요한 경우)", async () => {
    getCourseBriefMock.mockResolvedValue(thickBrief());
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "경주".normalize("NFD"), days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toContain("12곳");
    await expect(CoursePage({ params })).resolves.toBeTruthy();
  });

  it("허용목록에 없는 지역은 getCourseBrief를 부르지도 않고 둘 다 '못 찾음'으로 일치한다", async () => {
    getCourseBriefMock.mockResolvedValue(thickBrief({ region: "발리" }));
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "발리", days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("코스를 찾을 수 없어요 - 트레쥴");
    await expect(CoursePage({ params })).rejects.toThrow();
    expect(getCourseBriefMock).not.toHaveBeenCalled();
  });

  it("미지원 지역 에러(UnsupportedRegionError)가 나면 둘 다 '못 찾음'으로 일치한다", async () => {
    const { UnsupportedRegionError } = await vi.importActual<typeof import("@/lib/server/courseBrief")>("@/lib/server/courseBrief");
    getCourseBriefMock.mockRejectedValue(new UnsupportedRegionError("경주"));
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "경주", days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("코스를 찾을 수 없어요 - 트레쥴");
    await expect(CoursePage({ params })).rejects.toThrow();
  });

  it("getCourseBrief가 어떤 에러를 던지든(LLM/외부 API 일시 장애 등) 페이지가 정체불명으로 죽는 대신 제어된 '못 찾음'으로 내려간다 (작업지시서 2026-09-22 '이번엔 라우트 자체가 인식되지 않습니다' §5)", async () => {
    getCourseBriefMock.mockRejectedValue(new Error("anthropic 500"));
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "경주", days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("코스를 찾을 수 없어요 - 트레쥴");
    // notFound()가 던지는 특수 에러로 내려가야 한다 — getCourseBrief의
    // 원본 에러("anthropic 500")가 그대로 페이지 밖으로 새 나가면 안 된다.
    await expect(CoursePage({ params })).rejects.toThrow();
    await expect(CoursePage({ params })).rejects.not.toThrow("anthropic 500");
  });

  it("얇은 콘텐츠(스팟<5)면 둘 다 '못 찾음'으로 일치한다", async () => {
    getCourseBriefMock.mockResolvedValue(thickBrief({ spots: [spot(), spot(), spot()] }));
    const { generateMetadata, default: CoursePage } = await import("./page");
    const params = Promise.resolve({ region: "경주", days: "2박3일" });

    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("코스를 찾을 수 없어요 - 트레쥴");
    await expect(CoursePage({ params })).rejects.toThrow();
  });
});
