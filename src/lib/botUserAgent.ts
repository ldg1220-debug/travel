/**
 * 검색 로봇·미리보기 수집기 User-Agent 판별 — 작업지시서 2026-10-21 "#333 검증" §2①, 같은 날 "v44 재생성 멈춤" §2②로 정확한 토큰(단어 경계)만 쓰도록 좁혔다.
 * 사이트맵의 코스 126개를 도는 로봇이 재빌드를 일으켜 text-pro 오늘 상한을 매일 다 썼다. 로봇 요청은 방문 기록·백그라운드 재생성·워밍 대상 선정에 쓰지 않고,
 * 캐시(직전 버전 포함)가 있으면 그대로 내보낸다.
 * 이름 목록으로만 판별한다: 일반적인 "bot" 부분 문자열도, "daum"·"whatsapp" 같은 넓은 조각도, `Claude/3.x` 같은 브라우저(데스크톱 앱) 토큰도 로봇이 아니다 —
 * AutoPipeline 같은 우리 쪽 호출자와 사람의 앱 내장 브라우저가 잘못 걸리지 않게.
 */
const BOT_TOKENS = [
  "googlebot", "google-inspectiontool", "adsbot-google", "mediapartners-google", "storebot-google", "googleother", "google-extended", "apis-google",
  "bingbot", "bingpreview", "msnbot", "yeti", "naverbot", "daumoa", "duckduckbot", "applebot", "baiduspider", "yandexbot", "yandeximages", "petalbot", "slurp",
  "facebookexternalhit", "facebot", "twitterbot", "kakaotalk-scrap", "slackbot", "linkedinbot", "telegrambot", "discordbot", "pinterestbot",
  "ahrefsbot", "semrushbot", "mj12bot", "dotbot", "bytespider", "ccbot", "amazonbot", "gptbot", "chatgpt-user", "oai-searchbot", "claudebot", "claude-web", "anthropic-ai",
  "perplexitybot", "meta-externalagent", "ia_archiver",
];
const BOT_PATTERN = new RegExp(`\\b(?:${BOT_TOKENS.join("|")})\\b`, "i");

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent) && BOT_PATTERN.test(userAgent as string);
}
