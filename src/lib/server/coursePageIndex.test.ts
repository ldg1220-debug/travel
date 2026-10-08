import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));

import { fetchConfirmedCoursePages, pickRelatedCourseLinks, resetConfirmedCoursePagesMemo, type ConfirmedCoursePage } from "./coursePageIndex";
import { COURSE_ALGO_VERSION } from "./courseBrief";

// 작업지시서 2026-10-08 "코스 페이지가 전부 404입니다" §2·§3 — 확인된 조합 목록과 내부 링크.

const spots = (n: number, extra: object = {}) => Array.from({ length: n }, (_, i) => ({ name: `s${i}`, category: "관광지", rating: 4.4, ...extra }));

describe("fetchConfirmedCoursePages", () => {
  beforeEach(() => {
    queryMock.mockReset();
    resetConfirmedCoursePagesMemo();
  });

  it("현재 알고리즘 버전의 브리프 캐시에서 페이지 기준을 통과한 조합만 lastmod(생성 시각)와 함께 돌려준다", async () => {
    const created = new Date("2026-10-07T01:00:00Z");
    queryMock.mockResolvedValue({
      rows: [
        { region: "오사카", days: "3", created_at: created, spots: spots(12) },
        { region: "서울", days: "3", created_at: created, spots: spots(5) }, // 스팟 부족(422 조합)
        { region: "세부", days: "7", created_at: created, spots: spots(16) }, // 해변 없음
        { region: "세부", days: "7", created_at: created, spots: spots(16, { beach: true }) },
        { region: null, days: "3", created_at: created, spots: spots(12) },
      ],
    });
    const result = await fetchConfirmedCoursePages();
    expect(result.map((p) => `${p.region}/${p.days}`)).toEqual(["오사카/3", "세부/7"]);
    expect(result[0].lastModified).toEqual(created);
    expect(queryMock.mock.calls[0][1][0]).toBe(`content-brief:%:v${COURSE_ALGO_VERSION}`);
  });

  it("DB 장애면 빈 목록(사이트맵 전체가 죽지 않는다)이고, 성공 결과는 메모된다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryMock.mockRejectedValueOnce(new Error("db down"));
    expect(await fetchConfirmedCoursePages()).toEqual([]);
    queryMock.mockResolvedValue({ rows: [{ region: "오사카", days: "3", created_at: new Date(), spots: spots(12) }] });
    expect(await fetchConfirmedCoursePages()).toHaveLength(1);
    await fetchConfirmedCoursePages();
    expect(queryMock).toHaveBeenCalledTimes(2); // 두 번째 성공 호출 이후는 메모
  });
});

describe("pickRelatedCourseLinks", () => {
  const page = (region: string, days: number): ConfirmedCoursePage => ({ region, days: days as 1, lastModified: new Date() });
  const parent = (r: string) => ({ 오사카: "일본", 도쿄: "일본", 교토: "일본", 시드니: "호주" })[r];

  it("같은 지역 다른 일수는 일수 순, 같은 나라 다른 지역은 지역당 1개(같은 일수 우선)로 걸고 다른 나라는 거른다", () => {
    const confirmed = [page("오사카", 2), page("오사카", 3), page("오사카", 4), page("도쿄", 2), page("도쿄", 3), page("교토", 5), page("시드니", 3)];
    const links = pickRelatedCourseLinks({ region: "오사카", days: 3 }, confirmed, parent);
    expect(links.sameRegion.map((p) => p.days)).toEqual([2, 4]);
    expect(links.sameCountry.map((p) => `${p.region}/${p.days}`)).toEqual(["교토/5", "도쿄/3"]);
  });

  it("확인된 조합이 없으면 링크도 없다(404가 될 수 있는 페이지로 걸지 않는다)", () => {
    expect(pickRelatedCourseLinks({ region: "오사카", days: 3 }, [], parent)).toEqual({ sameRegion: [], sameCountry: [] });
  });
});
