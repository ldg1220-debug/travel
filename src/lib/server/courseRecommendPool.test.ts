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
vi.mock("./mapsBudget", () => ({
  chooseGuardedMask: async (_kind: string, mask: string) => ({ mask, degraded: false }),
  settleGuarded: async () => undefined,
}));

import { THEME_SLOTS, fetchSlotCandidates } from "./courseRecommend";

const lunch = THEME_SLOTS.balanced.find((s) => s.key === "lunch")!;
const amSight = THEME_SLOTS.balanced.find((s) => s.key === "am-sight")!;

describe("후보 풀 공유", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    cache.clear();
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
