import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("./server/db", () => ({ pool: { query: vi.fn() } }));

import { courseSitemapPriority, distanceFromSeoulKm, regionTypicalDays, sortByTypicalDays, splitTypicalPages } from "./regionTypicalDays";
import { styleForRegion } from "./discoverData";
import { pickPopularCourses, groupConfirmedForHub, regionMeta, type ConfirmedCoursePage } from "./server/coursePageIndex";
import { daysToLabel } from "./coursePages";
import type { CourseDays } from "./server/courseBrief";

const page = (region: string, days: number): ConfirmedCoursePage => ({ region, days: days as CourseDays, lastModified: new Date() });

describe("regionTypicalDays — 서울 거리 구간", () => {
  it("가까운 곳(~1,500km): 일본·대만·오키나와 [3,4,2]", () => {
    for (const r of ["오사카", "도쿄", "후쿠오카", "오키나와", "타이베이", "상하이"]) expect(regionTypicalDays(r)).toEqual([3, 4, 2]);
  });
  it("1,500~3,000km: 홍콩·하롱·마닐라 [4,5,3], 괌·사이판은 지시서 배정대로 같은 구간", () => {
    for (const r of ["홍콩", "마카오", "하롱", "마닐라", "괌", "사이판"]) expect(regionTypicalDays(r)).toEqual([4, 5, 3]);
  });
  it("3,000~5,000km: 휴양형 [7,6,5] · 도시형 [5,4](6일은 도시형 상한 밖)", () => {
    for (const r of ["세부", "냐짱", "푸꾸옥", "끄라비", "코타키나발루"]) expect(regionTypicalDays(r)).toEqual([7, 6, 5]);
    for (const r of ["다낭", "방콕", "싱가포르", "호치민"]) expect(regionTypicalDays(r)).toEqual([5, 4]);
  });
  it("5,000km 이상: 휴양형은 [7,6], 도시형은 상한 안에서 [5,4]", () => {
    expect(regionTypicalDays("우붓")).toEqual([7, 6]);
    expect(regionTypicalDays("시드니")).toEqual([5, 4]);
    expect(regionTypicalDays("파리")).toEqual([5, 4]);
  });
  it("JSON 덮어쓰기(코타키나발루 [7,6,5])가 거리 계산보다 우선하고, 별칭(나트랑)도 해석한다", () => {
    expect(regionTypicalDays("코타키나발루")).toEqual([7, 6, 5]);
    expect(regionTypicalDays("나트랑")).toEqual([7, 6, 5]);
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
  it("사이트맵 priority — 대표 0.8 · 원거리(3,000km+) 1~2일 0.3 · 그 외 0.5", () => {
    expect(courseSitemapPriority("코타키나발루", 7)).toBe(0.8);
    expect(courseSitemapPriority("코타키나발루", 2)).toBe(0.3);
    expect(courseSitemapPriority("코타키나발루", 3)).toBe(0.3); // 대표 1순위가 7일인 지역은 3일 이하 0.3
    expect(courseSitemapPriority("코타키나발루", 4)).toBe(0.5);
    expect(courseSitemapPriority("다낭", 5)).toBe(0.8);
    expect(courseSitemapPriority("다낭", 1)).toBe(0.3);
    expect(courseSitemapPriority("오사카", 3)).toBe(0.8);
    expect(courseSitemapPriority("오사카", 1)).toBe(0.5); // 가까운 지역 1일은 낮추지 않는다
    expect(courseSitemapPriority("괌", 2)).toBe(0.5); // 지시서가 중거리로 못박은 곳
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

// 작업지시서 2026-10-13 "#309 검증" §2 — 인기 코스가 첫 나라(일본)로만 채워지지 않게.
describe("pickPopularCourses 다양성", () => {
  const jp = ["고베", "교토", "나고야", "나라", "도쿄", "삿포로", "오사카", "오이타", "오키나와", "요코하마", "유후인", "후쿠오카"];
  const confirmed = [
    ...jp.map((r) => page(r, 3)),
    ...["다낭", "하노이", "호이안", "냐짱"].map((r) => page(r, 5)),
    ...["방콕", "파타야", "끄라비"].map((r) => page(r, 5)),
    ...["세부", "보라카이"].map((r) => page(r, 7)),
    ...["서울", "부산", "제주", "강릉"].map((r) => page(r, 2)),
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
