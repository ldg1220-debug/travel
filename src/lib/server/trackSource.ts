import { classifyVisit } from "@/lib/botUserAgent";

/**
 * 제휴·저장 흐름 이벤트 집계에서 제외할 요청인가 — 로봇(bot)·우리 쪽 점검(internal, TraduleAutoPipeline).
 * 방문 집계(visit)와 같은 classifyVisit 기준을 쓴다. api(UA/Accept-Language 없는 직접 호출)는 기존처럼 저장.
 */
export function shouldSkipTracking(userAgent: string | null | undefined, acceptLanguage: string | null | undefined): boolean {
  const source = classifyVisit(userAgent, acceptLanguage, "page");
  return source === "bot" || source === "internal";
}

export function shouldSkipTrackingRequest(request: { headers: Headers }): boolean {
  return shouldSkipTracking(request.headers.get("user-agent"), request.headers.get("accept-language"));
}
