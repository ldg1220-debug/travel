import { beforeEach, describe, expect, it } from "vitest";
import { checkPhotoRequest, isSameSiteReferer, PHOTO_RATE_PER_MINUTE, resetPhotoRateLimit, takePhotoRateToken } from "./photoGuard";

const human = (extra: Record<string, string> = {}) =>
  new Headers({ "user-agent": "Mozilla/5.0 (iPhone) AppleWebKit Safari", host: "travel.example", referer: "https://travel.example/discover", "x-forwarded-for": "1.2.3.4", ...extra });

describe("photoGuard", () => {
  beforeEach(() => resetPhotoRateLimit());

  it("같은 도메인 사람 요청은 통과", () => {
    expect(checkPhotoRequest(human())).toBeNull();
  });
  it("봇 UA 는 거절", () => {
    expect(checkPhotoRequest(human({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }))).toBe("bot");
    expect(checkPhotoRequest(human({ "user-agent": "Mozilla/5.0 (compatible; bingbot/2.0)" }))).toBe("bot");
  });
  it("Referer 가 없거나 다른 도메인이면 거절", () => {
    const noRef = human();
    noRef.delete("referer");
    expect(checkPhotoRequest(noRef)).toBe("referer");
    expect(checkPhotoRequest(human({ referer: "https://evil.example/x" }))).toBe("referer");
    expect(isSameSiteReferer(null, "https://travel.example", "travel.example")).toBe(true);
    expect(isSameSiteReferer("not a url", null, "travel.example")).toBe(false);
  });
  it("IP 당 분당 상한을 넘으면 거절, 다음 분엔 다시 허용", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < PHOTO_RATE_PER_MINUTE; i++) expect(takePhotoRateToken("9.9.9.9", t0 + i)).toBe(true);
    expect(takePhotoRateToken("9.9.9.9", t0 + 100)).toBe(false);
    expect(takePhotoRateToken("8.8.8.8", t0 + 100)).toBe(true);
    expect(takePhotoRateToken("9.9.9.9", t0 + 61_000)).toBe(true);
  });
});
