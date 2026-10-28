import { describe, expect, it } from "vitest";
import { INDEXED_COURSES, isIndexedCourse } from "./indexedCourses";
import { isSupportedRegion } from "@/lib/server/courseBrief";
import { daysToLabel } from "@/lib/coursePages";
import { resolveCoursePageRoute } from "@/lib/server/coursePageGate";

// 작업지시서 2026-10-28 "코스 페이지는 사람이 열 때만" §1① — 색인 대상 12개
describe("indexedCourses", () => {
  it("12개이고 중복이 없다", () => {
    expect(INDEXED_COURSES).toHaveLength(12);
    expect(new Set(INDEXED_COURSES.map((c) => `${c.region}/${c.days}`)).size).toBe(12);
  });
  it("모두 지원 지역이고, 코스 페이지 주소로 풀린다(일수 범위 안)", () => {
    for (const c of INDEXED_COURSES) {
      expect(isSupportedRegion(c.region), c.region).toBe(true);
      const route = resolveCoursePageRoute(c.region, daysToLabel(c.days as 1 | 2 | 3 | 4 | 5 | 6 | 7));
      expect(route.kind, `${c.region} ${c.days}`).toBe("ok");
    }
  });
  it("isIndexedCourse", () => {
    expect(isIndexedCourse("경주", 3)).toBe(true);
    expect(isIndexedCourse("경주", 2)).toBe(false);
    expect(isIndexedCourse("시드니", 4)).toBe(false);
  });
});
