import { isBotUserAgent } from "@/lib/botUserAgent";

/**
 * 사진 프록시(/api/discover/spot-photo · /api/places/photo) 공용 입구 검사 — 작업지시서 2026-11-22 "사진 사용량" §1②.
 * 봇 UA · 우리 도메인이 아닌 Referer · IP 당 분당 상한을 넘은 요청은 Google 을 부르지 않고 플레이스홀더(404)로 돌려보낸다.
 * (메모리 카운터라 인스턴스마다 따로 센다 — 한 IP 가 여러 인스턴스를 도는 경우까지 막는 용도가 아니라 폭주 완화용.)
 */
export const PHOTO_RATE_PER_MINUTE = 30;
const RATE_MAX_KEYS = 5000;
const hits = new Map<string, { windowStart: number; count: number }>();

/** IP 당 분당 상한 — 상한 이내면 true. 테스트에서 시간을 주입할 수 있다. */
export function takePhotoRateToken(ip: string, nowMs = Date.now(), limit = PHOTO_RATE_PER_MINUTE): boolean {
  const cur = hits.get(ip);
  if (!cur || nowMs - cur.windowStart >= 60_000) {
    if (hits.size >= RATE_MAX_KEYS) {
      for (const [k, v] of hits) if (nowMs - v.windowStart >= 60_000) hits.delete(k);
      if (hits.size >= RATE_MAX_KEYS) hits.clear();
    }
    hits.set(ip, { windowStart: nowMs, count: 1 });
    return true;
  }
  cur.count += 1;
  return cur.count <= limit;
}

/** 테스트용 초기화. */
export function resetPhotoRateLimit(): void {
  hits.clear();
}

/** Referer(없으면 Origin)의 호스트가 이 요청이 들어온 호스트와 같을 때만 true — 주소창 직접 호출·외부 사이트 핫링크는 거절. */
export function isSameSiteReferer(referer: string | null, origin: string | null, host: string | null): boolean {
  const from = referer || origin;
  if (!from || !host) return false;
  try {
    return new URL(from).host === host;
  } catch {
    return false;
  }
}

export type PhotoRejectReason = "bot" | "referer" | "rate";

/** 거절 사유(통과면 null). */
export function checkPhotoRequest(headers: Headers, nowMs = Date.now()): PhotoRejectReason | null {
  if (isBotUserAgent(headers.get("user-agent"))) return "bot";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!isSameSiteReferer(headers.get("referer"), headers.get("origin"), host)) return "referer";
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!takePhotoRateToken(ip, nowMs)) return "rate";
  return null;
}
