import { flatRegions } from "./discoverData";
import { resolveTripComCity } from "./tripComCityIds";
import type { BookingProvider } from "./affiliates";
import type { Region } from "./types";

/**
 * 숙소 제휴 링크 생성기(Travelpayouts: Agoda · Trip.com · Booking.com · Rakuten Travel) — 작업지시서 2026-10-30 "숙소 예약 버튼을 수익 나는 제휴 링크로".
 *
 * 각 사의 **검색 결과 페이지**(도시 · 날짜 · 인원 쿼리)로만 보낸다 — 특정 호텔을 지목하지 않는다(근거 없는 추천 금지). 도착 URL 을 Travelpayouts 추적 링크
 * (`https://tp.media/r?marker=…&trs=…&campaign_id=…&u=<도착 URL>&sub_id=…`)로 감싼다. 프로그램별 campaign_id 가 환경 변수에 없으면(승인 전) 그 공급자는 숨긴다.
 *
 * 환경 변수(브라우저에서 링크를 조립하므로 NEXT_PUBLIC_ 이어야 번들에 들어간다):
 *   NEXT_PUBLIC_TP_CAMPAIGN_AGODA / _TRIPCOM / _BOOKING / _RAKUTEN — 승인 후 Travelpayouts 가 준 campaign_id
 *   NEXT_PUBLIC_TP_PROGRAM_AGODA / _TRIPCOM / _BOOKING / _RAKUTEN   — (선택) 프로그램 id `p` — 대시보드가 만든 추적 링크에 `p=` 가 있으면 같은 값을 넣는다
 *   NEXT_PUBLIC_TP_MARKER / NEXT_PUBLIC_TP_TRS — 기본 765548 / 563085
 *
 * ⚠️ 승인 전에는 실제 추적 링크를 만들어 볼 수 없어, 추적 링크의 파라미터 구성과 각 사 검색 URL 의 날짜 파라미터 이름은 승인 뒤 대시보드가 만든 링크와 대조해야 한다.
 */
export interface TpEnv {
  marker: string;
  trs: string;
  campaign: { agoda: string; trip: string; booking: string; rakuten: string };
  program: { agoda: string; trip: string; booking: string; rakuten: string };
}

export function readTpEnv(): TpEnv {
  // process.env.NEXT_PUBLIC_* 는 정적 참조여야 Next 가 번들에 인라인한다.
  const t = (v: string | undefined) => (v ?? "").trim();
  return {
    marker: t(process.env.NEXT_PUBLIC_TP_MARKER) || "765548",
    trs: t(process.env.NEXT_PUBLIC_TP_TRS) || "563085",
    campaign: {
      agoda: t(process.env.NEXT_PUBLIC_TP_CAMPAIGN_AGODA),
      trip: t(process.env.NEXT_PUBLIC_TP_CAMPAIGN_TRIPCOM),
      booking: t(process.env.NEXT_PUBLIC_TP_CAMPAIGN_BOOKING),
      rakuten: t(process.env.NEXT_PUBLIC_TP_CAMPAIGN_RAKUTEN),
    },
    program: {
      agoda: t(process.env.NEXT_PUBLIC_TP_PROGRAM_AGODA),
      trip: t(process.env.NEXT_PUBLIC_TP_PROGRAM_TRIPCOM),
      booking: t(process.env.NEXT_PUBLIC_TP_PROGRAM_BOOKING),
      rakuten: t(process.env.NEXT_PUBLIC_TP_PROGRAM_RAKUTEN),
    },
  };
}

export interface LodgingRequest {
  /** 도시(지역) 이름 — 검색어와 sub_id 에 쓴다. */
  city: string;
  region: Region;
  /** 체크인/체크아웃(YYYY-MM-DD). 날짜 미정이거나 이미 지난 날짜면 생략한다. */
  checkIn?: string;
  checkOut?: string;
  /** 인원(기본 2). */
  adults?: number;
  /** 일정 근처 좌표 — 지원하는 공급자(Booking.com)만 쓴다. */
  coords?: { lat: number; lng: number };
  /** 몇 일차 숙소인지(근처 숙소 보기) — sub_id 에만 쓴다. */
  day?: number;
  /** 오늘(YYYY-MM-DD) — 지난 날짜 판단용. 테스트에서 고정한다. */
  today?: string;
}

const isIso = (s: string | undefined): s is string => Boolean(s) && /^\d{4}-\d{2}-\d{2}$/.test(s as string);

/** 도시가 일본인가 — 라쿠텐 트래블은 일본 한정. */
export function isJapanCity(city: string): boolean {
  const hit = flatRegions("overseas").find((r) => r.name === city);
  return hit?.parent === "일본";
}

function tpLink(target: string, key: keyof TpEnv["campaign"], subId: string, env: TpEnv): string {
  const params = new URLSearchParams({ marker: env.marker, trs: env.trs, campaign_id: env.campaign[key] });
  if (env.program[key]) params.set("p", env.program[key]);
  params.set("sub_id", subId);
  params.set("u", target);
  return `https://tp.media/r?${params.toString()}`;
}

/**
 * 공급자 버튼 목록 — 해외: Agoda · Trip.com · Booking.com (일본이면 + Rakuten Travel), 국내: Agoda · Trip.com · Booking.com 순에 네이버를 맨 아래 보조 링크로.
 * campaign_id 가 없는 공급자는 빠진다(전부 없으면 국내는 네이버만, 해외는 빈 목록). Trip.com 은 검증된 cityId 가 없으면 빠진다(tripComCityIds.ts 와 같은 규칙).
 */
export function lodgingAffiliateProviders(req: LodgingRequest, env: TpEnv = readTpEnv()): BookingProvider[] {
  const city = req.city.trim();
  if (!city) return [];
  const adults = req.adults && req.adults > 0 ? Math.floor(req.adults) : 2;
  const today = req.today;
  const datesOk = isIso(req.checkIn) && isIso(req.checkOut) && req.checkOut > req.checkIn && (!today || req.checkIn >= today);
  const checkIn = datesOk ? req.checkIn : undefined;
  const checkOut = datesOk ? req.checkOut : undefined;
  const subId = `tradule_${city}_${req.day ?? 0}`;
  const q = encodeURIComponent(city);
  const out: BookingProvider[] = [];

  if (env.campaign.agoda) {
    const target = `https://www.agoda.com/search?text=${q}&adults=${adults}&rooms=1&locale=ko-kr&currency=KRW${checkIn ? `&checkIn=${checkIn}&checkOut=${checkOut}` : ""}`;
    out.push({ key: "agoda", label: "아고다", brand: "#c2185b", url: tpLink(target, "agoda", subId, env), isAffiliate: true });
  }
  const tripCity = env.campaign.trip ? resolveTripComCity(city, city) : null;
  if (env.campaign.trip && tripCity) {
    const target = `https://kr.trip.com/hotels/list?city=${tripCity.id}&adult=${adults}&crn=1&locale=ko-KR&curr=KRW${checkIn ? `&checkin=${checkIn}&checkout=${checkOut}` : ""}`;
    out.push({ key: "trip", label: `트립닷컴에서 ${tripCity.label} 숙소 보기`, brand: "#2577e3", url: tpLink(target, "trip", subId, env), isAffiliate: true });
  }
  if (env.campaign.booking) {
    const geo = req.coords && Number.isFinite(req.coords.lat) && Number.isFinite(req.coords.lng) ? `&latitude=${req.coords.lat.toFixed(5)}&longitude=${req.coords.lng.toFixed(5)}` : "";
    const target = `https://www.booking.com/searchresults.ko.html?ss=${q}&group_adults=${adults}&no_rooms=1&group_children=0&selected_currency=KRW${checkIn ? `&checkin=${checkIn}&checkout=${checkOut}` : ""}${geo}`;
    out.push({ key: "booking", label: "부킹닷컴", brand: "#003580", url: tpLink(target, "booking", subId, env), isAffiliate: true });
  }
  if (env.campaign.rakuten && req.region === "international" && isJapanCity(city)) {
    out.push({ key: "rakuten", label: "라쿠텐 트래블", brand: "#bf0000", url: tpLink("https://travel.rakuten.co.jp/", "rakuten", subId, env), isAffiliate: true });
  }
  // 국내는 네이버를 커미션 없는 보조 링크로 맨 아래에 둔다(제휴 링크가 있든 없든).
  if (req.region === "domestic") {
    out.push({ key: "naver", label: "네이버에서 예약 정보 보기", brand: "#03c75a", url: `https://search.naver.com/search.naver?query=${encodeURIComponent(`${city} 숙소 예약`)}`, isAffiliate: false });
  }
  return out;
}

/**
 * 새 제휴 링크(위)와 기존 직접 제휴 링크(affiliates.ts bookingProviders)를 합친다 — 같은 공급자(key)는 새 링크가 우선, 기존 쪽의 나머지 제휴 링크가 뒤에,
 * 커미션 없는 보조 링크(네이버)는 맨 아래에 한 번만.
 */
export function mergeLodgingProviders(primary: BookingProvider[], legacy: BookingProvider[]): BookingProvider[] {
  const affiliate = [...primary.filter((p) => p.isAffiliate), ...legacy.filter((p) => p.isAffiliate && !primary.some((x) => x.key === p.key))];
  const fallback = [...primary, ...legacy].filter((p) => !p.isAffiliate);
  const seen = new Set<string>();
  const dedupedFallback = fallback.filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)));
  return [...affiliate, ...dedupedFallback];
}

/** 체크아웃 날짜 — 마지막 날짜의 다음 날. */
export function nextIsoDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 계획의 항목 날짜들로 체크인/체크아웃을 정한다 — 날짜 미정(dayNumber 가 있는 항목)이면 생략. */
export function stayDatesFromItems(items: { date: string; dayNumber?: number }[]): { checkIn?: string; checkOut?: string } {
  if (items.length === 0 || items.some((i) => i.dayNumber != null)) return {};
  const dates = [...new Set(items.map((i) => i.date))].sort();
  return { checkIn: dates[0], checkOut: nextIsoDate(dates[dates.length - 1]) };
}
