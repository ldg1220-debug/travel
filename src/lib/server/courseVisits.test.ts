import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { fetchSitemapTasks } from "./courseVisits";

// 작업지시서 2026-10-21 "v44 재생성 멈춤" §2③ — 워밍 대상이 비는 날의 대체 목록
describe("fetchSitemapTasks", () => {
  beforeEach(() => queryMock.mockReset());

  it("course-sitemap 기록을 (지역, 일수)로 바꾸고 잘못된 행은 건너뛴다", async () => {
    queryMock.mockResolvedValue({ rows: [{ region: "홍콩", days: "4" }, { region: "오사카", days: "3" }, { region: null, days: "2" }, { region: "도쿄", days: "9" }, { region: "나고야", days: "x" }] });
    expect(await fetchSitemapTasks(50)).toEqual([{ region: "홍콩", days: 4 }, { region: "오사카", days: 3 }]);
    expect(queryMock.mock.calls[0][0]).toContain("like 'course-sitemap:%'");
    expect(queryMock.mock.calls[0][1]).toEqual([50]);
  });
  it("DB 오류면 빈 목록", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryMock.mockRejectedValueOnce(new Error("db down"));
    expect(await fetchSitemapTasks()).toEqual([]);
  });
});
