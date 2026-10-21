import { describe, expect, it } from "vitest";
import { isBotUserAgent } from "./botUserAgent";

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
    "python-requests/2.31",
    "",
  ])("로봇이 아님: %s", (ua) => expect(isBotUserAgent(ua)).toBe(false));

  it("User-Agent 가 없으면 로봇이 아니다", () => {
    expect(isBotUserAgent(null)).toBe(false);
    expect(isBotUserAgent(undefined)).toBe(false);
  });
});
