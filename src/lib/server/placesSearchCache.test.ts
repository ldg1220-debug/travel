import { beforeEach, describe, expect, it } from "vitest";
import { SEARCH_CACHE_TTL_MS, clearSearchCache, getCachedSearch, isQueryTooShort, searchCacheKey, setCachedSearch } from "./placesSearchCache";

describe("placesSearchCache (작업지시서 2026-11-03 §1②)", () => {
  beforeEach(() => clearSearchCache());

  it("같은 질의는 TTL(10분) 안에서 캐시를 돌려주고 그 뒤에는 비운다", () => {
    const key = searchCacheKey({ region: "domestic", category: "all", query: "성수동  카페", hasToken: false });
    setCachedSearch(key, { places: [], source: "kakao" }, 1000);
    expect(getCachedSearch(key, 1000 + SEARCH_CACHE_TTL_MS - 1)).toEqual({ places: [], source: "kakao" });
    expect(getCachedSearch(key, 1000 + SEARCH_CACHE_TTL_MS + 1)).toBeNull();
  });

  it("대소문자·공백 차이는 같은 키, 지역·카테고리가 다르면 다른 키", () => {
    const a = searchCacheKey({ region: "international", category: "all", query: "Osaka  Castle", hasToken: false });
    expect(searchCacheKey({ region: "international", category: "all", query: "osaka castle", hasToken: false })).toBe(a);
    expect(searchCacheKey({ region: "domestic", category: "all", query: "osaka castle", hasToken: false })).not.toBe(a);
    expect(searchCacheKey({ region: "international", category: "restaurant", query: "osaka castle", hasToken: false })).not.toBe(a);
  });

  it("두 글자 미만(공백 제외)은 너무 짧다", () => {
    expect(isQueryTooShort("강")).toBe(true);
    expect(isQueryTooShort(" 강 ")).toBe(true);
    expect(isQueryTooShort("강남")).toBe(false);
    expect(isQueryTooShort("a b")).toBe(false);
  });
});
