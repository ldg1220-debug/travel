import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/server/db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
const afterMock = vi.fn();
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => afterMock(fn) }));

import { acquireRebuildLock, scheduleBackgroundRebuild } from "./courseBrief";

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
});
