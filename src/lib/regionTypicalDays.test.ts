import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("./server/db", () => ({ pool: { query: vi.fn() } }));

import { courseSitemapPriority, regionTypicalDays, sortByTypicalDays, splitTypicalPages } from "./regionTypicalDays";
import { pickPopularCourses, groupConfirmedForHub, type ConfirmedCoursePage } from "./server/coursePageIndex";
import { daysToLabel } from "./coursePages";
import type { CourseDays } from "./server/courseBrief";

const page = (region: string, days: number): ConfirmedCoursePage => ({ region, days: days as CourseDays, lastModified: new Date() });

describe("regionTypicalDays", () => {
  it("개별 덮어쓰기와 스타일 기본값", () => {
    expect(regionTypicalDays("코타키나발루")).toEqual([7, 6, 5]);
    expect(regionTypicalDays("세부")).toEqual([7, 6, 5]);
    expect(regionTypicalDays("다낭")).toEqual([5, 4, 3]);
    expect(regionTypicalDays("오키나와")).toEqual([5, 4, 3]);
    expect(regionTypicalDays("오사카")).toEqual([3, 4, 2]);
    expect(regionTypicalDays("방콕")).toEqual([3, 4, 2]);
    expect(regionTypicalDays("끄라비")).toEqual([7, 6, 5]); // 휴양형 기본
    expect(regionTypicalDays("파리")).toEqual([3, 2, 4]); // 도시형 기본
  });
  it("국내는 [2,1,3], 제주는 [3,2,4]", () => {
    expect(regionTypicalDays("서울")).toEqual([2, 1, 3]);
    expect(regionTypicalDays("부산")).toEqual([2, 1, 3]);
    expect(regionTypicalDays("제주")).toEqual([3, 2, 4]);
    expect(regionTypicalDays("서귀포")).toEqual([3, 2, 4]);
  });
  it("별칭(나트랑)도 같은 표를 쓴다", () => {
    expect(regionTypicalDays("나트랑")).toEqual([7, 6, 5]);
  });
  it("sortByTypicalDays·splitTypicalPages — 대표 일수가 앞, 나머지는 오름차순", () => {
    const pages = [2, 3, 4, 5, 6, 7].map((d) => page("코타키나발루", d));
    expect(sortByTypicalDays(pages).map((p) => p.days).slice(0, 3)).toEqual([7, 6, 5]);
    const { typical, others } = splitTypicalPages(pages);
    expect(typical.map((p) => p.days)).toEqual([7, 6, 5]);
    expect(others.map((p) => p.days)).toEqual([2, 3, 4]);
  });
  it("확인된 대표 일수가 없으면 가장 가까운 하나를 대표로 올린다", () => {
    const { typical, others } = splitTypicalPages([page("코타키나발루", 2), page("코타키나발루", 3)]);
    expect(typical.map((p) => p.days)).toEqual([3]);
    expect(others.map((p) => p.days)).toEqual([2]);
  });
  it("사이트맵 priority — 대표 0.8 · 휴양형 1~2일 0.3 · 그 외 0.7", () => {
    expect(courseSitemapPriority("코타키나발루", 7)).toBe(0.8);
    expect(courseSitemapPriority("코타키나발루", 2)).toBe(0.3);
    expect(courseSitemapPriority("코타키나발루", 3)).toBe(0.7);
    expect(courseSitemapPriority("다낭", 5)).toBe(0.8);
    expect(courseSitemapPriority("다낭", 2)).toBe(0.3);
    expect(courseSitemapPriority("오사카", 3)).toBe(0.8);
    expect(courseSitemapPriority("오사카", 1)).toBe(0.7); // 도시형 1일은 낮추지 않는다
  });
});

describe("허브·인기 코스 첫 칩", () => {
  const confirmed = [
    ...[2, 3, 5, 6, 7].map((d) => page("코타키나발루", d)),
    ...[2, 5, 7].map((d) => page("세부", d)),
    ...[2, 3, 4, 5].map((d) => page("다낭", d)),
    ...[2, 3, 4].map((d) => page("오사카", d)),
  ];
  it("pickPopularCourses — 코타키나발루·세부 5박7일, 다낭 4박5일, 오사카 2박3일", () => {
    const label = (r: string) => daysToLabel(pickPopularCourses(confirmed, 20).find((p) => p.region === r)!.days);
    expect(label("코타키나발루")).toBe("5박7일");
    expect(label("세부")).toBe("5박7일");
    expect(label("다낭")).toBe("4박5일");
    expect(label("오사카")).toBe("2박3일");
  });
  it("groupConfirmedForHub 지역 카드의 첫 칩(splitTypicalPages)", () => {
    const regions = groupConfirmedForHub(confirmed).flatMap((g) => g.regions);
    const first = (r: string) => daysToLabel(splitTypicalPages(regions.find((x) => x.region === r)!.pages).typical[0].days);
    expect(first("코타키나발루")).toBe("5박7일");
    expect(first("세부")).toBe("5박7일");
    expect(first("다낭")).toBe("4박5일");
  });
});
