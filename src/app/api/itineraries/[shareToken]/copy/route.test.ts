import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "7" } }) }));
vi.mock("@/lib/server/db", () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { POST } from "./route";

const items = [
  { id: "a", placeId: "a", name: "A", date: "2026-10-18", time: "09:00", durationMinutes: 60, coordinates: { lat: 1, lng: 1 } },
  { id: "b", placeId: "b", name: "B", date: "2026-10-19", time: "10:20", durationMinutes: 60, coordinates: { lat: 1, lng: 1 } },
];

function call(body?: unknown) {
  const req = new Request("http://x/api/itineraries/tok/copy", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  return POST(req as never, { params: Promise.resolve({ shareToken: "tok" }) } as never);
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, title: "t", region: "international", placesData: items }] });
  query.mockResolvedValueOnce({ rows: [{ id: 2, shareToken: "new" }] });
});

function savedItems(): { date: string; time: string; dayNumber?: number }[] {
  return JSON.parse(query.mock.calls[1][1][3]);
}

describe("POST /api/itineraries/[shareToken]/copy — 시작일 선택", () => {
  it("shifts every item to the chosen start date, keeping day gaps and times", async () => {
    const res = await call({ startDate: "2099-10-24" });
    expect(res.status).toBe(200);
    expect(savedItems().map((i) => [i.date, i.time])).toEqual([["2099-10-24", "09:00"], ["2099-10-25", "10:20"]]);
  });

  it("rejects a past start date", async () => {
    const res = await call({ startDate: "2020-01-01" });
    expect(res.status).toBe(400);
    expect(query).toHaveBeenCalledTimes(1); // INSERT 까지 가지 않는다
  });

  it("saves undated with 1일차·2일차 numbers when undated=true", async () => {
    await call({ undated: true });
    expect(savedItems().map((i) => i.dayNumber)).toEqual([1, 2]);
  });

  it("still works without a body (옛 호출 → 오늘 기준)", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(savedItems().some((i) => i.dayNumber != null)).toBe(false);
  });
});
