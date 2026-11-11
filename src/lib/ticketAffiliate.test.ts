import { describe, expect, it } from "vitest";
import { hasTicketLink, ticketLinkUrl } from "./ticketAffiliate";
import type { TpEnv } from "./lodgingAffiliate";

const env: TpEnv = {
  marker: "765548",
  trs: "563085",
  campaign: { agoda: "", trip: "", booking: "", rakuten: "", klook: "137" },
  program: { agoda: "", trip: "", booking: "", rakuten: "", klook: "4110" },
};

describe("ticketAffiliate", () => {
  it("입장권이 있는 종류만 링크 대상", () => {
    expect(hasTicketLink({ category: "전망대", name: "후쿠오카 타워" })).toBe(true);
    expect(hasTicketLink({ category: "테마파크", name: "x" })).toBe(true);
    expect(hasTicketLink({ category: "수족관", name: "x" })).toBe(true);
    expect(hasTicketLink({ category: "관광지", name: "국립중앙박물관" })).toBe(true);
    expect(hasTicketLink({ category: "음식점", name: "이치란" })).toBe(false);
    expect(hasTicketLink({ category: "공원", name: "오호리 공원" })).toBe(false);
  });
  it("Klook 검색 결과로 가는 tp.media 추적 링크", () => {
    const u = new URL(ticketLinkUrl({ name: "후쿠오카 타워" }, "후쿠오카", env) as string);
    expect(u.searchParams.get("campaign_id")).toBe("137");
    expect(u.searchParams.get("p")).toBe("4110");
    expect(u.searchParams.get("sub_id")).toBe("tradule_후쿠오카_ticket");
    expect(u.searchParams.get("u")).toBe(`https://www.klook.com/ko/search/result/?query=${encodeURIComponent("후쿠오카 타워")}`);
  });
  it("campaign 이 없으면 null", () => {
    expect(ticketLinkUrl({ name: "x" }, "r", { ...env, campaign: { ...env.campaign, klook: "" } })).toBeNull();
  });
});
