import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CourseBrief, CourseMapInput } from "@/lib/server/courseBrief";

// 작업지시서 2026-10-13 "긴급: Vercel Blob 한도 초과" §3② — course-map 은 Blob 없이 PNG 를 직접 응답한다(CDN 캐시 헤더 + 해시 ETag).
// courseBrief.ts 는 Postgres pool 을 끌고 오므로 getCourseBrief · loadCourseMapInput · renderCourseMapPng 만 모킹한다.

const getCourseBriefMock = vi.fn<(region: string, days: number) => Promise<CourseBrief>>();
const loadInputMock = vi.fn<(region: string, days: number) => Promise<CourseMapInput | null>>();
const renderMock = vi.fn<(input: CourseMapInput, day: number | null) => Promise<Buffer | null>>();

vi.mock("@/lib/server/courseBrief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/courseBrief")>();
  return {
    ...actual,
    getCourseBrief: (region: string, days: number) => getCourseBriefMock(region, days),
    loadCourseMapInput: (region: string, days: number) => loadInputMock(region, days),
    renderCourseMapPng: (input: CourseMapInput, day: number | null) => renderMock(input, day),
  };
});

import { GET } from "./route";

const INPUT: CourseMapInput = {
  hash: "abcdef0123456789",
  spots: [
    { order: 1, lat: 10.3, lng: 123.9 },
    { order: 2, lat: 10.31, lng: 123.91 },
    { order: 1, lat: 10.4, lng: 123.95 },
  ],
  mapPaths: ["path1"],
  dayLengths: [2, 1, 0],
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function request(query: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://www.tradule.co.kr/api/content/course-map?${query}`, { headers });
}

describe("GET /api/content/course-map — Blob 없이 PNG 직접 응답", () => {
  beforeEach(() => {
    getCourseBriefMock.mockReset();
    loadInputMock.mockReset();
    renderMock.mockReset();
    loadInputMock.mockResolvedValue(INPUT);
    renderMock.mockResolvedValue(PNG);
  });

  it("전체 지도: 200 image/png · s-maxage 30일 · ETag = 지도 해시, 코스를 다시 만들지 않는다", async () => {
    const res = await GET(request("region=세부&days=7"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=2592000, stale-while-revalidate=86400");
    expect(res.headers.get("etag")).toBe('"abcdef0123456789"');
    expect(renderMock).toHaveBeenCalledWith(INPUT, null);
    expect(getCourseBriefMock).not.toHaveBeenCalled();
  });

  it("일자별 지도: ETag 에 일자가 들어가고 그날을 그린다", async () => {
    const res = await GET(request("region=세부&days=7&day=2"));
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"abcdef0123456789-d2"');
    expect(renderMock).toHaveBeenCalledWith(INPUT, 2);
  });

  it("If-None-Match 가 ETag 와 같으면 304 — Static Maps 를 부르지 않는다", async () => {
    const res = await GET(request("region=세부&days=7", { "if-none-match": '"abcdef0123456789"' }));
    expect(res.status).toBe(304);
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("저장된 지도 입력이 없으면 코스를 만들어(입력이 함께 저장된다) 다시 읽는다", async () => {
    loadInputMock.mockResolvedValueOnce(null).mockResolvedValueOnce(INPUT);
    getCourseBriefMock.mockResolvedValue({} as CourseBrief);
    const res = await GET(request("region=세부&days=7"));
    expect(getCourseBriefMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it("코스를 만들어도 지도 입력이 없으면(키 미설정·422 …) 404", async () => {
    loadInputMock.mockResolvedValue(null);
    getCourseBriefMock.mockResolvedValue({} as CourseBrief);
    expect((await GET(request("region=세부&days=7"))).status).toBe(404);
    expect((await GET(request("region=세부&days=7&day=1"))).status).toBe(404);
  });

  it("범위 밖 day 는 400 — 코스도 지도도 만들지 않는다", async () => {
    for (const day of ["0", "8", "-1", "1.5", "abc"]) {
      const res = await GET(request(`region=세부&days=7&day=${day}`));
      expect(res.status).toBe(400);
    }
    expect(loadInputMock).not.toHaveBeenCalled();
    expect(getCourseBriefMock).not.toHaveBeenCalled();
  });

  it("그 날 지도가 없으면(스팟 0개) 404", async () => {
    expect((await GET(request("region=세부&days=7&day=3"))).status).toBe(404);
    expect((await GET(request("region=세부&days=7&day=6"))).status).toBe(404); // dayLengths 밖
  });

  it("PNG 를 못 만들면 502 · no-store (실패가 CDN 에 캐시되지 않는다)", async () => {
    renderMock.mockResolvedValue(null);
    const res = await GET(request("region=세부&days=7"));
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
