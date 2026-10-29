import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  isMapsThrottled: async () => false,
}));

import { fetchAreaCandidates, fetchLandmarkCandidates, isTrailCourse, isValidPlace, REQUIRED_LANDMARK_NAMES } from "./courseRecommend";

// 작업지시서 2026-10-28 §1⑦ — 경주 대표 명소 이름 사전
describe("fetchLandmarkCandidates — 필수 대표 명소 이름 사전", () => {
  beforeEach(() => {
    cache.clear();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const query = (JSON.parse(init.body) as { textQuery: string }).textQuery;
        // "경주 관광 명소" 같은 일반 검색은 사전 명소를 하나도 돌려주지 않고, 이름 검색은 그 이름의 장소를 돌려준다.
        const named = (REQUIRED_LANDMARK_NAMES["경주"] ?? []).find((name) => query.includes(name));
        const places = named
          ? [{ id: `n-${named}`, displayName: { text: named }, location: { latitude: 35.8 + n++ * 0.01, longitude: 129.2 }, primaryType: "tourist_attraction" }]
          : [{ id: "g1", displayName: { text: "경주 어느 공원" }, location: { latitude: 35.85, longitude: 129.21 }, primaryType: "park" }];
        return { ok: true, status: 200, json: async () => ({ places }) };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("경주 풀은 사전 명소(불국사·석굴암·첨성대·대릉원·동궁과 월지)가 사전 순서대로 맨 앞에 온다", async () => {
    const pool = await fetchLandmarkCandidates("domestic", "경주");
    expect(pool.slice(0, 5).map((p) => p.name)).toEqual(["불국사", "석굴암", "첨성대", "대릉원", "동궁과 월지"]);
    expect(pool.slice(0, 5).map((p) => p.searchRank)).toEqual([0, 1, 2, 3, 4]);
    expect(pool.some((p) => p.name === "경주 어느 공원")).toBe(true);
  });

  it("사전에 없는 지역은 이름 검색을 하지 않는다", async () => {
    await fetchLandmarkCandidates("domestic", "부산");
    const bodies = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => (JSON.parse((c[1] as { body: string }).body) as { textQuery: string }).textQuery);
    expect(bodies.every((q) => !q.includes("불국사"))).toBe(true);
  });
});

// 작업지시서 2026-10-29 §2①② — 코스(올레길 등) 제외 · 제주·부산 이름 사전
describe("올레길 같은 '코스' 제외 · 제주·부산 사전", () => {
  it.each(["올레길 6코스", "올레길 1코스", "한라산 둘레길", "한라산 탐방로", "산티아고 순례길", "지리산 트레킹", "관악산 등산로", "서울 성곽 1코스"])("%s 는 장소가 아니다", (name) => {
    expect(isTrailCourse(name)).toBe(true);
    expect(isValidPlace({ id: "x", placeId: "x", name, category: "tourist_attraction", color: "#000", lat: 33.4, lng: 126.5, icon: "pin" })).toBe(false);
  });
  it.each(["성산일출봉", "서귀포매일올레시장", "우도", "협재해수욕장", "해운대해수욕장", "불국사"])("%s 는 장소다", (name) => {
    expect(isTrailCourse(name)).toBe(false);
  });
  it("제주·부산 사전에 지시서의 명소가 들어 있다", () => {
    expect(REQUIRED_LANDMARK_NAMES["제주"]).toEqual(["성산일출봉", "우도", "섭지코지", "협재해수욕장", "천지연폭포", "만장굴", "오설록 티뮤지엄", "용두암"]);
    expect(REQUIRED_LANDMARK_NAMES["부산"]).toEqual(["해운대해수욕장", "광안리해수욕장", "감천문화마을", "자갈치시장", "해동용궁사", "태종대", "흰여울문화마을", "송도해상케이블카"]);
  });
});

// 작업지시서 2026-10-29 "#343 검증" §2① — 권역(군집 중심) 후보 검색
describe("fetchAreaCandidates — 중심 좌표 주변 검색", () => {
  beforeEach(() => {
    cache.clear();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ places: [{ id: "z1", displayName: { text: "성산 맛집" }, location: { latitude: 33.46, longitude: 126.93 }, primaryType: "restaurant" }] }) })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("locationBias(circle)와 종류별 includedType 으로 1회 검색하고, 같은 중심·종류는 캐시를 쓴다", async () => {
    const a = await fetchAreaCandidates("제주", { lat: 33.4567, lng: 126.9334 }, 7500, "restaurant");
    expect(a.map((p) => p.name)).toEqual(["성산 맛집"]);
    const body = JSON.parse(((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as { body: string }).body);
    expect(body).toMatchObject({ textQuery: "제주 맛집", includedType: "restaurant", locationBias: { circle: { center: { latitude: 33.4567, longitude: 126.9334 }, radius: 7500 } } });
    await fetchAreaCandidates("제주", { lat: 33.4567, lng: 126.9334 }, 7500, "restaurant");
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
