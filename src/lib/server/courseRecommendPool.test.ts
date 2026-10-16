import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 작업지시서 2026-10-15 "긴급: 평점 검색(Enterprise) 하루 만에 243/900" §2② — 후보 풀은 지역 단위 1벌 (일수와 무관), 넓히기는 식당 슬롯 동의어 1회뿐.
const cache = new Map<string, unknown>();
vi.mock("./db", () => ({
  pool: {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (/^\s*select/i.test(sql)) return { rows: cache.has(params[0] as string) ? [{ payload: cache.get(params[0] as string) }] : [] };
      if (/^\s*insert/i.test(sql)) {
        cache.set(params[0] as string, JSON.parse(params[1] as string));
        return { rows: [] };
      }
      return { rows: [] };
    }),
  },
}));
const throttled = { value: false };
vi.mock("./mapsBudget", () => ({
  chooseGuardedMask: async (_kind: string, mask: string) => ({ mask, degraded: false }),
  settleGuarded: async () => undefined,
  isMapsThrottled: async () => throttled.value,
}));

import { THEME_SLOTS, collectPoolStats, fetchSlotCandidates, isDegradedPool } from "./courseRecommend";
import type { Place } from "@/lib/types";

const lunch = THEME_SLOTS.balanced.find((s) => s.key === "lunch")!;
const amSight = THEME_SLOTS.balanced.find((s) => s.key === "am-sight")!;

describe("후보 풀 공유", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    cache.clear();
    throttled.value = false;
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    let n = 0;
    fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const query = (JSON.parse(init.body) as { textQuery: string }).textQuery;
      const places = Array.from({ length: 6 }, (_, i) => ({
        id: `p${++n}`,
        displayName: { text: `${query} ${i}` },
        formattedAddress: "addr",
        location: { latitude: 34.69 + i * 0.001, longitude: 135.5 },
        rating: 4.5,
        userRatingCount: 800,
        primaryType: "restaurant",
      }));
      return { ok: true, status: 200, json: async () => ({ places }) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("같은 지역·슬롯은 일수와 무관하게 기본 풀 1회 — 두 번째 일수 코스는 Google 을 다시 부르지 않는다", async () => {
    await fetchSlotCandidates("overseas", "오사카", lunch, false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchSlotCandidates("overseas", "오사카", lunch, false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("3일차 이후(widen)에도 식당 슬롯은 동의어 질의 1회만 더 — 기본 질의를 다시 부르지 않고, 한 번 만든 뒤엔 0회", async () => {
    await fetchSlotCandidates("overseas", "오사카", lunch, false); // 기본 풀 1회
    const widened = await fetchSlotCandidates("overseas", "오사카", lunch, true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // + 동의어 1회
    expect(widened.length).toBeGreaterThan(0);
    await fetchSlotCandidates("overseas", "오사카", lunch, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("관광지 슬롯은 3일차 이후에도 기본 풀만 쓴다(동의어 질의 없음)", async () => {
    await fetchSlotCandidates("overseas", "오사카", amSight, false);
    await fetchSlotCandidates("overseas", "오사카", amSight, true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("지역 하나(balanced 7슬롯)를 4일 코스까지 빌드해도 후보 검색은 슬롯 7 + 식당 2 = 9회", async () => {
    for (const widen of [false, false, true, true]) {
      for (const slot of THEME_SLOTS.balanced) await fetchSlotCandidates("overseas", "오사카", slot, widen);
    }
    expect(fetchMock.mock.calls.length).toBe(THEME_SLOTS.balanced.length + 2);
  });
});

// 작업지시서 2026-10-16 "긴급(장애 계속): #323 후에도 해외 코스 500" — 강등(평점 없음) 풀이 캐시에 남아 품질 게이트가 전부 떨어뜨리던 문제.
describe("강등 후보 풀 캐시", () => {
  const unrated = (n: number, flagged = false): Place[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `old${i}`,
      placeId: `old${i}`,
      name: `옛 후보 ${i}`,
      category: "restaurant",
      color: "#000",
      icon: "pin",
      lat: 34.69 + i * 0.001,
      lng: 135.5,
      ...(flagged ? { ratingUnavailable: true } : {}),
    })) as Place[];

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    cache.clear();
    throttled.value = false;
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ places: Array.from({ length: 6 }, (_, i) => ({ id: `new${i}`, displayName: { text: `새 후보 ${i}` }, location: { latitude: 34.7 + i * 0.001, longitude: 135.5 }, rating: 4.5, userRatingCount: 800, primaryType: "restaurant" })) }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("isDegradedPool: 표시가 모두 있거나, 표시 없는 구버전 풀은 5곳 이상 전부 평점·리뷰 수가 없을 때", () => {
    expect(isDegradedPool([])).toBe(false);
    expect(isDegradedPool(unrated(6, true))).toBe(true);
    expect(isDegradedPool(unrated(6))).toBe(true);
    expect(isDegradedPool(unrated(3))).toBe(false); // 작은 풀은 정상일 수 있다
    expect(isDegradedPool([{ ...unrated(1)[0], rating: 4.2, reviewCount: 50 }, ...unrated(5)])).toBe(false);
  });

  it("구버전 강등 풀이 캐시에 있고 예산 여유가 있으면 캐시를 무시하고 Enterprise 로 재조회해 덮어쓴다", async () => {
    cache.set("overseas:오사카:맛집:restaurant", unrated(8));
    const lunch = THEME_SLOTS.balanced.find((s) => s.key === "lunch")!;
    const result = await fetchSlotCandidates("overseas", "오사카", lunch, false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.rating != null)).toBe(true);
    expect((cache.get("overseas:오사카:맛집:restaurant") as Place[])[0].id).toBe("new0");
  });

  it("예산이 아직 막혀 있으면 재조회 없이 그 풀을 평점 없는 후보로 게이트 통과시킨다(count 0 이 되지 않는다)", async () => {
    throttled.value = true;
    cache.set("overseas:오사카:맛집:restaurant", unrated(8));
    const lunch = THEME_SLOTS.balanced.find((s) => s.key === "lunch")!;
    const result = await fetchSlotCandidates("overseas", "오사카", lunch, false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toHaveLength(8);
    expect(result.every((p) => p.ratingUnavailable === true)).toBe(true);
  });

  it("collectPoolStats: 캐시 · google · degraded 출처와 후보 수를 집계한다", async () => {
    cache.set("overseas:오사카:맛집:restaurant", Array.from({ length: 6 }, (_, i) => ({ ...unrated(1)[0], id: `ok${i}`, rating: 4.4, reviewCount: 500 })));
    const lunch = THEME_SLOTS.balanced.find((s) => s.key === "lunch")!;
    const amSight = THEME_SLOTS.balanced.find((s) => s.key === "am-sight")!;
    const { stats } = await collectPoolStats(async () => {
      await fetchSlotCandidates("overseas", "오사카", lunch, false); // 캐시
      await fetchSlotCandidates("overseas", "오사카", amSight, false); // google
    });
    expect(stats).toMatchObject({ cache: 1, google: 1, degraded: 0 });
    expect(stats.candidates).toBeGreaterThan(0);
  });
});
