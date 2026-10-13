import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const queryMock = vi.fn();
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => getMock(...a) }));
vi.mock("@/lib/server/db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { GET } from "./route";

// 작업지시서 2026-10-13 "#314 검증" §2① — 정지 중 읽기 응답("Failed to fetch blob: 403 Forbidden")도 limit 으로 분류.
describe("GET /api/health", () => {
  beforeEach(() => {
    getMock.mockReset();
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [{ n: 0 }] });
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "t");
  });

  it("Blob 이 403 Forbidden 이면 blob.status limit · 503", async () => {
    getMock.mockRejectedValue(new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden"));
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.blob.status).toBe("limit");
    expect(body.ok).toBe(false);
  });
  it("정지 문구(suspended)도 limit, 그 밖의 오류는 error", async () => {
    getMock.mockRejectedValueOnce(new Error("Vercel Blob: This store has been suspended."));
    expect((await (await GET()).json()).blob.status).toBe("limit");
    getMock.mockRejectedValueOnce(new Error("socket hang up"));
    expect((await (await GET()).json()).blob.status).toBe("error");
  });
  it("Blob 읽기가 null(없는 경로)이면 정상 · 200", async () => {
    getMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).blob.status).toBe("ok");
  });
});
