import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/server/db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { COURSE_ALGO_VERSION, briefCacheKey, readPreviousVersionBrief, type CourseBrief, type CourseBriefSpot } from "./courseBrief";

// 작업지시서 2026-10-15 "긴급(장애): #322 이후 코스 페이지 전부 404" §2·§3④ — 버전이 바뀌어도 직전 버전 캐시(26시간 이내)를 계속 서빙한다.
const spot = (i: number): CourseBriefSpot => ({ name: `s${i}`, category: "관광지", rating: 4.5, reviewCount: 300, lat: 35.8 + i * 0.001, lng: 129.2, order: i, day: (((i - 1) % 3) + 1) as 1 | 2 | 3, toNextMinutes: 5, toNextMode: "walk" });
const brief = (count: number): CourseBrief => ({
  region: "경주",
  days: 3,
  totalDistanceKm: 10,
  spots: Array.from({ length: count }, (_, i) => spot(i + 1)),
  imageUrl: null,
  appUrl: "https://example.com",
  ratingSource: "google",
  distanceSource: "route",
  dayTotals: [],
  dayImageUrls: [],
});

describe("readPreviousVersionBrief", () => {
  beforeEach(() => queryMock.mockReset());

  it("현재 버전이 아닌 같은 조합의 최근 캐시를 키 접두(left())로 찾는다", async () => {
    queryMock.mockResolvedValue({ rows: [{ cache_key: briefCacheKey("domestic", "경주", 3).replace(`:v${COURSE_ALGO_VERSION}`, ":v39"), payload: brief(12), created_at: new Date().toISOString() }] });
    const prev = await readPreviousVersionBrief("domestic", "경주", 3);
    expect(prev?.version).toBe("39");
    expect(prev?.brief.spots).toHaveLength(12);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("left(cache_key, $1) = $2");
    expect(params[2]).toBe(briefCacheKey("domestic", "경주", 3)); // 현재 버전 키는 제외
    expect(String(params[1])).toMatch(/^content-brief:domestic:.+:3:v$/);
  });

  it("현재 기준(스팟 수)을 못 채우는 옛 캐시는 쓰지 않고, 없으면 null", async () => {
    queryMock.mockResolvedValue({ rows: [{ cache_key: "content-brief:domestic:x:3:v39", payload: brief(2), created_at: new Date().toISOString() }] });
    expect(await readPreviousVersionBrief("domestic", "경주", 3)).toBeNull();
    queryMock.mockResolvedValue({ rows: [] });
    expect(await readPreviousVersionBrief("domestic", "경주", 3)).toBeNull();
  });
});
