import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("./db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import {
  aggLimit,
  chooseGuardedMask,
  formatKst,
  nextQuotaResetAt,
  ptDateString,
  reserveAggregate,
  dailyPacingLimit,
  daysRemainingInMonth,
  mapsBudgetLimit,
  mapsDayKey,
  mapsOpsKey,
  mapsQuota429Key,
  placesFieldTier,
  reserveMapsOp,
  runWithMapsSource,
  settleGuarded,
  stripEnterpriseFields,
} from "./mapsBudget";
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

// 인메모리 가짜 DB — 카운터 키 → 값. SQL 모양으로 reserve(returning) · bump(greatest) · mark429 · select 를 흉내 낸다.
function fakeStore(initial: Record<string, number> = {}) {
  const store = new Map<string, number>(Object.entries(initial));
  queryMock.mockImplementation(async (sql: string, params: unknown[]) => {
    const key = params[0] as string;
    if (/^\s*select/i.test(sql)) return store.has(key) ? { rows: [{ n: store.get(key) }] } : { rows: [] };
    if (/returning/i.test(sql)) {
      const limit = params[1] as number;
      const cur = store.get(key) ?? 0;
      if (cur >= limit) return { rows: [] };
      store.set(key, cur + 1);
      return { rows: [{ n: cur + 1 }] };
    }
    if (/greatest/i.test(sql)) {
      store.set(key, Math.max((store.get(key) ?? 0) + (params[1] as number), 0));
      return { rows: [] };
    }
    store.set(key, store.get(key) ?? 1); // mark429
    return { rows: [] };
  });
  return store;
}
const NOW = new Date("2026-10-15T15:00:00Z"); // 태평양 시간 10/15 08:00 (KST 10/16 00:00)

describe("reserveMapsOp / chooseGuardedMask", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("한도 안이면 허용하고 월·일 카운터를 올린다", async () => {
    const store = fakeStore();
    expect(await reserveMapsOp("text-enterprise", NOW)).toEqual({ allowed: true, count: 1, limit: 900 });
    expect(store.get(mapsOpsKey("text-enterprise", NOW))).toBe(1);
    expect(store.get(mapsDayKey("text-enterprise", NOW))).toBe(1);
  });
  it("월 한도에 닿으면 거절한다(카운터는 오르지 않는다)", async () => {
    const store = fakeStore({ [mapsOpsKey("static", NOW)]: 9000 });
    expect((await reserveMapsOp("static", NOW)).allowed).toBe(false);
    expect(store.get(mapsOpsKey("static", NOW))).toBe(9000);
  });
  it("한도 0 이면 DB 를 건드리지 않고 거절한다", async () => {
    vi.stubEnv("MAPS_BUDGET_OVERRIDE", '{"text-enterprise":0}');
    expect((await reserveMapsOp("text-enterprise", NOW)).allowed).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("DB 오류면 막지 않는다(추정 불가)", async () => {
    queryMock.mockImplementation(async () => {
      throw new Error("db down");
    });
    expect((await reserveMapsOp("static", NOW)).allowed).toBe(true);
  });

  const FULL = "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.photos";
  it("평소엔 요청한 마스크 그대로(정산용 sku 포함)", async () => {
    fakeStore();
    expect(await chooseGuardedMask("text", FULL)).toMatchObject({ mask: FULL, degraded: false, sku: "text-enterprise" });
  });
  it("Enterprise 한도에 닿으면 평점 없이 Pro 마스크로 강등", async () => {
    vi.stubEnv("MAPS_BUDGET_OVERRIDE", '{"text-enterprise":0}');
    fakeStore();
    const chosen = await chooseGuardedMask("text", FULL);
    expect(chosen).toMatchObject({ mask: "places.id,places.displayName,places.location,places.photos", degraded: true, sku: "text-pro" });
    expect(chosen!.mask).not.toContain("rating");
  });
  it("Pro 한도도 닿으면 null(호출 안 함) — 한도 0 가드 테스트에서 호출 0", async () => {
    vi.stubEnv("MAPS_BUDGET_OVERRIDE", '{"text-enterprise":0,"text-pro":0}');
    expect(await chooseGuardedMask("text", FULL)).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("IDs Only 는 SKU 요금은 없지만 콘솔 하루 상한(SearchTextRequest per day)은 같이 쓰므로 집계만 예약한다", async () => {
    const store = fakeStore();
    expect(await chooseGuardedMask("text", "places.id")).toMatchObject({ mask: "places.id", degraded: false, ids: true, kind: "text" });
    expect(store.get(mapsDayKey("text-search-all"))).toBe(1);
    expect(store.get(mapsOpsKey("text-pro"))).toBeUndefined(); // 월 SKU 카운터는 올리지 않는다
  });
});

// 작업지시서 2026-10-15 "긴급: 평점 검색(Enterprise) 하루 만에 243/900"
describe("일 단위 페이싱", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("오늘 상한 = floor((월 상한 − 오늘 이전 사용) / 남은 날수), 최소 10 — 10/15 (900−243)/17 ≈ 38", () => {
    expect(daysRemainingInMonth(NOW)).toBe(17);
    expect(dailyPacingLimit(900, 243, 17)).toBe(38);
    expect(dailyPacingLimit(900, 890, 5)).toBe(10); // 예산이 바닥이어도 하루 최소 10
    expect(dailyPacingLimit(900, 0, 31)).toBe(29);
  });

  it("사용자 요청은 오늘 상한까지, 워밍은 오늘 상한의 50%까지", async () => {
    const monthKey = mapsOpsKey("text-enterprise", NOW);
    const dayKey = mapsDayKey("text-enterprise", NOW);
    // 월 243(오늘 이전 243 − 오늘 0 → 오늘 상한 38). 오늘 이미 19건 → 월 262
    fakeStore({ [monthKey]: 262, [dayKey]: 19 });
    // 오늘 이전 사용 = 262 − 19 = 243 → 상한 floor(657/17) = 38
    expect((await runWithMapsSource("warm", () => reserveMapsOp("text-enterprise", NOW))).allowed).toBe(false); // 워밍 상한 19 도달
    expect((await reserveMapsOp("text-enterprise", NOW)).allowed).toBe(true); // 사용자는 38 까지
  });
  it("오늘 상한에 닿으면 사용자도 거절", async () => {
    fakeStore({ [mapsOpsKey("text-enterprise", NOW)]: 281, [mapsDayKey("text-enterprise", NOW)]: 38 });
    expect((await reserveMapsOp("text-enterprise", NOW)).allowed).toBe(false);
  });
  it("Pro 등 페이싱 SKU 가 아닌 것은 일 상한 없이 월 한도만", async () => {
    fakeStore({ [mapsOpsKey("static", NOW)]: 8000, [mapsDayKey("static", NOW)]: 5000 });
    expect((await reserveMapsOp("static", NOW)).allowed).toBe(true);
  });
});

describe("정산: Google 이 실제 처리한 호출만 센다 (429 = 오늘 상한 도달)", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });
  const sku = "text-enterprise" as const;
  const guarded = { mask: "x", degraded: false, sku };
  it("2xx 는 그대로 센다", async () => {
    const store = fakeStore();
    await reserveMapsOp(sku, NOW);
    await settleGuarded(guarded, 200, NOW);
    expect(store.get(mapsOpsKey(sku, NOW))).toBe(1);
  });
  it("5xx · 타임아웃(null) · 4xx 는 되돌린다", async () => {
    const store = fakeStore();
    for (const status of [500, null, 400]) {
      await reserveMapsOp(sku, NOW);
      await settleGuarded(guarded, status, NOW);
    }
    expect(store.get(mapsOpsKey(sku, NOW))).toBe(0);
    expect(store.get(mapsDayKey(sku, NOW))).toBe(0);
  });
  it("429 는 되돌리고 오늘 남은 호출을 건너뛰게 표시한다(action=quota429)", async () => {
    const store = fakeStore();
    await reserveMapsOp(sku, NOW);
    await settleGuarded(guarded, 429, NOW);
    expect(store.get(mapsOpsKey(sku, NOW))).toBe(0);
    expect(store.get(mapsQuota429Key("text-search-all", NOW))).toBe(1); // Text Search 는 SKU 와 무관하게 같은 콘솔 상한 — 집계 키에 표시
    expect((await reserveMapsOp(sku, NOW)).allowed).toBe(false);
    expect((await reserveMapsOp("text-pro", NOW)).allowed).toBe(false); // Pro 도 같은 상한이라 함께 막힌다
    // 내일은 다시 시도한다
    expect((await reserveMapsOp(sku, new Date("2026-10-16T15:00:00Z"))).allowed).toBe(true);
  });
  it("sku 가 없는 선택(IDs Only · 강등 IDs)은 정산하지 않는다", async () => {
    fakeStore();
    await settleGuarded({}, 500);
    await settleGuarded(null, 500);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("코스는 평점이 아니라 스팟 수로만 얇은지 본다 (작업지시서 2026-10-20)", () => {
  const spot = (i: number): CourseBriefSpot => ({ name: `s${i}`, category: "관광지", lat: 0, lng: 0, order: i, day: 1, toNextMinutes: null, toNextMode: "walk" });
  const spots = Array.from({ length: 8 }, (_, i) => spot(i + 1));
  it("스팟 수가 기준 이상이면 얇지 않고, 모자라면 얇다", () => {
    expect(isCourseBriefThin(spots, 5)).toBe(false);
    expect(isCourseBriefThin(spots.slice(0, 3), 5)).toBe(true);
  });
});

// 작업지시서 2026-10-16 "긴급(장애 원인 확정): 콘솔 하루 상한 100 소진 → 모든 Text Search 429"
describe("태평양 시간 날짜 · 콘솔 리셋", () => {
  it("날짜 키는 America/Los_Angeles 기준 — UTC 10/16 03:00 은 태평양 10/15", () => {
    expect(ptDateString(new Date("2026-10-16T03:00:00Z"))).toBe("2026-10-15");
    expect(ptDateString(new Date("2026-10-16T08:00:00Z"))).toBe("2026-10-16"); // 서머타임(PDT=UTC-7) 자정 직후
    expect(mapsDayKey("text-search-all", new Date("2026-10-16T03:00:00Z"))).toBe("maps-ops-day:text-search-all:2026-10-15");
  });
  it("리셋 시각은 다음 태평양 자정 = 서머타임 중 KST 16:00, 서머타임이 끝나면 17:00", () => {
    expect(formatKst(nextQuotaResetAt(new Date("2026-10-15T15:00:00Z")))).toBe("2026-10-16 16:00 KST");
    expect(formatKst(nextQuotaResetAt(new Date("2026-12-10T15:00:00Z")))).toBe("2026-12-11 17:00 KST");
  });
  it("남은 날 수·월 키도 태평양 달력", () => {
    expect(daysRemainingInMonth(new Date("2026-11-01T05:00:00Z"))).toBe(1); // 태평양 10/31 22:00 → 10월의 마지막 날
    expect(daysRemainingInMonth(new Date("2026-10-01T10:00:00Z"))).toBe(31); // 태평양 10/01 03:00
    expect(mapsOpsKey("text-pro", new Date("2026-11-01T05:00:00Z"))).toBe("maps-ops:text-pro:2026-10"); // 월 키도 태평양 달력
  });
});

describe("콘솔 하루 상한 집계 (text-search-all · get-place-all)", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("기본 상한 = 콘솔 100 × 0.9 = 90, 환경 변수 GOOGLE_TEXT_SEARCH_DAILY_QUOTA 로 콘솔 값을 따라간다", () => {
    expect(aggLimit("text-search-all")).toBe(90);
    expect(aggLimit("get-place-all")).toBe(90);
    vi.stubEnv("GOOGLE_TEXT_SEARCH_DAILY_QUOTA", "1000");
    expect(aggLimit("text-search-all")).toBe(900);
    expect(aggLimit("get-place-all")).toBe(90);
  });

  it("Enterprise · Pro · IDs Only 가 같은 집계를 나눠 쓰고, 상한에 닿으면 429 를 맞기 전에 멈춘다", async () => {
    const store = fakeStore({ [mapsDayKey("text-search-all", NOW)]: 89 });
    expect((await reserveMapsOp("text-enterprise", NOW)).allowed).toBe(true); // 90번째
    expect(store.get(mapsDayKey("text-search-all", NOW))).toBe(90);
    expect((await reserveMapsOp("text-pro", NOW)).allowed).toBe(false);
    expect(await reserveAggregate("text-search-all", NOW)).toBe(false); // IDs Only 도 막힌다
    // Place Details 는 별개 집계
    expect(await reserveAggregate("get-place-all", NOW)).toBe(true);
  });

  it("집계에서 막힌 호출은 월 카운터를 올리지 않고, 월 한도에서 막히면 집계 예약을 되돌린다", async () => {
    const store = fakeStore({ [mapsDayKey("text-search-all", NOW)]: 90 });
    expect((await reserveMapsOp("text-pro", NOW)).allowed).toBe(false);
    expect(store.get(mapsOpsKey("text-pro", NOW))).toBeUndefined();
    const store2 = fakeStore({ [mapsOpsKey("text-pro", NOW)]: 4500, [mapsDayKey("text-search-all", NOW)]: 10 });
    expect((await reserveMapsOp("text-pro", NOW)).allowed).toBe(false);
    expect(store2.get(mapsDayKey("text-search-all", NOW))).toBe(10);
  });

  it("워밍 크론은 집계 상한의 절반(45)까지만", async () => {
    fakeStore({ [mapsDayKey("text-search-all", NOW)]: 45 });
    expect((await runWithMapsSource("warm", () => reserveMapsOp("text-pro", NOW))).allowed).toBe(false);
    expect((await reserveMapsOp("text-pro", NOW)).allowed).toBe(true);
  });

  it("IDs Only 호출이 429 를 맞으면 집계에 표시하고 예약을 되돌린다", async () => {
    const store = fakeStore();
    const guarded = await chooseGuardedMask("text", "places.id");
    await settleGuarded(guarded, 429, new Date());
    expect(store.get(mapsQuota429Key("text-search-all"))).toBe(1);
    expect(store.get(mapsDayKey("text-search-all"))).toBe(0);
    expect(await chooseGuardedMask("text", "places.id")).toBeNull(); // 오늘 남은 IDs Only 호출도 skip
  });
});
