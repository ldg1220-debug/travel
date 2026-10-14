import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { chooseGuardedMask, mapsBudgetLimit, mapsOpsKey, placesFieldTier, reserveMapsOp, stripEnterpriseFields } from "./mapsBudget";
import { isCourseBriefThin } from "@/lib/coursePages";
import type { CourseBriefSpot } from "./courseBrief";

// 작업지시서 2026-10-14 "긴급: #319 이후 Places 호출 비용" — 월 무료 한도 가드.
describe("placesFieldTier / stripEnterpriseFields", () => {
  it("rating · userRatingCount · priceLevel · 영업시간 · 리뷰는 Enterprise, 이름·좌표·사진은 Pro, id 만은 IDs Only", () => {
    expect(placesFieldTier("places.id,places.displayName,places.location,places.rating,places.userRatingCount")).toBe("enterprise");
    expect(placesFieldTier("photos,reviews,rating,userRatingCount,currentOpeningHours.openNow")).toBe("enterprise");
    expect(placesFieldTier("id,displayName,formattedAddress,location,primaryType,photos,googleMapsUri")).toBe("pro");
    expect(placesFieldTier("places.photos")).toBe("pro");
    expect(placesFieldTier("places.id")).toBe("ids");
    expect(placesFieldTier("rating,userRatingCount,priceLevel")).toBe("enterprise");
  });
  it("강등 마스크는 Enterprise 필드만 뺀다", () => {
    expect(stripEnterpriseFields("places.id,places.displayName,places.rating,places.userRatingCount,places.photos,nextPageToken")).toBe("places.id,places.displayName,places.photos,nextPageToken");
    expect(stripEnterpriseFields("photos,reviews,rating,userRatingCount,currentOpeningHours.openNow")).toBe("photos");
    expect(stripEnterpriseFields("rating,userRatingCount,priceLevel")).toBe("");
  });
});

describe("한도: 무료 한도의 90% · MAPS_BUDGET_OVERRIDE", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("기본 상한 — Enterprise 900 · Pro 4,500 · Photos 900 · Static 9,000 · Routes 9,000", () => {
    expect(mapsBudgetLimit("text-enterprise")).toBe(900);
    expect(mapsBudgetLimit("details-enterprise")).toBe(900);
    expect(mapsBudgetLimit("text-pro")).toBe(4500);
    expect(mapsBudgetLimit("photos")).toBe(900);
    expect(mapsBudgetLimit("static")).toBe(9000);
    expect(mapsBudgetLimit("routes")).toBe(9000);
  });
  it("환경 변수로 SKU 별 상한을 덮어쓴다(가드 테스트용)", () => {
    vi.stubEnv("MAPS_BUDGET_OVERRIDE", '{"text-enterprise":0}');
    expect(mapsBudgetLimit("text-enterprise")).toBe(0);
    expect(mapsBudgetLimit("text-pro")).toBe(4500);
  });
  it("키는 SKU·달력 월", () => {
    expect(mapsOpsKey("static", new Date("2026-10-14T00:00:00Z"))).toBe("maps-ops:static:2026-10");
  });
});

describe("reserveMapsOp / chooseGuardedMask", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("한도 안이면 허용하고 카운트를 돌려준다", async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 12 }] });
    expect(await reserveMapsOp("text-enterprise")).toEqual({ allowed: true, count: 12, limit: 900 });
  });
  it("한도에 닿으면(UPDATE 가 행을 못 돌려줌) 거절하고 현재 카운트를 읽는다", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ n: 900 }] });
    expect(await reserveMapsOp("text-enterprise")).toEqual({ allowed: false, count: 900, limit: 900 });
  });
  it("한도 0 이면 DB 를 건드리지 않고 거절한다", async () => {
    vi.stubEnv("MAPS_BUDGET_OVERRIDE", '{"text-enterprise":0}');
    expect((await reserveMapsOp("text-enterprise")).allowed).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("DB 오류면 막지 않는다(추정 불가)", async () => {
    queryMock.mockImplementation(async () => {
      throw new Error("db down");
    });
    expect((await reserveMapsOp("static")).allowed).toBe(true);
  });

  const FULL = "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.photos";
  it("평소엔 요청한 마스크 그대로", async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 1 }] });
    expect(await chooseGuardedMask("text", FULL)).toEqual({ mask: FULL, degraded: false });
  });
  it("Enterprise 한도에 닿으면 평점 없이 Pro 마스크로 강등", async () => {
    vi.stubEnv("MAPS_BUDGET_OVERRIDE", '{"text-enterprise":0}');
    queryMock.mockResolvedValue({ rows: [{ n: 1 }] });
    const chosen = await chooseGuardedMask("text", FULL);
    expect(chosen).toEqual({ mask: "places.id,places.displayName,places.location,places.photos", degraded: true });
    expect(chosen!.mask).not.toContain("rating");
  });
  it("Pro 한도도 닿으면 null(호출 안 함) — 한도 0 가드 테스트에서 호출 0", async () => {
    vi.stubEnv("MAPS_BUDGET_OVERRIDE", '{"text-enterprise":0,"text-pro":0}');
    expect(await chooseGuardedMask("text", FULL)).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("IDs Only 는 무료·무제한이라 가드를 거치지 않는다", async () => {
    expect(await chooseGuardedMask("text", "places.id")).toEqual({ mask: "places.id", degraded: false });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("평점 없이 만든 코스는 얇은 콘텐츠로 보지 않는다", () => {
  const spot = (i: number): CourseBriefSpot => ({ name: `s${i}`, category: "관광지", rating: null, reviewCount: null, lat: 0, lng: 0, order: i, day: 1, toNextMinutes: null, toNextMode: "walk" });
  const spots = Array.from({ length: 8 }, (_, i) => spot(i + 1));
  it("평소엔 평점 없는 스팟이 절반 이상이면 얇다 · 월 한도 때문에 평점이 없으면(ratingsUnavailable) 아니다", () => {
    expect(isCourseBriefThin(spots, 5)).toBe(true);
    expect(isCourseBriefThin(spots, 5, { ratingsUnavailable: true })).toBe(false);
    expect(isCourseBriefThin(spots.slice(0, 3), 5, { ratingsUnavailable: true })).toBe(true); // 스팟 수 기준은 그대로
  });
});
