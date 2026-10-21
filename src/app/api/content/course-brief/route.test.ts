import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CourseBrief, CourseBriefSpot } from "@/lib/server/courseBrief";

const recordVisitMock = vi.fn();
vi.mock("@/lib/server/courseVisits", () => ({ recordCourseVisit: (...a: unknown[]) => recordVisitMock(...a) }));

// 작업지시서 2026-09-29 "#280 검증" §2 — 코타키나발루 3일이 "count 6,
// threshold 6"인데 "insufficient_spots"로 거절돼 사유가 오해됐다. 스팟 수
// 부족과 해변 없음을 다른 error 코드로 구분한다. courseBrief.ts는 Postgres
// pool을 끌고 오므로 page.test.ts와 같은 이유로 getCourseBrief만 모킹한다.

const getCourseBriefMock = vi.fn<(region: string, days: number, budget?: number, options?: { refresh?: boolean; requestSource?: "user" | "bot" }) => Promise<CourseBrief>>();

vi.mock("@/lib/server/courseBrief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/courseBrief")>();
  return {
    ...actual,
    getCourseBrief: (region: string, days: number, budget?: number, options?: { refresh?: boolean; requestSource?: "user" | "bot" }) => getCourseBriefMock(region, days, budget, options),
  };
});

import { GET } from "./route";

function spot(order: number, overrides: Partial<CourseBriefSpot> = {}): CourseBriefSpot {
  return { name: `spot-${order}`, category: "관광지", lat: 6, lng: 116, order, day: 1, toNextMinutes: 10, toNextMode: "car", ...overrides };
}

function briefWith(spots: CourseBriefSpot[]): CourseBrief {
  return {
    region: "코타키나발루",
    days: 3,
    totalDistanceKm: 10,
    spots,
    imageUrl: null,
    appUrl: "https://example.com",
    ratingPolicy: "on-click",
    distanceSource: "route",
    dayTotals: [],
    dayImageUrls: [],
  };
}

function request(query: string): NextRequest {
  return new NextRequest(`https://www.tradule.co.kr/api/content/course-brief?${query}`);
}

describe("GET /api/content/course-brief — 422 사유 구분 (작업지시서 2026-09-29 '#280 검증' §2)", () => {
  beforeEach(() => {
    getCourseBriefMock.mockReset();
  });

  it("returns insufficient_spots when the count is below the threshold", async () => {
    getCourseBriefMock.mockResolvedValue(briefWith([spot(1), spot(2)]));
    const res = await GET(request("region=코타키나발루&days=3"));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("insufficient_spots");
  });

  it("returns no_beach (with count and threshold) when spots are enough but a resort course has no beach", async () => {
    getCourseBriefMock.mockResolvedValue(briefWith(Array.from({ length: 6 }, (_, i) => spot(i + 1))));
    const res = await GET(request("region=코타키나발루&days=3"));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; count: number; threshold: number };
    expect(body.error).toBe("no_beach");
    expect(body.count).toBe(6);
    expect(body.threshold).toBe(6);
  });

  it("returns 200 once a resort course has enough spots and a beach (beach flag counts even without a beach word in the name)", async () => {
    const spots = [...Array.from({ length: 5 }, (_, i) => spot(i + 1)), spot(6, { name: "Sapi Island", category: "기타", beach: true })];
    getCourseBriefMock.mockResolvedValue(briefWith(spots));
    const res = await GET(request("region=코타키나발루&days=3"));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/content/course-brief — ?refresh= 토큰 (작업지시서 2026-09-30 '#288' §2②)", () => {
  const ok = () => briefWith(Array.from({ length: 6 }, (_, i) => spot(i + 1, { category: "beach" })));
  beforeEach(() => {
    getCourseBriefMock.mockReset();
    getCourseBriefMock.mockResolvedValue(ok());
    vi.stubEnv("CRON_SECRET", "s3cret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes refresh=true only when the token equals CRON_SECRET", async () => {
    await GET(request("region=코타키나발루&days=3&refresh=s3cret"));
    expect(getCourseBriefMock.mock.calls[0][3]).toEqual({ refresh: true, requestSource: "user" });
  });

  it("ignores a wrong token, a missing token, and an unset secret", async () => {
    await GET(request("region=코타키나발루&days=3&refresh=nope"));
    await GET(request("region=코타키나발루&days=3"));
    vi.stubEnv("CRON_SECRET", "");
    await GET(request("region=코타키나발루&days=3&refresh="));
    await GET(request("region=코타키나발루&days=3&refresh=s3cret"));
    for (const call of getCourseBriefMock.mock.calls) expect(call[3]).toEqual({ refresh: false, requestSource: "user" });
  });
});


// 작업지시서 2026-10-21 "#333 검증" §2① — 검색 로봇은 방문 기록·재생성 대상이 아니다.
describe("GET /api/content/course-brief — 검색 로봇", () => {
  beforeEach(() => {
    getCourseBriefMock.mockReset();
    getCourseBriefMock.mockResolvedValue(briefWith(Array.from({ length: 9 }, (_, i) => spot(i + 1))));
    recordVisitMock.mockReset();
  });
  const withUa = (ua: string) => new NextRequest("https://www.tradule.co.kr/api/content/course-brief?region=코타키나발루&days=3", { headers: { "user-agent": ua } });

  it("Googlebot 은 requestSource=bot 으로 넘기고 방문을 기록하지 않는다", async () => {
    await GET(withUa("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
    expect(getCourseBriefMock.mock.calls[0][3]).toMatchObject({ requestSource: "bot" });
    expect(recordVisitMock).not.toHaveBeenCalled();
  });
  it("일반 사용자·AutoPipeline 호출은 user 로 방문을 기록한다", async () => {
    await GET(withUa("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36"));
    await GET(withUa("AutoPipeline/1.0 (+tradule content client)"));
    expect(getCourseBriefMock.mock.calls.every((c) => c[3]?.requestSource === "user")).toBe(true);
    expect(recordVisitMock).toHaveBeenCalledTimes(2);
  });
});
