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

import { fetchAreaCandidates, fetchLandmarkCandidates, isTrailCourse, isWholeParkOrMountain, isValidPlace, REQUIRED_LANDMARK_NAMES } from "./courseRecommend";

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

// 작업지시서 2026-10-30 §3⑤ — 국립공원·산 전체 제외
describe("isWholeParkOrMountain", () => {
  it.each([
    { name: "한라산 국립공원", category: "tourist_attraction" },
    { name: "설악산 국립공원", category: "park" },
    { name: "어떤 산", category: "national_park" },
    { name: "무슨 산길", category: "hiking_area" },
    { name: "Hallasan National Park", category: "park" },
  ])("$name 는 장소가 아니다", (p) => expect(isWholeParkOrMountain(p)).toBe(true));
  it.each([{ name: "성산일출봉" }, { name: "용두암" }, { name: "남산서울타워" }, { name: "천지연폭포" }])("$name 는 장소다", (p) => expect(isWholeParkOrMountain(p)).toBe(false));
});

// 작업지시서 2026-11-25 — 해외 색인 코스(타이베이)도 이름 사전 명소가 풀 맨 앞(앵커 우선)
describe("fetchLandmarkCandidates — 해외 지역(타이베이) 이름 사전", () => {
  beforeEach(() => {
    cache.clear();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const query = (JSON.parse(init.body) as { textQuery: string }).textQuery;
        const named = (REQUIRED_LANDMARK_NAMES["타이베이"] ?? []).find((name) => query.includes(name));
        const places = named
          ? [{ id: `t-${named}`, displayName: { text: named }, location: { latitude: 25.0 + n++ * 0.01, longitude: 121.5 }, primaryType: "tourist_attraction" }]
          : [{ id: "g1", displayName: { text: "인성원" }, location: { latitude: 25.05, longitude: 121.52 }, primaryType: "tourist_attraction" }];
        return { ok: true, status: 200, json: async () => ({ places }) };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("사전 명소가 사전 순서대로 일반 검색 결과보다 앞에 온다 · 이름 검색은 최대 5회", async () => {
    const pool = await fetchLandmarkCandidates("overseas", "타이베이");
    expect(pool.slice(0, 5).map((p) => p.name)).toEqual(["타이베이 101", "국립고궁박물원", "중정기념당", "스린 야시장", "용산사"]);
    expect(pool.slice(0, 5).map((p) => p.searchRank)).toEqual([0, 1, 2, 3, 4]);
    const queries = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => (JSON.parse((c[1] as { body: string }).body) as { textQuery: string }).textQuery);
    expect(queries.filter((q) => (REQUIRED_LANDMARK_NAMES["타이베이"] ?? []).some((nm) => q.includes(nm))).length).toBe(5);
  });
});

// 작업지시서 2026-11-25 (세부) — 사전 명소가 풀 맨 앞 · 이름 검색 ≤5회
describe("fetchLandmarkCandidates — 세부 이름 사전", () => {
  beforeEach(() => {
    cache.clear();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const query = (JSON.parse(init.body) as { textQuery: string }).textQuery;
        const named = (REQUIRED_LANDMARK_NAMES["세부"] ?? []).find((name) => query.includes(name));
        const places = named
          ? [{ id: `c-${named}`, displayName: { text: named }, location: { latitude: 10.29 + n++ * 0.001, longitude: 123.9 }, primaryType: "tourist_attraction" }]
          : [{ id: "g1", displayName: { text: "디 패밀리 파크" }, location: { latitude: 10.35, longitude: 123.88 }, primaryType: "park" }];
        return { ok: true, status: 200, json: async () => ({ places }) };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("사전 명소가 일반 검색 결과보다 앞 · 이름 검색 최대 5회", async () => {
    const pool = await fetchLandmarkCandidates("overseas", "세부");
    expect(pool.slice(0, 5).map((p) => p.name)).toEqual(["산토니뇨 성당", "마젤란 십자가", "산 페드로 요새", "탑스 언덕 전망대", "도교 사원"]);
    const queries = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => (JSON.parse((c[1] as { body: string }).body) as { textQuery: string }).textQuery);
    expect(queries.filter((q) => (REQUIRED_LANDMARK_NAMES["세부"] ?? []).some((nm) => q.includes(nm))).length).toBeLessThanOrEqual(5);
  });
});

// 작업지시서 2026-11-25 (다낭) — 사전 명소가 풀 맨 앞 · 이름 검색 ≤6회
describe("fetchLandmarkCandidates — 다낭 이름 사전", () => {
  beforeEach(() => {
    cache.clear();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const query = (JSON.parse(init.body) as { textQuery: string }).textQuery;
        const named = (REQUIRED_LANDMARK_NAMES["다낭"] ?? []).find((name) => query.includes(name));
        const places = named
          ? [{ id: `d-${named}`, displayName: { text: named }, location: { latitude: 16.05 + n++ * 0.001, longitude: 108.22 }, primaryType: "tourist_attraction" }]
          : [{ id: "g1", displayName: { text: "팝럼사 (法林寺)" }, location: { latitude: 16.06, longitude: 108.23 }, primaryType: "place_of_worship" }];
        return { ok: true, status: 200, json: async () => ({ places }) };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const names = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => (JSON.parse((c[1] as { body: string }).body) as { textQuery: string }).textQuery);
  const dictQueries = () => names().filter((q) => (REQUIRED_LANDMARK_NAMES["다낭"] ?? []).some((nm) => q.includes(nm)));

  it("사전 명소가 일반 검색 결과보다 앞 · 이름 검색 최대 6회 · 캐시 뒤 0회 · 바나힐 제외", async () => {
    const pool = await fetchLandmarkCandidates("overseas", "다낭");
    expect(pool.slice(0, 6).map((p) => p.name)).toEqual(["미케 해변", "린응사", "다낭 대성당", "오행산", "한시장", "드래곤 브리지"]);
    expect(dictQueries().length).toBeLessThanOrEqual(6);
    expect(REQUIRED_LANDMARK_NAMES["다낭"]).not.toContain("바나힐");
    const before = dictQueries().length;
    await fetchLandmarkCandidates("overseas", "다낭");
    expect(dictQueries().length).toBe(before);
  });
});

// 작업지시서 2026-11-25 (도쿄) — 사전 명소가 풀 맨 앞 · 이름 검색 ≤6회 · 캐시 뒤 0회
describe("fetchLandmarkCandidates — 도쿄 이름 사전", () => {
  beforeEach(() => {
    cache.clear();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const query = (JSON.parse(init.body) as { textQuery: string }).textQuery;
        const named = (REQUIRED_LANDMARK_NAMES["도쿄"] ?? []).find((name) => query.includes(name));
        const places = named
          ? [{ id: `t-${named}`, displayName: { text: named }, location: { latitude: 35.68 + n++ * 0.001, longitude: 139.76 }, primaryType: "tourist_attraction" }]
          : [{ id: "g1", displayName: { text: "도쿄부청사 유적" }, location: { latitude: 35.675, longitude: 139.763 }, primaryType: "tourist_attraction" }];
        return { ok: true, status: 200, json: async () => ({ places }) };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const queries = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => (JSON.parse((c[1] as { body: string }).body) as { textQuery: string }).textQuery);
  const dictQueries = () => queries().filter((q) => (REQUIRED_LANDMARK_NAMES["도쿄"] ?? []).some((nm) => q.includes(nm)));

  it("사전 명소가 일반 검색 결과보다 앞 · 이름 검색 최대 6회 · 캐시 뒤 0회", async () => {
    const pool = await fetchLandmarkCandidates("overseas", "도쿄");
    expect(pool.slice(0, 6).map((p) => p.name)).toEqual(["센소지", "메이지 신궁", "시부야 스크램블 교차로", "도쿄 스카이트리", "신주쿠 교엔", "우에노 공원"]);
    expect(dictQueries().length).toBeLessThanOrEqual(6);
    const before = dictQueries().length;
    await fetchLandmarkCandidates("overseas", "도쿄");
    expect(dictQueries().length).toBe(before);
  });
});
