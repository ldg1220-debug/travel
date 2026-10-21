import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { bumpCourseCounter, courseCounterKey, getCourseBuildStatus, recordRebuildEvent, recordWarmRun } from "./courseBuildStatus";

const NOW = new Date("2026-10-21T12:00:00Z"); // 태평양 10/21

// 작업지시서 2026-10-21 "v44 재생성 멈춤" §2④⑤ — /api/health courseBuild
describe("courseBuildStatus", () => {
  beforeEach(() => queryMock.mockReset());

  it("카운터 키는 종류·태평양 날짜", () => {
    expect(courseCounterKey("human", NOW)).toBe("course-build-day:human:2026-10-21");
    expect(courseCounterKey("bot", new Date("2026-10-21T03:00:00Z"))).toBe("course-build-day:bot:2026-10-20"); // 태평양 아직 10/20
  });

  it("bumpCourseCounter 는 upsert 로 1 올리고, DB 오류는 삼킨다", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await bumpCourseCounter("stale", NOW);
    expect(queryMock.mock.calls[0][0]).toContain("on conflict (cache_key) do update");
    expect(queryMock.mock.calls[0][1]).toEqual(["course-build-day:stale:2026-10-21"]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryMock.mockRejectedValueOnce(new Error("db down"));
    await expect(bumpCourseCounter("human", NOW)).resolves.toBeUndefined();
  });

  it("recordRebuildEvent: 상태 행에 합치고(jsonb ||), started 는 시작 시각, ok 는 완료 시각을 함께 남긴다", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await recordRebuildEvent({ key: "content-brief:overseas:오사카:3:v44", result: "started" }, NOW);
    await recordRebuildEvent({ key: "content-brief:overseas:오사카:3:v44", result: "ok", detail: "spots=15" }, NOW);
    await recordRebuildEvent({ key: "k", result: "fail", detail: "boom" }, NOW);
    const patches = queryMock.mock.calls.map((c) => JSON.parse(c[1][1]));
    expect(queryMock.mock.calls[0][0]).toContain("place_candidate_cache.payload || excluded.payload");
    expect(patches[0]).toMatchObject({ lastRebuildResult: "started", lastRebuildStartedAt: NOW.toISOString(), lastRebuildKey: "content-brief:overseas:오사카:3:v44" });
    expect(patches[1]).toMatchObject({ lastRebuildResult: "ok: spots=15", lastRebuildOkAt: NOW.toISOString() });
    expect(patches[2]).toMatchObject({ lastRebuildResult: "fail: boom" });
    expect(patches[2]).not.toHaveProperty("lastRebuildOkAt");
  });

  it("recordWarmRun 은 lastWarm* 를 남긴다", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await recordWarmRun("처리 4건", NOW);
    expect(JSON.parse(queryMock.mock.calls[0][1][1])).toEqual({ lastWarmAt: NOW.toISOString(), lastWarmResult: "처리 4건" });
  });

  it("getCourseBuildStatus: 상태 행과 오늘 카운터를 합쳐 돌려준다(없으면 0 · 조회 실패면 null)", async () => {
    queryMock.mockImplementation(async (_sql: string, params: string[]) => {
      if (params[0] === "course-build:status") return { rows: [{ payload: { lastRebuildAt: "2026-10-21T11:00:00.000Z", lastRebuildKey: "k", lastRebuildResult: "ok: spots=15", lastWarmAt: "2026-10-21T05:00:00.000Z" } }] };
      if (params[0].startsWith("course-build-day:stale")) return { rows: [{ payload: { count: 7 } }] };
      if (params[0].startsWith("course-build-day:human")) return { rows: [{ payload: { count: 3 } }] };
      return { rows: [] }; // bot — 아직 행 없음
    });
    const s = await getCourseBuildStatus(44, NOW);
    expect(s).toMatchObject({ currentVersion: 44, lastRebuildResult: "ok: spots=15", lastRebuildKey: "k", lastWarmAt: "2026-10-21T05:00:00.000Z", staleServedToday: 7, visitsHumanToday: 3, visitsBotToday: 0 });
    expect(s.lastRebuildStartedAt).toBeNull();
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryMock.mockReset();
    for (let i = 0; i < 4; i++) queryMock.mockRejectedValueOnce(new Error("db down"));
    const down = await getCourseBuildStatus(44, NOW);
    expect(down.staleServedToday).toBeNull();
    expect(down.lastRebuildAt).toBeNull();
  });
});
