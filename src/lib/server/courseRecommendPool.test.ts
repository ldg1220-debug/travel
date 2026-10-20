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

import { THEME_SLOTS, collectPoolStats, fetchSlotCandidates } from "./courseRecommend";
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

// 작업지시서 2026-10-20 "평점은 장소를 눌렀을 때만" — 후보 검색은 Pro 필드, 평점 없이 Google 순서가 인기 신호, 옛 평점 캐시는 읽을 때 정리.
describe("평점 없는 후보 풀", () => {
  const withRatings = (n: number): Place[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `old${i}`,
      placeId: `old${i}`,
      name: `옛 후보 ${i}`,
      category: "restaurant",
      color: "#000",
      icon: "pin",
      lat: 34.69 + i * 0.001,
      lng: 135.5,
      rating: 4.5,
      reviewCount: 800,
      ratingUnavailable: i % 2 === 0 ? true : undefined,
    })) as Place[];

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    cache.clear();
    throttled.value = false;
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        places: [
          ...Array.from({ length: 6 }, (_, i) => ({ id: `new${i}`, displayName: { text: `새 후보 ${i}` }, location: { latitude: 34.7 + i * 0.001, longitude: 135.5 }, primaryType: "restaurant", businessStatus: "OPERATIONAL" })),
          { id: "closed", displayName: { text: "폐업한 곳" }, location: { latitude: 34.7, longitude: 135.5 }, primaryType: "restaurant", businessStatus: "CLOSED_PERMANENTLY" },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("후보 검색은 Pro 필드만 요청한다 — rating · userRatingCount · priceLevel 이 없다", async () => {
    await fetchSlotCandidates("overseas", "오사카", lunch, false);
    const mask = String((fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers["X-Goog-FieldMask"]);
    expect(mask).not.toMatch(/rating|userRatingCount|priceLevel/i);
    expect(mask).toContain("places.businessStatus");
    expect(mask).toContain("places.types");
  });

  it("영업 중이 아닌 후보(폐업·임시휴업)는 빼고, 남은 후보에 Google 응답 순서(searchRank)를 단다 · rating 은 없다", async () => {
    const result = await fetchSlotCandidates("overseas", "오사카", lunch, false);
    expect(result.map((p) => p.id)).not.toContain("closed");
    expect(result.map((p) => p.searchRank)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.every((p) => p.rating == null && p.reviewCount == null)).toBe(true);
  });

  it("옛 평점이 든 캐시 풀은 읽을 때 평점·리뷰 수·표시를 버리고 저장된 순서로 searchRank 를 채운다 — 재조회하지 않는다", async () => {
    cache.set("overseas:오사카:맛집:restaurant", withRatings(8));
    const result = await fetchSlotCandidates("overseas", "오사카", lunch, false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toHaveLength(8);
    expect(result.every((p) => p.rating == null && p.reviewCount == null && p.ratingUnavailable == null)).toBe(true);
    expect(result.map((p) => p.searchRank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("collectPoolStats: 캐시 · google 출처와 후보 수를 집계한다", async () => {
    cache.set("overseas:오사카:맛집:restaurant", withRatings(6));
    const amSight = THEME_SLOTS.balanced.find((s) => s.key === "am-sight")!;
    const { stats } = await collectPoolStats(async () => {
      await fetchSlotCandidates("overseas", "오사카", lunch, false); // 캐시
      await fetchSlotCandidates("overseas", "오사카", amSight, false); // google
    });
    expect(stats).toMatchObject({ cache: 1, google: 1 });
    expect(stats.candidates).toBeGreaterThan(0);
  });
});
