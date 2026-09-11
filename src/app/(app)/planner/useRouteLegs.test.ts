import { describe, expect, it } from "vitest";
import { adjacentPairs, missingPairs, routeLegKey, type RouteLegStop } from "./useRouteLegs";

// 작업지시서 2026-09-11 "계획 탭 동선을 실제 경로로" §3 ★ "호출을 아끼는
// 규칙" — 실제 네트워크/디바운스가 있는 useRouteLegs 훅 자체는 이
// 저장소에 React 훅 테스트 환경이 없어 단위 테스트하지 않고, 그 안에서
// 쓰는 순수 로직(어떤 쌍을 다시 조회해야 하는지)만 고정한다.

function stop(placeId: string, lat = 0, lng = 0): RouteLegStop {
  return { placeId, lat, lng };
}

describe("routeLegKey", () => {
  it("keys by (출발 placeId, 도착 placeId), order-sensitive", () => {
    expect(routeLegKey(stop("a"), stop("b"))).toBe("a>b");
    expect(routeLegKey(stop("b"), stop("a"))).toBe("b>a");
  });
});

describe("adjacentPairs", () => {
  it("builds consecutive pairs in order", () => {
    const pairs = adjacentPairs([stop("a"), stop("b"), stop("c")]);
    expect(pairs.map(([a, b]) => routeLegKey(a, b))).toEqual(["a>b", "b>c"]);
  });

  it("returns no pairs for 0 or 1 stop", () => {
    expect(adjacentPairs([])).toEqual([]);
    expect(adjacentPairs([stop("a")])).toEqual([]);
  });
});

describe("missingPairs", () => {
  it("keeps only pairs whose key isn't already known (cache hit/miss, not manual old/new diffing)", () => {
    const pairs = adjacentPairs([stop("a"), stop("b"), stop("c")]);
    const known = new Set(["a>b"]);
    const missing = missingPairs(pairs, (key) => known.has(key));
    expect(missing.map(([a, b]) => routeLegKey(a, b))).toEqual(["b>c"]);
  });

  it("returns everything when nothing is cached yet", () => {
    const pairs = adjacentPairs([stop("a"), stop("b")]);
    expect(missingPairs(pairs, () => false)).toHaveLength(1);
  });

  it("returns nothing once every pair is already known (repeated drags within the same day reuse the cache)", () => {
    const pairs = adjacentPairs([stop("a"), stop("b"), stop("c")]);
    expect(missingPairs(pairs, () => true)).toEqual([]);
  });
});
