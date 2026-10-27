import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/server/db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
const afterMock = vi.fn();
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => afterMock(fn) }));

import { acquireRebuildLock, briefCacheKey, pickStaleTasks, scheduleBackgroundRebuild } from "./courseBrief";

// 작업지시서 2026-10-20 "v42가 적용되지 않습니다" A-1 — 직전 버전을 내보낸 뒤 응답 후 재생성(after) · 10분 잠금 · 로그.
describe("acquireRebuildLock", () => {
  beforeEach(() => queryMock.mockReset());

  it("행이 새로 생기거나 10분 지난 잠금을 갱신하면 true, 아직 유효한 잠금이면 false", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ cache_key: "x" }] });
    expect(await acquireRebuildLock("content-brief:overseas:홍콩:4:v42")).toBe(true);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("on conflict (cache_key) do update");
    expect(params[0]).toBe("rebuild-lock:content-brief:overseas:홍콩:4:v42");
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await acquireRebuildLock("content-brief:overseas:홍콩:4:v42")).toBe(false);
  });

  it("DB 오류면 시도하지 않는다(false)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryMock.mockRejectedValueOnce(new Error("db down"));
    expect(await acquireRebuildLock("k")).toBe(false);
  });
});

describe("scheduleBackgroundRebuild", () => {
  beforeEach(() => {
    queryMock.mockReset();
    afterMock.mockReset();
  });

  it("after() 로 감싸 응답 뒤에 돌린다 · 잠금을 못 얻으면 rebuild-skip 로그만 남기고 만들지 않는다", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    scheduleBackgroundRebuild("홍콩", 4, "content-brief:overseas:홍콩:4:v42");
    expect(afterMock).toHaveBeenCalledTimes(1);
    await (afterMock.mock.calls[0][0] as () => Promise<void>)();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("path=rebuild-skip key=content-brief:overseas:홍콩:4:v42 reason=lock"));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("rebuild-start"));
  });

  it("요청 스코프 밖이라 after() 가 던져도 예외 없이 백그라운드로 띄운다", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    afterMock.mockImplementation(() => {
      throw new Error("after was called outside a request scope");
    });
    expect(() => scheduleBackgroundRebuild("홍콩", 4, "k")).not.toThrow();
  });

  // 작업지시서 2026-10-22 "#336 검증" §2② — 재생성 몫이 없으면 spots=0 으로 빌드를 시도하지 않고 deferred: budget 으로 기록하고 다음 워밍 때 먼저 만든다.
  it("오늘 재생성 몫이 바닥이면 빌드를 시도하지 않고 deferred 로 기록한다(실패 아님)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const status: string[] = [];
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("rebuild-lock") || (params?.[0] as string | undefined)?.startsWith("rebuild-lock")) return { rowCount: 1, rows: [{ cache_key: "x" }] };
      if (sql.includes("course-build:status") || (params?.[0] as string | undefined) === "course-build:status") status.push(String(params?.[1]));
      // 집계(text-search-all) 카운터가 상한을 넘은 것으로 보이게 한다
      if (sql.includes("select (payload->>'count')::int as n")) return { rows: [{ n: 10_000 }] };
      return { rowCount: 1, rows: [] };
    });
    scheduleBackgroundRebuild("홍콩", 4, "content-brief:overseas:홍콩:4:v45");
    await (afterMock.mock.calls[0][0] as () => Promise<void>)();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("path=rebuild-deferred key=content-brief:overseas:홍콩:4:v45 reason=budget"));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("rebuild-start"));
    expect(status.some((p) => p.includes("deferred: budget"))).toBe(true);
    expect(queryMock.mock.calls.some(([, params]) => String((params as string[] | undefined)?.[0]).startsWith("course-deferred:홍콩:4"))).toBe(true);
  });
});

// 작업지시서 2026-10-23 "#338 검증" §2① — 사이트맵인데 브리프가 없는 조합만 고르기(missingOnly) · 만료 4시간 전 갱신(minAgeMs)
describe("pickStaleTasks — missingOnly · minAgeMs", () => {
  beforeEach(() => queryMock.mockReset());
  const hour = 60 * 60 * 1000;
  it("missingOnly 는 브리프 행이 없거나 TTL(26시간)이 지난 조합만, minAgeMs 는 그 시간 이상 묵은 조합을 고른다", async () => {
    const tasks = [
      { region: "오사카", days: 3 as const }, // 2시간 — 신선
      { region: "홍콩", days: 4 as const }, // 23시간 — 만료 임박
      { region: "방콕", days: 3 as const }, // 27시간 — 만료됨
      { region: "나고야", days: 4 as const }, // 행 없음
    ];
    const at = (h: number) => new Date(Date.now() - h * hour).toISOString();
    queryMock.mockResolvedValue({
      rows: [
        { cache_key: briefCacheKey("overseas", "오사카", 3), created_at: at(2) },
        { cache_key: briefCacheKey("overseas", "홍콩", 4), created_at: at(23) },
        { cache_key: briefCacheKey("overseas", "방콕", 3), created_at: at(27) },
      ],
    });
    const missing = await pickStaleTasks(tasks, 10, { missingOnly: true });
    expect(missing.map((t) => t.region).sort()).toEqual(["나고야", "방콕"]);
    const expiring = await pickStaleTasks(tasks, 10, { minAgeMs: 22 * hour });
    expect(expiring.map((t) => t.region).sort()).toEqual(["나고야", "방콕", "홍콩"]);
  });
});
