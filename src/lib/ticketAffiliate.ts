import { readTpEnv, type TpEnv } from "./lodgingAffiliate";

/**
 * 코스 페이지 명소별 "입장권 확인" 링크 — DIRECTION.md 백로그. Klook **검색 결과 페이지**로만 보낸다(특정 상품 추천 아님).
 * 입장권이 흔한 종류(전망대·테마파크·수족관·박물관/미술관)에만 붙인다. Klook 은 숙소 링크와 같은 Travelpayouts 프로그램(campaign 137 · p 4110).
 * ⚠️ 검색 URL 의 쿼리 파라미터 이름(`query`)은 Klook 사이트 기준 추정이라 배포 후 실제 열림을 확인해야 한다.
 */
const TICKET_CATEGORIES = new Set(["전망대", "테마파크", "수족관"]);
const MUSEUM_NAME = /박물관|미술관|museum/i;

export function hasTicketLink(spot: { category: string; name: string }): boolean {
  return TICKET_CATEGORIES.has(spot.category) || MUSEUM_NAME.test(spot.name);
}

export function ticketLinkUrl(spot: { name: string }, region: string, env: TpEnv = readTpEnv()): string | null {
  if (!env.campaign.klook) return null;
  const target = `https://www.klook.com/ko/search/result/?query=${encodeURIComponent(spot.name)}`;
  const params = new URLSearchParams({ marker: env.marker, trs: env.trs, campaign_id: env.campaign.klook });
  if (env.program.klook) params.set("p", env.program.klook);
  params.set("sub_id", `tradule_${region}_ticket`);
  params.set("u", target);
  return `https://tp.media/r?${params.toString()}`;
}
