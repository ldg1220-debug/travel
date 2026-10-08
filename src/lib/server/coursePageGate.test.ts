import { describe, expect, it } from "vitest";
import { judgeCourseBrief, minDaysForStyle, resolveCoursePageRoute } from "./coursePageGate";
import { courseCanonicalPath } from "@/lib/coursePages";
import type { CourseBriefSpot } from "./courseBrief";

// 작업지시서 2026-10-08 "코스 페이지가 전부 404입니다" §1 — 입구는 허용목록이 아니라 (지원 지역 × 일수 범위).

function spot(over: Partial<CourseBriefSpot> = {}): CourseBriefSpot {
  return { name: "x", category: "관광지", rating: 4.5, reviewCount: 100, lat: 0, lng: 0, order: 1, day: 1, toNextMinutes: 5, toNextMode: "walk", ...over };
}

describe("resolveCoursePageRoute", () => {
  it.each([
    ["서울", "1박2일", 2],
    ["경주", "2박3일", 3],
    ["오사카", "2박3일", 3],
    ["도쿄", "당일치기", 1],
    ["세부", "5박7일", 7],
  ])("%s %s → ok (days=%i)", (region, label, days) => {
    expect(resolveCoursePageRoute(region, label)).toEqual({ kind: "ok", region, days });
  });

  it("숫자 일수는 정본 라벨 주소로 리다이렉트한다", () => {
    expect(resolveCoursePageRoute("오사카", "3")).toEqual({ kind: "redirect", to: courseCanonicalPath("오사카", 3) });
    expect(resolveCoursePageRoute("서울", "2")).toEqual({ kind: "redirect", to: courseCanonicalPath("서울", 2) });
  });

  it("별칭 지역명은 정본 지역으로 리다이렉트한다(발리 → 우붓)", () => {
    expect(resolveCoursePageRoute("발리", "1박2일")).toEqual({ kind: "redirect", to: courseCanonicalPath("우붓", 2) });
  });

  it("지원하지 않는 지역·모르는 일수·범위 밖 일수는 사유와 함께 거절한다", () => {
    expect(resolveCoursePageRoute("아틀란티스", "1박2일")).toMatchObject({ kind: "reject", reason: expect.stringContaining("unsupported-region") });
    expect(resolveCoursePageRoute("서울", "9박10일")).toMatchObject({ kind: "reject", reason: expect.stringContaining("unknown-days-segment") });
    expect(resolveCoursePageRoute("오사카", "5박6일")).toMatchObject({ kind: "reject", reason: expect.stringContaining("days-out-of-range") }); // 도시형 최대 5일
    expect(resolveCoursePageRoute("세부", "당일치기")).toMatchObject({ kind: "reject", reason: expect.stringContaining("days-out-of-range") }); // 휴양형 최소 2일
    expect(resolveCoursePageRoute("서울", "6")).toMatchObject({ kind: "reject" });
  });

  it("minDaysForStyle: 도시형 1일 · 휴양형 2일", () => {
    expect([minDaysForStyle("city"), minDaysForStyle("resort")]).toEqual([1, 2]);
  });
});

describe("judgeCourseBrief — API(422)·사이트맵과 같은 기준", () => {
  it("충분하고 평점이 있으면 통과, 스팟 부족·평점 절반 미만·휴양형 해변 없음이면 사유를 돌려준다", () => {
    const spots = (n: number, over: Partial<CourseBriefSpot> = {}) => Array.from({ length: n }, (_, i) => spot({ order: i + 1, ...over }));
    expect(judgeCourseBrief({ spots: spots(9) }, "서울", 3)).toBeNull();
    expect(judgeCourseBrief({ spots: spots(8) }, "서울", 3)).toContain("thin");
    expect(judgeCourseBrief({ spots: spots(9, { rating: null }) }, "서울", 3)).toContain("thin");
    expect(judgeCourseBrief({ spots: spots(14) }, "세부", 7)).toBe("no-beach");
    expect(judgeCourseBrief({ spots: [...spots(13), spot({ beach: true })] }, "세부", 7)).toBeNull();
  });
});
