import { describe, expect, it } from "vitest";
import robots from "./robots";

// 작업지시서 2026-10-08 "#300 검증" §3-1 — 코스 지도 이미지는 크롤 허용, 나머지 /api/는 차단 유지.
describe("robots", () => {
  const rules = robots().rules as { userAgent: string; allow: string[]; disallow: string[] };

  it("코스 지도 이미지 경로를 허용하고, 더 일반적인 /api/ 차단은 유지한다", () => {
    expect(rules.allow).toContain("/api/blob/course-maps/");
    expect(rules.disallow).toContain("/api/");
    // 더 긴(구체적) 규칙이 이긴다 — 허용 경로가 차단 경로의 하위여야 의미가 있다
    expect("/api/blob/course-maps/overseas/오사카/3/v33.png".startsWith("/api/")).toBe(true);
  });

  it("후기 사진 등 다른 /api/blob/ 은 허용 목록에 없다", () => {
    expect(rules.allow.some((a) => "/api/blob/trip-posts/1.png".startsWith(a) && a !== "/")).toBe(false);
  });

  it("사이트맵 주소는 그대로", () => {
    expect(robots().sitemap).toBe("https://www.tradule.co.kr/sitemap.xml");
  });
});
