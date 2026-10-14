import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
vi.mock("@/lib/server/db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { PLACES_CONTENT_PURGE_MS, PLACES_CONTENT_TTL_MS, PLACES_LATLNG_TTL_MS, purgeExpiredPlacesCache } from "./placesRetention";
import { loadCourseMapInput } from "./courseBrief";

// 작업지시서 2026-10-14 "Google Places 데이터 보관 기간 점검" §2 — 콘텐츠 26시간 · 좌표 30일.
describe("placesRetention", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("상수: 콘텐츠 26시간, 물리 삭제는 +2시간 유예, 좌표 30일", () => {
    expect(PLACES_CONTENT_TTL_MS).toBe(26 * 3600 * 1000);
    expect(PLACES_CONTENT_PURGE_MS).toBe(28 * 3600 * 1000);
    expect(PLACES_LATLNG_TTL_MS).toBe(30 * 24 * 3600 * 1000);
  });

  it("purge: 콘텐츠 행(후보 풀·브리프·평점)과 좌표 행(지도 입력)만 지우고 사이트맵 기록·카운터는 건드리지 않는다", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 5 }).mockResolvedValueOnce({ rowCount: 2 }).mockResolvedValue({ rowCount: 0 });
    expect(await purgeExpiredPlacesCache()).toEqual({ content: 5, latLng: 2 });
    const [contentSql, contentParams] = queryMock.mock.calls[0];
    expect(contentSql).toContain("content-brief:%");
    expect(contentSql).toContain("content-brief-rating:%");
    expect(contentSql).toContain("overseas:%");
    expect(contentSql).not.toContain("course-sitemap");
    expect(contentSql).not.toContain("blob-ops");
    expect(contentParams).toEqual([String(PLACES_CONTENT_PURGE_MS)]);
    const [latLngSql, latLngParams] = queryMock.mock.calls[1];
    expect(latLngSql).toContain("course-map-input:%");
    expect(latLngParams).toEqual([String(PLACES_LATLNG_TTL_MS)]);
  });

  it("loadCourseMapInput: 30일 지난 좌표 행은 없는 것으로 본다", async () => {
    const payload = { hash: "abcdef0123456789", spots: [{ order: 1, lat: 1, lng: 2 }], mapPaths: [], dayLengths: [1] };
    queryMock.mockResolvedValueOnce({ rows: [{ payload, created_at: new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString() }] });
    expect(await loadCourseMapInput("세부", 7)).toBeNull();
    queryMock.mockResolvedValueOnce({ rows: [{ payload, created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() }] });
    expect(await loadCourseMapInput("세부", 7)).toMatchObject({ hash: "abcdef0123456789" });
  });
});
