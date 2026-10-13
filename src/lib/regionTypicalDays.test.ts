import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("./server/db", () => ({ pool: { query: vi.fn() } }));

import { courseSitemapPriority, distanceFromSeoulKm, maxDaysForRegion, regionTypicalDays, sortByTypicalDays, splitTypicalPages } from "./regionTypicalDays";
import { styleForRegion } from "./discoverData";
import { pickPopularCourses, groupConfirmedForHub, regionMeta, type ConfirmedCoursePage } from "./server/coursePageIndex";
import { courseCanonicalPath, dayDisplayLabel, daysToLabel } from "./coursePages";
import type { CourseDays } from "./server/courseBrief";

const page = (region: string, days: number): ConfirmedCoursePage => ({ region, days: days as CourseDays, lastModified: new Date() });

describe("regionTypicalDays — 검색량 덮어쓰기(JSON) 우선, 없으면 서울 거리 구간", () => {
  it("JSON: 일본·중화권 [3,…] · 동남아 [4,…] · 세부·코타키나발루 [4,5,7] · 시드니 [7,5]", () => {
    expect(regionTypicalDays("후쿠오카")).toEqual([3, 2, 4]);
    expect(regionTypicalDays("오사카")).toEqual([3, 4, 2]);
    expect(regionTypicalDays("도쿄")).toEqual([3, 4, 2]);
    expect(regionTypicalDays("오키나와")).toEqual([3, 4, 5]);
    expect(regionTypicalDays("다낭")).toEqual([4, 3]);
    expect(regionTypicalDays("푸꾸옥")).toEqual([4, 5, 3]);
    expect(regionTypicalDays("세부")).toEqual([4, 5, 7]);
    expect(regionTypicalDays("코타키나발루")).toEqual([4, 5, 7]);
    expect(regionTypicalDays("시드니")).toEqual([7, 5]);
    expect(regionTypicalDays("파리")).toEqual([5, 4]);
  });
  it("별칭(나트랑=냐짱)도 해석한다", () => {
    expect(regionTypicalDays("나트랑")).toEqual(regionTypicalDays("냐짱"));
  });
  it("JSON 에 없는 지역은 거리 구간: 가까운 곳 [3,4,2] · 중거리 [4,5,3] · 먼 휴양형 [7,6,5] · 먼 도시형 [5,4]", () => {
    expect(regionTypicalDays("교토")).toEqual([3, 4]); // JSON
    expect(regionTypicalDays("칭다오")).toEqual([3, 2]); // JSON
    expect(regionTypicalDays("베이징")).toEqual([3, 4, 2]); // 952km
    for (const r of ["하롱", "마닐라", "사이판"]) expect(regionTypicalDays(r)).toEqual([4, 5, 3]);
    for (const r of ["끄라비", "냐짱"]) expect(regionTypicalDays(r)).toEqual([7, 6, 5]);
    for (const r of ["호치민", "쿠알라룸푸르"]) expect(regionTypicalDays(r)).toEqual([5, 4]);
  });
  it("5,000km 이상 도시는 일수 상한이 7 — 유럽·미주도 [7,6]", () => {
    expect(maxDaysForRegion("시드니")).toBe(7);
    expect(maxDaysForRegion("파리")).toBe(7);
    expect(maxDaysForRegion("오사카")).toBe(5);
    expect(maxDaysForRegion("방콕")).toBe(5);
    expect(maxDaysForRegion("세부")).toBe(7);
    expect(regionTypicalDays("런던")).toEqual([7, 6]);
    expect(regionTypicalDays("우붓")).toEqual([7, 6]);
  });
  it("altLabel: 세부·코타키나발루·치앙마이·괌 4일(3박4일)에 3박5일 병기, URL 라벨은 그대로", () => {
    expect(dayDisplayLabel("세부", 4)).toBe("3박4일·3박5일");
    expect(dayDisplayLabel("괌", 4)).toBe("3박4일·3박5일");
    expect(dayDisplayLabel("치앙마이", 4)).toBe("3박4일·3박5일");
    expect(dayDisplayLabel("세부", 5)).toBe("4박5일");
    expect(dayDisplayLabel("오사카", 4)).toBe("3박4일");
    expect(daysToLabel(4)).toBe("3박4일");
    expect(courseCanonicalPath("세부", 4)).toBe(`/course/${encodeURIComponent("세부")}/${encodeURIComponent("3박4일")}`);
  });
  it("거리: 서울→오사카 ~830km, 다낭 ~3,000km 이상", () => {
    expect(Math.round(distanceFromSeoulKm("오사카")! / 100)).toBe(8);
    expect(distanceFromSeoulKm("다낭")!).toBeGreaterThan(3000);
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
    expect(sortByTypicalDays(pages).map((p) => p.days).slice(0, 3)).toEqual([4, 5, 7]);
    const { typical, others } = splitTypicalPages(pages);
    expect(typical.map((p) => p.days)).toEqual([4, 5, 7]);
    expect(others.map((p) => p.days)).toEqual([2, 3, 6]);
  });
  it("확인된 대표 일수가 없으면 가장 가까운 하나를 대표로 올린다", () => {
    const { typical, others } = splitTypicalPages([page("코타키나발루", 2), page("코타키나발루", 3)]);
    expect(typical.map((p) => p.days)).toEqual([3]);
    expect(others.map((p) => p.days)).toEqual([2]);
  });
  it("사이트맵 priority — 대표 0.8 · 원거리(3,000km+) 1~2일(휴양지는 3일) 0.3 · 그 외 0.5", () => {
    expect(courseSitemapPriority("코타키나발루", 4)).toBe(0.8);
    expect(courseSitemapPriority("코타키나발루", 7)).toBe(0.8);
    expect(courseSitemapPriority("코타키나발루", 2)).toBe(0.3);
    expect(courseSitemapPriority("코타키나발루", 3)).toBe(0.3);
    expect(courseSitemapPriority("코타키나발루", 6)).toBe(0.5);
    expect(courseSitemapPriority("다낭", 4)).toBe(0.8);
    expect(courseSitemapPriority("다낭", 1)).toBe(0.3);
    expect(courseSitemapPriority("다낭", 2)).toBe(0.3);
    expect(courseSitemapPriority("오사카", 3)).toBe(0.8);
    expect(courseSitemapPriority("오사카", 1)).toBe(0.5); // 가까운 지역 1일은 낮추지 않는다
    expect(courseSitemapPriority("괌", 2)).toBe(0.5); // 지시서가 중거리로 못박은 곳
  });
});

describe("허브·인기 코스 첫 칩", () => {
  const confirmed = [
    ...[2, 3, 4, 5, 6, 7].map((d) => page("코타키나발루", d)),
    ...[2, 4, 5, 7].map((d) => page("세부", d)),
    ...[2, 3, 4, 5].map((d) => page("다낭", d)),
    ...[2, 3, 4].map((d) => page("오사카", d)),
  ];
  it("pickPopularCourses — 코타키나발루·세부 3박4일, 다낭 3박4일, 오사카 2박3일, 시드니는 5박7일 조합이 있을 때만", () => {
    const label = (r: string) => daysToLabel(pickPopularCourses([...confirmed, page("시드니", 2), page("우붓", 1)], 20).find((p) => p.region === r)!.days);
    expect(label("코타키나발루")).toBe("3박4일");
    expect(label("세부")).toBe("3박4일");
    expect(label("다낭")).toBe("3박4일");
    expect(label("오사카")).toBe("2박3일");
    const regions = pickPopularCourses([...confirmed, page("시드니", 2), page("우붓", 1)], 20).map((p) => p.region);
    expect(regions).not.toContain("시드니"); // 비대표 일수(2박3일)만 있는 지역은 카드 없음
    expect(regions).not.toContain("우붓"); // 해외 당일치기 카드 없음
    expect(pickPopularCourses([page("시드니", 7)], 5).map((p) => `${p.region}/${p.days}`)).toEqual(["시드니/7"]);
  });
  it("groupConfirmedForHub 지역 카드의 첫 칩(splitTypicalPages)", () => {
    const regions = groupConfirmedForHub(confirmed).flatMap((g) => g.regions);
    const first = (r: string) => daysToLabel(splitTypicalPages(regions.find((x) => x.region === r)!.pages).typical[0].days);
    expect(first("코타키나발루")).toBe("3박4일");
    expect(first("세부")).toBe("3박4일");
    expect(first("다낭")).toBe("3박4일");
  });
});

// 작업지시서 2026-10-13 "#309 검증" §2 — 인기 코스가 첫 나라(일본)로만 채워지지 않게.
describe("pickPopularCourses 다양성", () => {
  const jp = ["고베", "교토", "나고야", "나라", "도쿄", "삿포로", "오사카", "오이타", "오키나와", "요코하마", "유후인", "후쿠오카"];
  const confirmed = [
    ...jp.map((r) => page(r, 3)),
    ...["다낭", "하노이"].map((r) => page(r, 4)), page("호이안", 5), page("냐짱", 7),
    page("방콕", 4), page("파타야", 5), page("끄라비", 7),
    ...["세부", "보라카이"].map((r) => page(r, 4)),
    ...["서울", "부산", "강릉"].map((r) => page(r, 2)), page("제주", 3),
  ];
  const picked = pickPopularCourses(confirmed, 12);
  const country = (r: string) => regionMeta(r)?.scope === "domestic" ? "국내" : regionMeta(r)?.parent;
  it("일본 ≤ 3 · 국내 ≥ 2 · 해외 휴양지 ≥ 2, 12개를 채운다", () => {
    expect(picked).toHaveLength(12);
    expect(picked.filter((p) => country(p.region) === "일본").length).toBeLessThanOrEqual(3);
    expect(picked.filter((p) => country(p.region) === "국내").length).toBeGreaterThanOrEqual(2);
    expect(picked.filter((p) => country(p.region) !== "국내" && styleForRegion(p.region) === "resort").length).toBeGreaterThanOrEqual(2);
  });
  it("나라 라운드로빈 — 처음 세 칸은 서로 다른 나라, 같은 지역은 한 번만", () => {
    expect(new Set(picked.slice(0, 3).map((p) => country(p.region))).size).toBe(3);
    expect(new Set(picked.map((p) => p.region)).size).toBe(picked.length);
  });
});
