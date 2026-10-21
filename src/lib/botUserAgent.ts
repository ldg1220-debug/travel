/**
 * 검색 로봇·미리보기 수집기 User-Agent 판별 — 작업지시서 2026-10-21 "#333 검증" §2①. 사이트맵의 코스 126개를 도는 로봇이 재빌드를 일으켜 text-pro 오늘 상한을 매일 다 썼다.
 * 로봇 요청은 방문 기록·백그라운드 재생성·워밍 대상 선정에 쓰지 않고, 캐시(직전 버전 포함)가 있으면 그대로 내보낸다.
 * 이름 목록으로만 판별한다(일반적인 "bot" 부분 문자열은 쓰지 않는다 — AutoPipeline 같은 우리 쪽 호출자가 잘못 걸리지 않게).
 */
const BOT_PATTERN = new RegExp(
  [
    "googlebot", "google-inspectiontool", "adsbot-google", "mediapartners-google", "storebot-google", "googleother", "google-extended", "apis-google",
    "bingbot", "bingpreview", "msnbot", "yeti", "naverbot", "daum", "duckduckbot", "applebot", "baiduspider", "yandex(?:bot|images)?", "petalbot", "slurp",
    "facebookexternalhit", "facebot", "twitterbot", "kakaotalk-scrap", "slackbot", "linkedinbot", "telegrambot", "discordbot", "whatsapp", "pinterestbot",
    "ahrefsbot", "semrushbot", "mj12bot", "dotbot", "bytespider", "ccbot", "amazonbot", "gptbot", "chatgpt-user", "oai-searchbot", "claudebot", "claude-web", "anthropic-ai",
    "perplexitybot", "meta-externalagent", "ia_archiver",
  ].join("|"),
  "i",
);

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent) && BOT_PATTERN.test(userAgent as string);
}
