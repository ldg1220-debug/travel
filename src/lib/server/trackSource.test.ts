import { describe, expect, it } from "vitest";
import { shouldSkipTracking, shouldSkipTrackingRequest } from "./trackSource";

const CHROME = "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const LANG = "ko-KR,ko;q=0.9";

describe("shouldSkipTracking", () => {
  it("일반 모바일 Chrome UA + Accept-Language → 저장", () => {
    expect(shouldSkipTracking(CHROME, LANG)).toBe(false);
  });
  it("Googlebot → 저장 안 함", () => {
    expect(shouldSkipTracking("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", LANG)).toBe(true);
  });
  it("Cowork 점검 UA(… TraduleAutoPipeline/cowork) → 저장 안 함", () => {
    expect(shouldSkipTracking(`${CHROME} TraduleAutoPipeline/cowork`, LANG)).toBe(true);
  });
  it("Request 헤더에서 읽는다", () => {
    const h = (ua: string) => ({ headers: new Headers({ "user-agent": ua, "accept-language": LANG }) });
    expect(shouldSkipTrackingRequest(h(CHROME))).toBe(false);
    expect(shouldSkipTrackingRequest(h(`${CHROME} TraduleAutoPipeline/cowork`))).toBe(true);
  });
});
