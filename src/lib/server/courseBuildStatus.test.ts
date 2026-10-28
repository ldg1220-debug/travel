import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { bumpCourseCounter, courseCounterKey, getCourseBuildStatus, getVersionProgress, recordUserAgent, userAgentKey, warmSourceFrom, recordRebuildEvent, recordWarmRun } from "./courseBuildStatus";

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
    expect(JSON.parse(queryMock.mock.calls[0][1][1])).toEqual({ lastWarmAt: NOW.toISOString(), lastWarmResult: "처리 4건", lastWarmSource: "manual" });
  });

  it("getCourseBuildStatus: 상태 행과 오늘 카운터를 합쳐 돌려준다(없으면 0 · 조회 실패면 null)", async () => {
    queryMock.mockImplementation(async (_sql: string, params: string[]) => {
      if (params[0] === "course-build:status") return { rows: [{ payload: { lastRebuildAt: "2026-10-21T11:00:00.000Z", lastRebuildKey: "k", lastRebuildResult: "ok: spots=15", lastWarmAt: "2026-10-21T05:00:00.000Z", lastWarmSource: "vercel-cron" } }] };
      if (params[0].startsWith("course-build-day:stale")) return { rows: [{ payload: { count: 7 } }] };
      if (params[0].startsWith("course-build-day:human")) return { rows: [{ payload: { count: 3 } }] };
      return { rows: [] }; // bot — 아직 행 없음
    });
    const s = await getCourseBuildStatus(44, NOW);
    expect(s).toMatchObject({ currentVersion: 44, lastRebuildResult: "ok: spots=15", lastRebuildKey: "k", lastWarmAt: "2026-10-21T05:00:00.000Z", lastWarmSource: "vercel-cron", staleServedToday: 7, visitsHumanToday: 3, visitsBotToday: 0 });
    expect(s.lastRebuildStartedAt).toBeNull();
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryMock.mockReset();
    for (let i = 0; i < 4; i++) queryMock.mockRejectedValueOnce(new Error("db down"));
    const down = await getCourseBuildStatus(44, NOW);
    expect(down.staleServedToday).toBeNull();
    expect(down.lastRebuildAt).toBeNull();
  });

  // 작업지시서 2026-10-22 "#336 검증" §2④⑤ — 버전 전환 진행률 · 로봇 재생성 카운터
  it("versionProgress: 색인 대상 중 현재 버전 / 직전 버전만 / 없음을 센다", async () => {
    queryMock.mockImplementation(async () => ({
      rows: ["content-brief:overseas:오사카:3:v45", "content-brief:overseas:오사카:3:v44", "content-brief:overseas:홍콩:3:v44", "content-brief:overseas:도쿄:3:v45"].map((cache_key) => ({ cache_key })),
    }));
    const key = (scope: string, region: string, days: number) => ({ region, days, currentKey: `content-brief:${scope}:${region}:${days}:v45` });
    const indexed = [key("overseas", "오사카", 3), key("overseas", "홍콩", 3), key("overseas", "나고야", 4), key("overseas", "방콕", 4)];
    expect(await getVersionProgress(1000, indexed)).toEqual({
      total: 4,
      onCurrent: 1,
      onPrevious: 1,
      missing: 2,
      missingList: [
        { region: "나고야", days: 4 },
        { region: "방콕", days: 4 },
      ],
    });
  });

  it("봇 재생성·동기 빌드 카운터를 courseBuild 에 싣는다", async () => {
    queryMock.mockImplementation(async (_sql: string, params?: string[]) => {
      if (params?.[0]?.startsWith("course-build-day:sync")) return { rows: [{ payload: { count: 9 } }] };
      return { rows: [] };
    });
    const s = await getCourseBuildStatus(45, NOW);
    expect(s.syncBuildsToday).toBe(9);
    expect(s.rebuildTriggeredByBotToday).toBe(0);
    expect(s.versionProgress).toEqual({ total: 0, onCurrent: 0, onPrevious: 0, missing: 0, missingList: [] });
    expect(s.indexed).toEqual({ total: 0, fresh: 0, missing: 0 });
  });

  // 작업지시서 2026-10-27 "사람 방문 218" §2⑤ — 출처별 방문 · 상위 User-Agent
  it("userAgentKey: 오늘 날짜 + UA 앞 60자, recordUserAgent 는 upsert 로 센다", async () => {
    const long = "Mozilla/5.0 " + "x".repeat(100);
    expect(userAgentKey(long, NOW)).toBe(`course-ua:2026-10-21:${long.slice(0, 60)}`);
    expect(userAgentKey(null, NOW)).toBe("course-ua:2026-10-21:(none)");
    queryMock.mockResolvedValueOnce({ rows: [] });
    await recordUserAgent("curl/8.4", NOW);
    expect(queryMock.mock.calls[0][1]).toEqual(["course-ua:2026-10-21:curl/8.4"]);
  });

  it("visitsBySource · topUserAgents 를 courseBuild 에 싣는다", async () => {
    queryMock.mockImplementation(async (rawSql: unknown, params?: unknown[]) => {
      const sql = String(rawSql);
      const key = String(params?.[0] ?? "");
      if (key === "course-build-day:human:2026-10-21") return { rows: [{ payload: { count: 12 } }] };
      if (key === "course-build-day:bot:2026-10-21") return { rows: [{ payload: { count: 400 } }] };
      if (key === "course-build-day:internal:2026-10-21") return { rows: [{ payload: { count: 30 } }] };
      if (key === "course-build-day:api:2026-10-21") return { rows: [{ payload: { count: 150 } }] };
      if (sql.includes("left(cache_key")) return { rows: [{ cache_key: "course-ua:2026-10-21:python-requests/2.31", n: 90 }] };
      return { rows: [] };
    });
    const s = await getCourseBuildStatus(45, NOW);
    expect(s.visitsBySource).toEqual({ human: 12, bot: 400, internal: 30, api: 150 });
    expect(s.topUserAgents).toEqual([{ userAgent: "python-requests/2.31", count: 90 }]);
  });

  // 작업지시서 2026-10-27 "워밍 하루 2회" §1② — 워밍 호출 출처
  it("warmSourceFrom: vercel-cron UA → vercel-cron, X-Warm-Source: gh-actions → gh-actions, 그 밖은 manual", () => {
    expect(warmSourceFrom("vercel-cron/1.0", null)).toBe("vercel-cron");
    expect(warmSourceFrom("curl/8.5.0", "gh-actions")).toBe("gh-actions");
    expect(warmSourceFrom("curl/8.5.0", null)).toBe("manual");
    expect(warmSourceFrom(null, "other")).toBe("manual");
  });
});
