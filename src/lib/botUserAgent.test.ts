import { describe, expect, it } from "vitest";
import { classifyVisit, isBotUserAgent, isInternalUserAgent } from "./botUserAgent";

describe("isBotUserAgent", () => {
  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)",
    "Mozilla/5.0 (compatible; Daumoa/4.0; +http://cs.daum.net/faq/15/4118.html)",
    "DuckDuckBot/1.1",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "kakaotalk-scrap/1.0; +https://devtalk.kakao.com/",
    "Slackbot-LinkExpanding 1.0",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
    "Mozilla/5.0 (compatible; SemrushBot/7~bl)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0)",
    "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (Applebot/0.1)",
  ])("로봇: %s", (ua) => expect(isBotUserAgent(ua)).toBe(true));

  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
    "AutoPipeline/1.0",
    // 작업지시서 2026-10-21 "v44 재생성 멈춤" §2② — 브라우저·앱 내장 토큰은 사람이다
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/3.4.0 Chrome/130.0.0.0 Electron/33.2.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36 WhatsApp/2.24",
    "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/130.0 daumsearch-user",
    "vercel-screenshot/1.0",
    "node",
    "",
  ])("로봇이 아님: %s", (ua) => expect(isBotUserAgent(ua)).toBe(false));

  it("User-Agent 가 없으면 로봇이 아니다", () => {
    expect(isBotUserAgent(null)).toBe(false);
    expect(isBotUserAgent(undefined)).toBe(false);
  });
});

// 작업지시서 2026-10-27 "사람 방문 218" — 내부 호출 표시 · 일반 패턴 · 사람 판정 최소 조건
describe("classifyVisit", () => {
  const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
  it("TraduleAutoPipeline 은 internal 로 먼저 분기한다(일반 패턴에 걸려도 로봇이 아니다)", () => {
    expect(isInternalUserAgent("TraduleAutoPipeline/1.2 (python-requests)")).toBe(true);
    expect(isBotUserAgent("TraduleAutoPipeline/1.2 (python-requests)")).toBe(false);
    expect(classifyVisit("TraduleAutoPipeline/1.2 (python-requests)", null, "public-api")).toBe("internal");
  });
  it.each(["Bytespider; spider-feedback@bytedance.com", "Mozilla/5.0 (compatible; SeznamBot/4.0)", "DataForSeoBot/1.0", "python-requests/2.31", "curl/8.4.0", "Wget/1.21", "Go-http-client/2.0", "axios/1.6", "node-fetch/1.0", "undici", "HeadlessChrome/130", "SomeCrawler/2", "Mozilla/5.0 (compatible; SiteScraper)"])(
    "일반 패턴·이름 목록: %s → bot",
    (ua) => expect(classifyVisit(ua, "ko", "page")).toBe("bot"),
  );
  it("사람 = 브라우저 UA(Mozilla/) + Accept-Language + 화면 요청. course-brief API 직접 호출은 api", () => {
    expect(classifyVisit(CHROME, "ko-KR,ko;q=0.9", "page")).toBe("human");
    expect(classifyVisit(CHROME, "ko-KR", "public-api")).toBe("api");
    expect(classifyVisit(CHROME, null, "page")).toBe("api");
    expect(classifyVisit("", "ko", "page")).toBe("api");
    expect(classifyVisit(null, "ko", "page")).toBe("api");
    expect(classifyVisit("Dalvik/2.1.0 (Linux; Android 14)", "ko", "page")).toBe("api");
  });
  it("브라우저 앱 토큰(Claude/3.x)은 사람", () => {
    expect(classifyVisit("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Claude/3.4.0 Chrome/130 Electron/33 Safari/537.36", "en-US", "page")).toBe("human");
  });
});
