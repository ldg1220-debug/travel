import { describe, expect, it } from "vitest";
import { isJapanCity, KLOOK_CITY_IDS, lodgingAffiliateProviders, readTpEnv, mergeLodgingProviders, nextIsoDate, stayDatesFromItems, type TpEnv } from "./lodgingAffiliate";
import type { BookingProvider } from "./affiliates";

const env = (campaign: Partial<TpEnv["campaign"]> = {}, program: Partial<TpEnv["program"]> = {}): TpEnv => ({
  marker: "765548",
  trs: "563085",
  campaign: { agoda: "", trip: "", booking: "", rakuten: "", klook: "", ...campaign },
  program: { agoda: "", trip: "", booking: "", rakuten: "", klook: "", ...program },
});
const decodeTarget = (url: string) => new URL(url).searchParams.get("u")!;

// 작업지시서 2026-10-30 — 숙소 제휴 링크 생성기
describe("lodgingAffiliateProviders", () => {
  it("campaign_id 가 없는 공급자는 숨긴다(전부 없으면 해외는 빈 목록)", () => {
    expect(lodgingAffiliateProviders({ city: "오사카", region: "international" }, env())).toEqual([]);
    const only = lodgingAffiliateProviders({ city: "오사카", region: "international" }, env({ booking: "77" }));
    expect(only.map((p) => p.key)).toEqual(["booking"]);
  });

  it("추적 링크에 marker · trs · campaign_id · sub_id 가 실리고, 도착 URL 은 검색 페이지(도시·날짜·인원)다", () => {
    const [agoda] = lodgingAffiliateProviders(
      { city: "오사카", region: "international", checkIn: "2026-12-24", checkOut: "2026-12-27", adults: 3, day: 2, today: "2026-10-30" },
      env({ agoda: "11" }, { agoda: "4115" }),
    );
    const u = new URL(agoda.url);
    expect(u.origin + u.pathname).toBe("https://tp.media/r");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ marker: "765548", trs: "563085", campaign_id: "11", p: "4115", sub_id: "tradule_오사카_2" });
    const target = new URL(decodeTarget(agoda.url));
    expect(target.hostname).toBe("www.agoda.com");
    expect(Object.fromEntries(target.searchParams)).toMatchObject({ text: "오사카", adults: "3", checkIn: "2026-12-24", checkOut: "2026-12-27" });
    expect(agoda.isAffiliate).toBe(true);
  });

  it("날짜 미정·지난 날짜·체크아웃 ≤ 체크인이면 날짜를 생략한다", () => {
    const e = env({ agoda: "11" });
    for (const dates of [{}, { checkIn: "2026-10-01", checkOut: "2026-10-03" }, { checkIn: "2026-12-05", checkOut: "2026-12-05" }]) {
      const [p] = lodgingAffiliateProviders({ city: "오사카", region: "international", today: "2026-10-30", ...dates }, e);
      expect(new URL(decodeTarget(p.url)).searchParams.has("checkIn")).toBe(false);
    }
  });

  it("Trip.com 은 검증된 cityId 가 있는 도시만, Booking.com 은 좌표를 싣는다(근처 숙소)", () => {
    const e = env({ trip: "5", booking: "6" });
    const osaka = lodgingAffiliateProviders({ city: "오사카", region: "international", coords: { lat: 34.6687, lng: 135.5013 } }, e);
    expect(osaka.map((p) => p.key)).toEqual(["trip", "booking"]);
    const booking = new URL(decodeTarget(osaka[1].url));
    expect(booking.searchParams.get("latitude")).toBe("34.66870");
    expect(booking.searchParams.get("longitude")).toBe("135.50130");
    const nowhere = lodgingAffiliateProviders({ city: "아틀란티스", region: "international" }, e);
    expect(nowhere.map((p) => p.key)).toEqual(["booking"]);
  });

  it("라쿠텐 트래블은 일본 도시에서만", () => {
    expect(isJapanCity("오사카")).toBe(true);
    expect(isJapanCity("방콕")).toBe(false);
    const e = env({ rakuten: "9" });
    expect(lodgingAffiliateProviders({ city: "오사카", region: "international" }, e).map((p) => p.key)).toEqual(["rakuten"]);
    expect(lodgingAffiliateProviders({ city: "방콕", region: "international" }, e)).toEqual([]);
  });

  it("국내는 네이버를 보조 링크로 맨 아래(커미션 없음), 제휴 링크가 없어도 네이버는 남는다", () => {
    const list = lodgingAffiliateProviders({ city: "제주", region: "domestic" }, env({ agoda: "11", booking: "6" }));
    expect(list.map((p) => p.key)).toEqual(["agoda", "booking", "naver"]);
    expect(list.at(-1)!.isAffiliate).toBe(false);
    expect(lodgingAffiliateProviders({ city: "제주", region: "domestic" }, env()).map((p) => p.key)).toEqual(["naver"]);
  });

  it("호텔을 지목하지 않는다 — 도착 URL 은 검색 결과 페이지뿐(도시명만 쿼리)", () => {
    const list = lodgingAffiliateProviders({ city: "오사카", region: "international" }, env({ agoda: "1", trip: "2", booking: "3" }));
    for (const p of list) {
      const t = new URL(decodeTarget(p.url));
      expect(["/search", "/hotels/list", "/searchresults.ko.html"]).toContain(t.pathname);
    }
  });
});

// 작업지시서 2026-11-02 — Klook 호텔(이미 연결, campaign_id 137 · p 4110)
describe("Klook 호텔", () => {
  it("코드 기본값으로 켜져 있다 — campaign_id 137 · p 4110 (환경 변수 없이도)", () => {
    const e = readTpEnv();
    expect(e.campaign.klook).toBe("137");
    expect(e.program.klook).toBe("4110");
    expect(e.marker).toBe("765548");
    expect(e.trs).toBe("563085");
  });

  it("오사카: 추적 링크(tp.media · marker · trs · campaign_id=137 · p=4110 · sub_id) + 도착 URL 이 c29-osaka 호텔 페이지", () => {
    const [klook] = lodgingAffiliateProviders({ city: "오사카", region: "international", day: 2 }, readTpEnv());
    expect(klook.key).toBe("klook-hotel");
    expect(klook.isAffiliate).toBe(true);
    const u = new URL(klook.url);
    expect(u.origin + u.pathname).toBe("https://tp.media/r");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ campaign_id: "137", marker: "765548", p: "4110", sub_id: "tradule_오사카_2", trs: "563085" });
    expect(u.searchParams.get("u")).toBe("https://www.klook.com/ko/destination/c29-osaka/3-hotel/");
  });

  it("확인된 9개 도시는 도시별 호텔 페이지, 확인 못 한 도시(후쿠오카·제주·경주)는 공통 랜딩 /ko/hotels/ — 짐작하지 않는다", () => {
    expect(Object.keys(KLOOK_CITY_IDS).sort()).toEqual(["다낭", "도쿄", "방콕", "부산", "세부", "오사카", "타이베이", "하노이", "홍콩"].sort());
    const target = (city: string, region: "international" | "domestic") => new URL(new URL(lodgingAffiliateProviders({ city, region }, readTpEnv()).find((p) => p.key === "klook-hotel")!.url).searchParams.get("u")!).pathname;
    expect(target("도쿄", "international")).toBe("/ko/destination/c28-tokyo/3-hotel/");
    expect(target("부산", "domestic")).toBe("/ko/destination/c46-busan/3-hotel/");
    for (const [city, region] of [["후쿠오카", "international"], ["제주", "domestic"], ["경주", "domestic"]] as const) expect(target(city, region)).toBe("/ko/hotels/");
  });

  it("날짜·좌표·인원을 도착 URL 에 싣지 않는다", () => {
    const klook = lodgingAffiliateProviders({ city: "오사카", region: "international", checkIn: "2026-12-24", checkOut: "2026-12-27", coords: { lat: 34.6, lng: 135.5 }, adults: 3, today: "2026-11-02" }, readTpEnv()).find((p) => p.key === "klook-hotel")!;
    expect(new URL(klook.url).searchParams.get("u")).toBe("https://www.klook.com/ko/destination/c29-osaka/3-hotel/");
  });

  it("순서: 승인된 공급자(Agoda · Trip.com · Booking) → Klook → 네이버(보조) — 승인 전에는 Klook 이 첫 버튼", () => {
    const base = { city: "부산", region: "domestic" as const };
    expect(lodgingAffiliateProviders(base, readTpEnv()).map((p) => p.key)).toEqual(["klook-hotel", "naver"]); // 지금: Agoda 등은 숨김
    expect(lodgingAffiliateProviders(base, { ...readTpEnv(), campaign: { ...readTpEnv().campaign, agoda: "11", booking: "6" } }).map((p) => p.key)).toEqual(["agoda", "booking", "klook-hotel", "naver"]);
    const legacy: BookingProvider[] = [{ key: "hotels", label: "h", brand: "#000", url: "https://x/h", isAffiliate: true }];
    expect(mergeLodgingProviders(lodgingAffiliateProviders(base, readTpEnv()), legacy).map((p) => p.key)).toEqual(["hotels", "klook-hotel", "naver"]);
  });

  it("해외 도시도 Klook 이 첫 버튼(Agoda 등 숨김) — 네이버는 해외에 붙지 않는다", () => {
    expect(lodgingAffiliateProviders({ city: "방콕", region: "international" }, readTpEnv()).map((p) => p.key)).toEqual(["klook-hotel"]);
  });
});

describe("mergeLodgingProviders · stayDatesFromItems", () => {
  const prov = (key: string, isAffiliate: boolean): BookingProvider => ({ key, label: key, brand: "#000", url: `https://x/${key}`, isAffiliate });
  it("같은 공급자는 새 링크가 우선, 보조(네이버)는 맨 아래 한 번만", () => {
    const merged = mergeLodgingProviders([prov("agoda", true), prov("naver", false)], [prov("agoda", true), prov("hotels", true), prov("naver", false)]);
    expect(merged.map((p) => p.key)).toEqual(["agoda", "hotels", "naver"]);
  });
  it("계획 날짜 → 체크인/체크아웃(마지막 날 다음 날), 날짜 미정(dayNumber)이면 생략", () => {
    expect(nextIsoDate("2026-12-31")).toBe("2027-01-01");
    expect(stayDatesFromItems([{ date: "2026-12-24" }, { date: "2026-12-26" }])).toEqual({ checkIn: "2026-12-24", checkOut: "2026-12-27" });
    expect(stayDatesFromItems([{ date: "2026-01-01", dayNumber: 1 }])).toEqual({});
    expect(stayDatesFromItems([])).toEqual({});
  });
});
