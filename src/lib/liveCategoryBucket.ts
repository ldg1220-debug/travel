/**
 * "그 외 종합 결과"(discover 라이브 검색) 테마 그룹 — 관광지/테마파크/
 * 음식점/술집/카페/숙소 순서로 묶어 보여주고, 어느 카테고리에도 안 걸리는
 * 결과는 기타로 모은다. DiscoverClient.tsx에서만 쓰지만, 순수 로직이라
 * 별도 파일로 뺐다(작업지시서 2026-08-26, "PR #216 검증 + 후속 2건" 4항 —
 * 단위 테스트로 고정하기 위함).
 */
export type LiveBucketKey = "관광지" | "테마파크" | "음식점" | "술집" | "카페" | "숙소" | "기타";

/** Google `primaryType`(영문) / Kakao `category_group_name`(국문) 원시 카테고리 문자열의 정확한 관측값 → 버킷. */
export const LIVE_BUCKET_BY_TYPE: Record<string, LiveBucketKey> = {
  amusement_park: "테마파크",
  water_park: "테마파크",
  theme_park: "테마파크",
  aquarium: "테마파크",
  zoo: "테마파크",
  restaurant: "음식점",
  japanese_restaurant: "음식점",
  sushi_restaurant: "음식점",
  ramen_restaurant: "음식점",
  yakiniku_restaurant: "음식점",
  tonkatsu_restaurant: "음식점",
  korean_restaurant: "음식점",
  chinese_restaurant: "음식점",
  italian_restaurant: "음식점",
  french_restaurant: "음식점",
  seafood_restaurant: "음식점",
  barbecue_restaurant: "음식점",
  fast_food_restaurant: "음식점",
  izakaya_restaurant: "술집",
  bar: "술집",
  pub: "술집",
  night_club: "술집",
  cafe: "카페",
  coffee_shop: "카페",
  bakery: "카페",
  dessert_shop: "카페",
  hotel: "숙소",
  lodging: "숙소",
  resort_hotel: "숙소",
  motel: "숙소",
  tourist_attraction: "관광지",
  shopping_mall: "관광지",
  market: "관광지",
  park: "관광지",
  museum: "관광지",
  art_gallery: "관광지",
  관광명소: "관광지",
  문화시설: "관광지",
  공원: "관광지",
  숙박: "숙소",
  음식점: "음식점",
  카페: "카페",
  // 작업지시서(2026-08-26, "검색 카테고리 분류 개선") C-1 — 프로덕션
  // 실측(질의 12회)으로 확인된 개별 관측값.
  historical_place: "관광지",
  cultural_landmark: "관광지",
  botanical_garden: "관광지",
  nature_preserve: "관광지",
  visitor_center: "관광지",
  ice_cream_shop: "카페",
};

/**
 * 정확히 일치하는 값이 없으면 접미사/접두사 규칙으로 한 번 더 시도하고,
 * 그래도 안 걸리면 기타로 보낸다(작업지시서 2026-08-26, "지역 페이지 본체
 * 설계" 2-4).
 *
 * 한글 카테고리(카카오 `category_group_name` 등 자유 텍스트)는 접미사
 * 개념이 없어 부분 문자열 매칭을 그대로 쓴다 — 목록 자체가 짧고 서로 안
 * 겹치는 단어들이라 오탐 위험이 낮다.
 *
 * 영문 Google `primaryType`은 반드시 `_`로 구분된 단어 경계 기준(접미사/
 * 접두사)으로만 검사한다 — 이전 버전은 `category.includes("bar")` 같은
 * 부분 문자열 검사를 썼는데, "korean_barbecue_restaurant"의 "barbecue"
 * 안에 "bar"가 그대로 들어있어 음식점이 아니라 술집으로 잘못 분류되는
 * 실제 버그가 있었다(작업지시서 2026-08-26, "PR #216 검증 + 후속 2건"
 * 4항이 이 타입을 "기타로 떨어짐"으로 예측했는데, 실측·재현 결과는 그게
 * 아니라 "잘못된 버킷(술집)으로 떨어짐"이었다 — 단어 경계 없는 부분
 * 문자열 매칭이 원인). 단어 경계 검사로 바꿔 이 종류의 충돌을 구조적으로
 * 막는다.
 */
export function liveCategoryBucket(category: string): LiveBucketKey {
  const mapped = LIVE_BUCKET_BY_TYPE[category];
  if (mapped) return mapped;

  if (/술집|호프|이자카야|포차|와인바|맥주/.test(category)) return "술집";
  if (/카페|디저트|베이커리/.test(category)) return "카페";
  if (/테마파크|놀이공원|워터파크|아쿠아리움|동물원/.test(category)) return "테마파크";
  if (/숙박|호텔|모텔/.test(category)) return "숙소";
  if (/음식|식당|맛집/.test(category)) return "음식점";
  if (/관광|박물관|미술관|공원|명소|시장|쇼핑/.test(category)) return "관광지";

  const c = category.toLowerCase();
  const isWord = (...words: string[]) => words.includes(c);
  const endsWithWord = (...suffixes: string[]) => suffixes.some((s) => c === s || c.endsWith(`_${s}`));
  const startsWithWord = (...prefixes: string[]) => prefixes.some((p) => c === p || c.startsWith(`${p}_`));

  if (endsWithWord("restaurant", "food")) return "음식점";
  if (endsWithWord("bar", "pub")) return "술집";
  if (endsWithWord("cafe") || startsWithWord("coffee", "ice_cream")) return "카페";
  if (isWord("bakery", "dessert_shop")) return "카페";
  if (endsWithWord("museum", "gallery", "landmark")) return "관광지";
  if (startsWithWord("amusement", "resort") || endsWithWord("playground")) return "테마파크";
  if (endsWithWord("hotel")) return "숙소";
  if (isWord("lodging", "guest_house", "hostel", "bed_and_breakfast")) return "숙소";

  return "기타";
}
