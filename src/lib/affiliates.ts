import type { Region } from "./types";

/**
 * 숙소 예약 제휴 딥링크 (수익구조).
 *
 * 우리가 가진 건 Google/Kakao place(호텔명·주소·좌표)뿐 각 예약사의 내부
 * 호텔 id는 없으므로, "호텔명으로 각 사 검색 페이지를 여는" **검색 딥링크**를
 * 만든다. 특정 property 상세로 바로 꽂는 직링크는 각 사 콘텐츠 API 승인이
 * 필요한 2단계 작업.
 *
 * 제휴 id는 아래 NEXT_PUBLIC_* env에서 읽는다 (링크를 브라우저에서 조립하므로
 * public 이어야 함). **id가 없으면** 버튼은 그냥 일반 검색 링크로 동작하고
 * "제휴" 표기도 뜨지 않으므로, 프로그램 승인 전에 붙여도 앱이 깨지거나
 * 오해를 주지 않는다 — 승인 후 id만 채우면 자동으로 수익화 모드로 전환된다.
 *
 * ⚠️ 각 사의 정확한 제휴 파라미터/URL 규격은 프로그램마다 다르고 바뀌므로
 * 대시보드에서 최종 확인이 필요하다. 아래는 흔한 형태의 템플릿이다.
 *   - 아고다:   cid
 *   - 트립닷컴: Allianceid + SID
 *   - 호텔스닷컴(Expedia): aid/camref
 *   - 야놀자 / 여기어때: 국내 제휴(파트너 코드) — 링크프라이스 등 CPS 네트워크
 *     경유가 일반적이라, 그 경우 이 링크를 네트워크 추적 URL로 감싸면 된다.
 */
const AFFILIATE = {
  // process.env.NEXT_PUBLIC_* 는 정적 참조여야 Next 가 번들에 인라인한다.
  agodaCid: (process.env.NEXT_PUBLIC_AGODA_CID ?? "").trim(),
  tripAllianceId: (process.env.NEXT_PUBLIC_TRIP_ALLIANCE_ID ?? "").trim(),
  tripSid: (process.env.NEXT_PUBLIC_TRIP_SID ?? "").trim(),
  hotelsAffiliate: (process.env.NEXT_PUBLIC_HOTELS_AFFILIATE ?? "").trim(),
  yanoljaPartner: (process.env.NEXT_PUBLIC_YANOLJA_PARTNER ?? "").trim(),
  yeogiPartner: (process.env.NEXT_PUBLIC_YEOGI_PARTNER ?? "").trim(),
};

export interface BookingProvider {
  key: string;
  label: string;
  /** Brand color for the button border/text. */
  brand: string;
  url: string;
  /** True when a real affiliate id was applied (→ show "제휴" + rel=sponsored). */
  isAffiliate: boolean;
}

/**
 * Google `primaryType` / Kakao category → is this a place you'd book a room at?
 * Covers English Places types and Korean Kakao category words.
 */
export function isLodging(category: string): boolean {
  const c = category.toLowerCase();
  return [
    "lodging", "hotel", "motel", "resort", "guest_house", "guesthouse", "hostel", "inn", "bed_and_breakfast", "campground",
    "숙박", "숙소", "호텔", "모텔", "게스트", "펜션", "리조트", "여관",
  ].some((k) => c.includes(k));
}

/**
 * Booking deep-links for one lodging, branched by region:
 *  - overseas → 아고다 · 트립닷컴 · 호텔스닷컴
 *  - domestic → 아고다 · 야놀자 · 여기어때
 * `placeName` (optionally + city) is used as the search text.
 */
export function bookingProviders(placeName: string, region: Region, city?: string): BookingProvider[] {
  const text = city ? `${placeName} ${city}` : placeName;
  const q = encodeURIComponent(text);
  const list: BookingProvider[] = [];

  const agodaAff = Boolean(AFFILIATE.agodaCid);
  list.push({
    key: "agoda",
    label: "아고다",
    brand: "#c2185b",
    url: `https://www.agoda.com/search?text=${q}${agodaAff ? `&cid=${encodeURIComponent(AFFILIATE.agodaCid)}` : ""}`,
    isAffiliate: agodaAff,
  });

  if (region === "international") {
    const tripAff = Boolean(AFFILIATE.tripAllianceId);
    list.push({
      key: "trip",
      label: "트립닷컴",
      brand: "#2577e3",
      url: `https://www.trip.com/hotels/list?keyword=${q}${
        tripAff ? `&Allianceid=${encodeURIComponent(AFFILIATE.tripAllianceId)}&SID=${encodeURIComponent(AFFILIATE.tripSid)}` : ""
      }`,
      isAffiliate: tripAff,
    });
    const hotelsAff = Boolean(AFFILIATE.hotelsAffiliate);
    list.push({
      key: "hotels",
      label: "호텔스닷컴",
      brand: "#d32f2f",
      url: `https://www.hotels.com/Hotel-Search?destination=${q}${hotelsAff ? `&aid=${encodeURIComponent(AFFILIATE.hotelsAffiliate)}` : ""}`,
      isAffiliate: hotelsAff,
    });
  } else {
    const yanAff = Boolean(AFFILIATE.yanoljaPartner);
    list.push({
      key: "yanolja",
      label: "야놀자",
      brand: "#f04452",
      url: `https://www.yanolja.com/search/${q}${yanAff ? `?partner=${encodeURIComponent(AFFILIATE.yanoljaPartner)}` : ""}`,
      isAffiliate: yanAff,
    });
    const yeogiAff = Boolean(AFFILIATE.yeogiPartner);
    list.push({
      key: "yeogi",
      label: "여기어때",
      brand: "#1bc0c0",
      url: `https://www.goodchoice.kr/product/search/${q}${yeogiAff ? `?partner=${encodeURIComponent(AFFILIATE.yeogiPartner)}` : ""}`,
      isAffiliate: yeogiAff,
    });
  }
  return list;
}

/** True if any provider link is a real (commissioned) affiliate link — gates the "제휴" disclosure. */
export function hasAffiliateLink(providers: BookingProvider[]): boolean {
  return providers.some((p) => p.isAffiliate);
}
