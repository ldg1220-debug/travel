import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LodgingAffiliateLinks } from "./LodgingAffiliateLinks";
import type { BookingProvider } from "@/lib/affiliates";

const prov = (key: string, isAffiliate: boolean): BookingProvider => ({ key, label: key === "naver" ? "네이버에서 예약 정보 보기" : key, brand: "#000", url: `https://x.test/${key}`, isAffiliate });

// 작업지시서 2026-10-30 §1③ — 코스 페이지 "이 지역 숙소 보기"
describe("LodgingAffiliateLinks", () => {
  it("제휴 링크가 하나도 없으면(네이버 보조 링크뿐이어도) 아무것도 렌더하지 않는다", () => {
    expect(renderToStaticMarkup(createElement(LodgingAffiliateLinks, { region: "제주", providers: [] }))).toBe("");
    expect(renderToStaticMarkup(createElement(LodgingAffiliateLinks, { region: "제주", providers: [prov("naver", false)] }))).toBe("");
  });
  it("제휴 링크가 있으면 sponsored 링크 · 제휴 고지 1줄 · 지역명을 보여 준다", () => {
    const html = renderToStaticMarkup(createElement(LodgingAffiliateLinks, { region: "오사카", providers: [prov("agoda", true), prov("booking", true)] }));
    expect(html).toContain("오사카 숙소 보기");
    expect(html).toContain("일부 링크는 제휴 링크로, 예약 시 트레쥴에 수수료가 지급될 수 있어요.");
    expect(html.match(/rel="sponsored nofollow noreferrer"/g)).toHaveLength(2);
  });
});
