import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getMock = vi.fn();
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => getMock(...a) }));

import { GET, legacyCourseMapRedirect } from "./[...path]/route";

// 작업지시서 2026-10-13 "긴급: Vercel Blob 한도 초과" §3③④ — 과거 코스 지도 경로는 Blob 에서 못 읽으면 course-map 으로 302, 후기 사진은 플레이스홀더.
const call = (pathname: string) =>
  GET(new NextRequest(`https://www.tradule.co.kr/api/blob/${pathname}`), { params: Promise.resolve({ path: pathname.split("/") }) });

describe("legacyCourseMapRedirect", () => {
  it("전체·일자별 과거 경로를 같은 region/days/day 의 course-map URL 로", () => {
    expect(legacyCourseMapRedirect("course-maps/overseas/세부/7/v22.png")).toBe(`/api/content/course-map?region=${encodeURIComponent("세부")}&days=7`);
    expect(legacyCourseMapRedirect("course-maps/overseas/%EC%84%B8%EB%B6%80/7/d3/v22.png")).toBe(`/api/content/course-map?region=${encodeURIComponent("세부")}&days=7&day=3`);
    expect(legacyCourseMapRedirect("course-maps/domestic/서울/2/d1/v27.png")).toContain("days=2&day=1");
  });
  it("지도 경로가 아니면 null", () => {
    expect(legacyCourseMapRedirect("reviews/u1/1-a.jpg")).toBeNull();
    expect(legacyCourseMapRedirect("plan-maps/tok/1.png")).toBeNull();
  });
});

describe("GET /api/blob/[...path]", () => {
  it("과거 지도: Blob 이 막혀 있으면(throw) course-map 으로 302", async () => {
    getMock.mockRejectedValueOnce(new Error("Vercel Blob: This store has been suspended."));
    const res = await call("course-maps/overseas/세부/7/v22.png");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/api/content/course-map?region=");
    expect(res.headers.get("location")).toContain("days=7");
  });
  it("과거 지도: Blob 에 없으면(null) course-map 으로 302", async () => {
    getMock.mockResolvedValueOnce(null);
    const res = await call("course-maps/overseas/오사카/3/d1/v33.png");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("days=3&day=1");
  });
  it("과거 지도: Blob 에 있으면 그대로 스트리밍", async () => {
    getMock.mockResolvedValueOnce({ stream: new Blob(["x"]).stream(), blob: { contentType: "image/png" } });
    const res = await call("course-maps/overseas/세부/7/v22.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
  it("후기 사진: Blob 오류면 깨진 이미지 대신 플레이스홀더(no-store), 없으면 404", async () => {
    getMock.mockRejectedValueOnce(new Error("Vercel Blob: This store has been suspended."));
    const res = await call("reviews/u1/1-a.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("사진을 잠시 불러올 수 없어요");
    getMock.mockResolvedValueOnce(null);
    expect((await call("reviews/u1/missing.jpg")).status).toBe(404);
  });
});
