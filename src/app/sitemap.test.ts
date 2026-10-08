import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/server/db", () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));
const confirmedMock = vi.fn();
vi.mock("@/lib/server/coursePageIndex", () => ({ fetchConfirmedCoursePages: () => confirmedMock() }));

import sitemap from "./sitemap";

// 작업지시서 2026-10-08 "코스 페이지가 전부 404입니다" §2 — 사이트맵에 코스 페이지(확인된 조합만)가 들어간다.
describe("sitemap", () => {
  beforeEach(() => {
    queryMock.mockReset().mockResolvedValue({ rows: [] });
    confirmedMock.mockReset();
  });

  it("확인된 코스 조합이 인코딩된 canonical 주소와 lastmod(브리프 생성 시각)로 들어간다", async () => {
    const lastModified = new Date("2026-10-07T01:00:00Z");
    confirmedMock.mockResolvedValue([{ region: "오사카", days: 3, lastModified }, { region: "세부", days: 7, lastModified }]);
    const entries = await sitemap();
    const course = entries.filter((e) => e.url.includes("/course/"));
    expect(course.map((e) => e.url)).toEqual([
      `https://www.tradule.co.kr/course/${encodeURIComponent("오사카")}/${encodeURIComponent("2박3일")}`,
      `https://www.tradule.co.kr/course/${encodeURIComponent("세부")}/${encodeURIComponent("5박7일")}`,
    ]);
    expect(course[0].lastModified).toEqual(lastModified);
    expect(entries.some((e) => e.url === "https://www.tradule.co.kr/course")).toBe(true); // 기존 정적 항목 유지
  });

  it("확인된 조합이 없어도(캐시 비어 있음) 정적 항목은 그대로 나간다", async () => {
    confirmedMock.mockResolvedValue([]);
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThanOrEqual(7);
    expect(entries.some((e) => e.url.includes("/course/"))).toBe(false);
  });
});
