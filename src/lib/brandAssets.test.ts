import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 로고 PNG 가 모든 페이지 첫 요청으로 받아지므로(preload·스플래시·헤더) 큰 원본이 다시 들어오지 않게 막는다.
const KB = 1024;
const LIMITS: Record<string, number> = {
  "tradule-logo.png": 80 * KB,
  "tradule-logo-white.png": 80 * KB,
  "tradule-logo-cyan.png": 80 * KB,
  "tradule-wordmark.png": 25 * KB,
  "tradule-wordmark-white.png": 25 * KB,
  "tradule-wordmark-cyan.png": 25 * KB,
};

describe("brand logo file size", () => {
  for (const [file, max] of Object.entries(LIMITS)) {
    it(`${file} ≤ ${max / KB}KB`, () => {
      expect(statSync(join(process.cwd(), "public/brand", file)).size).toBeLessThanOrEqual(max);
    });
  }
});
