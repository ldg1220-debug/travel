import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CourseBrief } from "@/lib/server/courseBrief";

// 작업지시서 2026-09-29 "일자별 동선 지도 · #279가 경주에서 효과 없음 ·
// 오사카 2일" §1 — course-map?day=N: 그 하루 지도만 돌려주고, 범위
// 밖이면 400, 없으면 기존 전체 지도. courseBrief.ts는 Postgres pool을
// 끌고 오므로 page.test.ts와 같은 이유로 getCourseBrief만 모킹한다.

const getCourseBriefMock = vi.fn<(region: string, days: number) => Promise<CourseBrief>>();

vi.mock("@/lib/server/courseBrief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/courseBrief")>();
  return {
    ...actual,
    getCourseBrief: (region: string, days: number) => getCourseBriefMock(region, days),
  };
});

import { GET } from "./route";

function briefWith(overrides: Partial<CourseBrief> = {}): CourseBrief {
  return {
    region: "세부",
    days: 7,
    totalDistanceKm: 10,
    spots: [],
    imageUrl: "https://www.tradule.co.kr/api/blob/course-maps/overseas/%EC%84%B8%EB%B6%80/7/v15.png",
    appUrl: "https://example.com",
    ratingSource: "google",
    distanceSource: "route",
    dayTotals: [],
    dayImageUrls: [1, 2, 3, 4, 5, 6, 7].map((d) => `https://www.tradule.co.kr/api/blob/course-maps/overseas/x/7/d${d}/v15.png`),
    ...overrides,
  };
}

function request(query: string): NextRequest {
  return new NextRequest(`https://www.tradule.co.kr/api/content/course-map?${query}`);
}

describe("GET /api/content/course-map?day=N — 일자별 지도 (작업지시서 2026-09-29 §1)", () => {
  beforeEach(() => {
    getCourseBriefMock.mockReset();
  });

  it("redirects to that day's map when day is given", async () => {
    getCourseBriefMock.mockResolvedValue(briefWith());
    const res = await GET(request("region=세부&days=7&day=3"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/d3/v15.png");
  });

  it("still redirects to the whole-course map when day is omitted (기존 동작 그대로)", async () => {
    getCourseBriefMock.mockResolvedValue(briefWith());
    const res = await GET(request("region=세부&days=7"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/7/v15.png");
    expect(res.headers.get("location")).not.toContain("/d");
  });

  it("returns 400 when day is out of range, without generating a course", async () => {
    for (const day of ["0", "8", "-1", "1.5", "abc"]) {
      const res = await GET(request(`region=세부&days=7&day=${day}`));
      expect(res.status).toBe(400);
    }
    expect(getCourseBriefMock).not.toHaveBeenCalled();
  });

  it("returns 404 when that day's map could not be made (null entry)", async () => {
    getCourseBriefMock.mockResolvedValue(briefWith({ dayImageUrls: [null, null, null, null, null, null, null] }));
    const res = await GET(request("region=세부&days=7&day=2"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when fewer days were actually filled than requested", async () => {
    getCourseBriefMock.mockResolvedValue(briefWith({ dayImageUrls: ["https://www.tradule.co.kr/api/blob/x/d1/v15.png"] }));
    const res = await GET(request("region=세부&days=7&day=5"));
    expect(res.status).toBe(404);
  });
});
