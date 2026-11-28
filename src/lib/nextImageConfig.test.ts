import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// 코스 지도 최적화본(/_next/image)이 60초 만에 식어 LCP 가 흔들리던 문제 — 캐시 TTL 이 다시 줄지 않게 막는다.
describe("next.config images", () => {
  it("minimumCacheTTL 은 30일(원본 s-maxage 와 같게)", () => {
    expect(nextConfig.images?.minimumCacheTTL).toBe(2592000);
  });
  it("코스 지도만 최적화 허용", () => {
    expect(nextConfig.images?.localPatterns).toEqual([{ pathname: "/api/content/course-map" }]);
  });
});
