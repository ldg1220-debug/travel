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

  // 작업지시서 2026-10-20 "v42가 적용되지 않습니다" A-2 — Blob 한도는 경고(warnings)이고, ok · HTTP 상태는 DB 기준이다.
  it("Blob 이 403 Forbidden 이면 blob.status limit · 경고만 있고 DB 가 정상이면 200 · ok true", async () => {
    getMock.mockRejectedValue(new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden"));
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.blob.status).toBe("limit");
    expect(body.ok).toBe(true);
    expect(body.warnings[0]).toContain("blob limit");
  });
  it("DB 가 실패하면 Blob 이 정상이어도 503 · ok false", async () => {
    getMock.mockResolvedValue(null);
    queryMock.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
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
