import { describe, expect, it } from "vitest";
import { parseLegsBody } from "./route";

// 작업지시서 2026-09-11 "계획 탭 동선을 실제 경로로" §3 — /api/routes
// 요청 검증(순수 함수) 단위 테스트. 실제 fetchLegRoute/외부 API 호출은
// courseBrief.test.ts에서 다룬다.

describe("parseLegsBody", () => {
  it("parses a well-formed legs array", () => {
    const result = parseLegsBody({ legs: [{ fromLat: 35, fromLng: 129, toLat: 35.1, toLng: 129.1 }] });
    expect(result).toEqual({ legs: [{ fromLat: 35, fromLng: 129, toLat: 35.1, toLng: 129.1 }] });
  });

  it("accepts an empty legs array", () => {
    expect(parseLegsBody({ legs: [] })).toEqual({ legs: [] });
  });

  it("rejects a body with no legs array", () => {
    const result = parseLegsBody({});
    expect("error" in result).toBe(true);
  });

  it("rejects a body that isn't an object at all (e.g. failed JSON parse)", () => {
    const result = parseLegsBody(null);
    expect("error" in result).toBe(true);
  });

  it("rejects a leg missing a required coordinate", () => {
    const result = parseLegsBody({ legs: [{ fromLat: 35, fromLng: 129, toLat: 35.1 }] });
    expect("error" in result).toBe(true);
  });

  it("rejects a leg with a non-numeric coordinate", () => {
    const result = parseLegsBody({ legs: [{ fromLat: "35", fromLng: 129, toLat: 35.1, toLng: 129.1 }] });
    expect("error" in result).toBe(true);
  });

  it("rejects a leg with a non-finite coordinate (NaN/Infinity)", () => {
    const result = parseLegsBody({ legs: [{ fromLat: NaN, fromLng: 129, toLat: 35.1, toLng: 129.1 }] });
    expect("error" in result).toBe(true);
  });

  it("rejects too many legs at once", () => {
    const legs = Array.from({ length: 41 }, () => ({ fromLat: 35, fromLng: 129, toLat: 35.1, toLng: 129.1 }));
    const result = parseLegsBody({ legs });
    expect("error" in result).toBe(true);
  });
});
