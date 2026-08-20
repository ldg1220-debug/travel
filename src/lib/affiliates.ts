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
 * public 이어야 함).
 *
 * **id가 없는 프로그램은 목록에서 아예 빠진다**(2026-08 정책 변경 — 사용자
 * 지시: "어필리에이트 없는건 나중에 계정 승인되면 노출시키는걸로하고 지금은
 * 안보이게해"). 예전엔 승인 전에도 일반 검색 링크로 계속 노출했었지만,
 * 승인 안 된 곳까지 버튼으로 보여주는 게 오히려 불필요하다고 판단 —
 * 승인 후 env만 채우면 자동으로 목록에 나타난다. 이 필터링 때문에 지금
 * 당장은(트립닷컴 env를 아직 안 채웠다면) `bookingProviders()`가 빈
 * 배열을 반환할 수 있다 — 호출부는 전부 이 경우를 빈 상태로 처리해야 한다.
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

// 작업지시서 2026-08-14 "숙박 제휴 링크: 카테고리 게이팅" 실측 — "더숨포레스트"
// 사례: Kakao는 이 업소를 category_group_name "숙박"(호텔·펜션·캠핑장을 다
// 묶는 포괄값)으로만 주지만, Google은 같은 곳을 primaryType "campground"로
// 더 구체적으로 준다. 그래서 카테고리 값 하나만으로는(특히 Kakao 소스일 때)
// 캠핑장류를 걸러낼 수 없어 이름 키워드를 함께 본다 — 둘 중 하나만 맞아도
// 캠핑장류로 판정. 트립닷컴(호텔 중심 OTA)은 한국 캠핑장·글램핑·카라반
// 재고가 사실상 없어, 이 판정이 true면 트립닷컴 링크를 아예 안 보여준다.
const CAMPGROUND_CATEGORY_KEYWORDS = ["campground", "rv_park", "campsite", "cottage", "farmstay"];
const CAMPGROUND_NAME_KEYWORDS = ["캠핑장", "카라반", "글램핑", "오토캠핑", "야영장"];
function isCampgroundType(placeName: string, category?: string): boolean {
  if (category && CAMPGROUND_CATEGORY_KEYWORDS.some((k) => category.toLowerCase().includes(k))) return true;
  return CAMPGROUND_NAME_KEYWORDS.some((k) => placeName.includes(k));
}

/**
 * Booking deep-links for one lodging, branched by region:
 *  - overseas → 아고다 · 트립닷컴 · 호텔스닷컴
 *  - domestic → 아고다 · 트립닷컴 · 야놀자 · 여기어때
 * `placeName` (optionally + city) is used as the search text. `category`
 * (Google primaryType이나 Kakao category_group_name, 있는 만큼만) is used
 * purely for the campground gating below — 호출부가 모르면 안 넘겨도 된다
 * (그러면 게이팅 없이 항상 노출, 기존 동작 그대로).
 *
 * 트립닷컴은 원래 해외 전용이었다(국내 숙소를 트립닷컴으로 찾는 실사용은
 * 드물다는 가정) — 2026-08 기준 승인된 제휴 프로그램이 트립닷컴뿐이고
 * 아고다는 계속 미승인 상태라(사용자 확인), 우선 트립닷컴·트래블페이아웃
 * 위주로 실제 수익화되는 쪽을 먼저 태우기로 하고 국내에도 노출 범위를
 * 넓혔다. 아고다/야놀자/여기어때는 그대로 두되(id 없으면 일반 검색 링크로
 * 안전하게 폴백), 승인되는 대로 자동으로 제휴 모드가 켜진다.
 *
 * 캠핑장류(isCampgroundType)로 판정되면 트립닷컴은 아예 목록에서 빠지고,
 * 대신 커미션은 없지만 실제로 쓸모 있는 "네이버에서 예약 정보 보기" 링크가
 * 붙는다 — 국내 캠핑장·글램핑은 네이버 예약 연동이 흔해서 검색 결과가
 * 완전히 비어버리는 것보다 낫다(작업지시서 "숨겼을 때 대체 동작" 1안).
 */
export function bookingProviders(placeName: string, region: Region, city?: string, category?: string): BookingProvider[] {
  const text = city ? `${placeName} ${city}` : placeName;
  const q = encodeURIComponent(text);
  const list: BookingProvider[] = [];
  const campground = isCampgroundType(placeName, category);

  const agodaAff = Boolean(AFFILIATE.agodaCid);
  list.push({
    key: "agoda",
    label: "아고다",
    brand: "#c2185b",
    url: `https://www.agoda.com/search?text=${q}${agodaAff ? `&cid=${encodeURIComponent(AFFILIATE.agodaCid)}` : ""}`,
    isAffiliate: agodaAff,
  });

  if (!campground) {
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
  }

  if (region === "international") {
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
  // 승인 안 된(제휴 id 없는) 프로그램은 노출하지 않는다 — 위 doc 참고.
  const filtered = list.filter((p) => p.isAffiliate);

  // 캠핑장류는 트립닷컴이 빠지면서(위) 지금은 국내 제휴 프로그램이 하나도
  // 없어 목록이 통째로 비게 된다 — "예약을 어디서 하지" 없이 최소한의
  // 검색 경로는 남겨둔다. 커미션은 없으므로(isAffiliate: false) 위
  // 필터에는 안 걸리게 필터 이후에 붙인다.
  if (campground) {
    filtered.push({
      key: "naver",
      label: "네이버에서 예약 정보 보기",
      brand: "#03c75a",
      url: `https://search.naver.com/search.naver?query=${encodeURIComponent(`${text} 예약`)}`,
      isAffiliate: false,
    });
  }

  return filtered;
}

/** True if any provider link is a real (commissioned) affiliate link — gates the "제휴" disclosure. */
export function hasAffiliateLink(providers: BookingProvider[]): boolean {
  return providers.some((p) => p.isAffiliate);
}
