import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
vi.mock("@/lib/server/db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { courseVisitKey, fetchRecentlyVisitedTasks, recordCourseVisit } from "./courseVisits";
import { pickStaleTasks } from "./courseBrief";

// 작업지시서 2026-10-14 "긴급: #319 이후 Places 호출 비용" §2③ — 최근 방문된 조합만 워밍.
describe("courseVisits", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it("방문을 기록하고 같은 조합은 10분에 한 번만 쓴다", () => {
    const t0 = Date.now() + 10_000_000;
    recordCourseVisit("테스트도시", 3, t0);
    recordCourseVisit("테스트도시", 3, t0 + 1000);
    expect(queryMock).toHaveBeenCalledTimes(1);
    recordCourseVisit("테스트도시", 3, t0 + 11 * 60 * 1000);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][1][0]).toBe(courseVisitKey("테스트도시", 3));
  });

  it("최근 방문 목록: 지역·일수 형식이 맞는 것만", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ region: "오사카", days: "3" }, { region: null, days: "2" }, { region: "도쿄", days: "9" }, { region: "세부", days: "4" }] });
    expect(await fetchRecentlyVisitedTasks()).toEqual([
      { region: "오사카", days: 3 },
      { region: "세부", days: 4 },
    ]);
  });
});

describe("pickStaleTasks minAgeMs", () => {
  it("minAgeMs 보다 최근에 만든 캐시는 건너뛰고, 캐시 없음·오래된 것만 오래된 순으로", async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();
    queryMock.mockReset();
    queryMock.mockImplementation(async (_sql: string, params: string[][]) => ({
      rows: [
        { cache_key: params[0][0], created_at: hoursAgo(5) }, // 신선
        { cache_key: params[0][1], created_at: hoursAgo(22) }, // 곧 만료
        // params[0][2] 는 캐시 없음
      ],
    }));
    const tasks = [
      { region: "오사카", days: 3 as const },
      { region: "도쿄", days: 3 as const },
      { region: "교토", days: 3 as const },
    ];
    const picked = await pickStaleTasks(tasks, 5, { minAgeMs: 20 * 3600 * 1000 });
    expect(picked.map((t) => t.region)).toEqual(["교토", "도쿄"]); // 캐시 없음 → 22시간 묵음, 5시간 된 오사카는 제외
    expect(await pickStaleTasks(tasks, 1, { minAgeMs: 20 * 3600 * 1000 })).toHaveLength(1);
    expect(await pickStaleTasks([], 5)).toEqual([]);
  });
});
