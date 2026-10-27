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
  // 작업지시서 2026-10-27 "사람 방문 218" §2② — 사이트맵을 순회하는 그 밖의 수집기
  "seznambot", "dataforseobot", "blexbot", "imagesiftbot", "barkrowler",
];
const BOT_PATTERN = new RegExp(`\\b(?:${BOT_TOKENS.join("|")})\\b`, "i");
// 일반 패턴 — 이름 목록에 없는 수집기·스크립트 클라이언트. (브라우저 토큰 `Claude/3.x` 는 해당 없음)
const GENERIC_BOT_PATTERN = /(bot|crawler|spider|crawl|slurp|scraper|headless|python-requests|curl|wget|go-http-client|axios|node-fetch|undici)/i;
/** 우리 쪽 서버 호출(AutoPipeline)의 User-Agent 표식 — `TraduleAutoPipeline/1.x`. */
const INTERNAL_PATTERN = /TraduleAutoPipeline/i;

export function isInternalUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent) && INTERNAL_PATTERN.test(userAgent as string);
}

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || isInternalUserAgent(userAgent)) return false; // 내부 호출은 로봇이 아니다(먼저 분기)
  return BOT_PATTERN.test(userAgent) || GENERIC_BOT_PATTERN.test(userAgent);
}

/**
 * 요청 출처 — human(사람: 브라우저 UA + Accept-Language + 사람이 여는 화면) · bot(검색 로봇·수집기) · internal(우리 서버 호출) · api(그 밖의 직접 호출).
 * surface: "page" = 코스 페이지·앱 화면에서 열린 요청, "public-api" = 공개 course-brief API 직접 호출(사람으로 세지 않는다).
 */
export type VisitSource = "human" | "bot" | "internal" | "api";
export function classifyVisit(userAgent: string | null | undefined, acceptLanguage: string | null | undefined, surface: "page" | "public-api"): VisitSource {
  if (isInternalUserAgent(userAgent)) return "internal";
  if (isBotUserAgent(userAgent)) return "bot";
  if (surface === "public-api") return "api";
  if (!userAgent || !/^Mozilla\//i.test(userAgent) || !acceptLanguage?.trim()) return "api";
  return "human";
}
