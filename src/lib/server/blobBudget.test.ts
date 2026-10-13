import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { BLOB_NON_REVIEW_PUT_CAP, BLOB_REVIEW_PUT_CAP, blobOpsKey, isBlobLimitError, reserveBlobPut } from "./blobBudget";

// 작업지시서 2026-10-13 "긴급: Vercel Blob 한도 초과" §3⑥ — 월 Advanced 사용량 추정 카운터.
describe("blobBudget", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("키는 달력 월 단위", () => {
    expect(blobOpsKey(new Date("2026-10-13T00:00:00Z"))).toBe("blob-ops:2026-10");
  });
  it("1,500 이하면 후기·기타 모두 허용", async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 100 }] });
    expect(await reserveBlobPut("review")).toEqual({ allowed: true, used: 100 });
    expect(await reserveBlobPut("other")).toEqual({ allowed: true, used: 100 });
  });
  it("1,500 초과부터는 후기 업로드 외 put 금지, 후기는 1,950까지", async () => {
    queryMock.mockResolvedValue({ rows: [{ n: BLOB_NON_REVIEW_PUT_CAP + 1 }] });
    expect((await reserveBlobPut("other")).allowed).toBe(false);
    expect((await reserveBlobPut("review")).allowed).toBe(true);
    queryMock.mockResolvedValue({ rows: [{ n: BLOB_REVIEW_PUT_CAP + 1 }] });
    expect((await reserveBlobPut("review")).allowed).toBe(false);
  });
  it("DB 오류면 막지 않는다(추정 불가)", async () => {
    queryMock.mockImplementation(async () => {
      throw new Error("db down");
    });
    expect(await reserveBlobPut("review")).toEqual({ allowed: true, used: null });
  });
  it("한도·정지 오류 판별", () => {
    expect(isBlobLimitError(new Error("Vercel Blob: This store has been suspended."))).toBe(true);
    expect(isBlobLimitError(new Error("You have reached your usage limits for this store using the Hobby plan."))).toBe(true);
    expect(isBlobLimitError(new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden"))).toBe(true); // #314 검증 실측: 정지 중 읽기 응답
    expect(isBlobLimitError(new Error("network reset"))).toBe(false);
  });
});
