import { liveCategoryBucket } from "@/lib/liveCategoryBucket";
import { isBeachByName, isIsland, isVenueName, isJetty, isLargeFacility } from "./courseRecommend";

/**
 * 코스 스팟의 한국어 "종류" — 작업지시서 2026-10-12 "#304 검증" §3. 이전엔 discover용 7개 버킷
 * (liveCategoryBucket)만 써서 세부·도쿄·오사카 스팟 상당수가 "기타"로 나가 AutoPipeline 표에 "—"/"장소"로
 * 찍혔다(산토니뇨 성당·스파·해변·선착장·스카이트리·센소지·오사카 성 …). discover의 버킷은 그대로 두고
 * (다른 화면이 쓴다), 코스 응답 전용으로 Google primaryType과 이름을 함께 보는 더 세밀한 매핑을 둔다.
 *
 * 우선순위: ① primaryType 정확 일치 → ② 식음료·숙소 버킷(liveCategoryBucket) → ③ "관광지"·"기타"로 떨어질 때만 이름
 * 단서(선착장 > 섬 > 해변 > 스파 > 전망대 > 사원·성당 > 공원 > 명소/유적 > 음식점) → ④ 그래도 없으면 tourist_attraction류는
 * "관광지", 정말 없을 때만 "기타". 수족관·동물원은 "테마파크"가 아니다(#297 종일시설 판정과 일치).
 */
export type CourseSpotCategory =
  | "관광지" | "테마파크" | "음식점" | "술집" | "카페" | "숙소" | "기타"
  | "스파" | "사원·성당" | "해변" | "선착장" | "섬" | "수족관" | "동물원" | "전망대" | "공원" | "명소/유적";

const TYPE_TABLE: Record<string, CourseSpotCategory> = {
  aquarium: "수족관",
  zoo: "동물원",
  amusement_park: "테마파크",
  water_park: "테마파크",
  theme_park: "테마파크",
  spa: "스파",
  massage: "스파",
  beauty_salon: "스파",
  wellness_center: "스파",
  sauna: "스파",
  beach: "해변",
  island: "섬",
  ferry_terminal: "선착장",
  pier: "선착장",
  marina: "선착장",
  place_of_worship: "사원·성당",
  church: "사원·성당",
  cathedral: "사원·성당",
  mosque: "사원·성당",
  synagogue: "사원·성당",
  hindu_temple: "사원·성당",
  buddhist_temple: "사원·성당",
  shinto_shrine: "사원·성당",
  temple: "사원·성당",
  shrine: "사원·성당",
  observation_deck: "전망대",
  observation_tower: "전망대",
  tower: "전망대",
  park: "공원",
  national_park: "공원",
  state_park: "공원",
  city_park: "공원",
  garden: "공원",
  botanical_garden: "공원",
  castle: "명소/유적",
  palace: "명소/유적",
  fort: "명소/유적",
  monument: "명소/유적",
  historical_landmark: "명소/유적",
  historical_place: "명소/유적",
  cultural_landmark: "명소/유적",
  museum: "명소/유적",
  art_gallery: "명소/유적",
  steak_house: "음식점",
  buffet_restaurant: "음식점",
  hot_pot_restaurant: "음식점",
  meal_takeaway: "음식점",
  food_court: "음식점",
};

// 작업지시서 2026-10-12 "#305 검증" §2③ — 트리쉐이드(세부의 마사지·스파 업장)처럼 이름에 스파 단어가 없는 업장은 이름 사전에 둔다.
const NAME_SPA = /스파|마사지|\bspa\b|massage|reflexology|리플렉솔로지|웰니스|\bwellness\b|트리쉐이드|tree\s?shade/i;
// 작업지시서 2026-10-12 "#305 검증" §2② — 상점가·시장·거리·아케이드는 사원·스파 등 이름 규칙보다 우선(신사이바시스지 상점가가 "신사"·"지"로 사원 오판).
const NAME_STREET = /상점가|시장|거리|스트리트|아케이드|\bstreet\b|\barcade\b|\bmarket\b/i;
const NAME_TOWER = /전망대|스카이|타워|\btower\b|observat|skytree|sky\s?deck|쓰텐카쿠|tsutenkaku|대관람차|관람차|\bferris\b/i; // 대관람차·Ferris: 작업지시서 2026-10-13 §4(덴포잔 대관람차)
const NAME_BEACH = /해변|해수욕장|비치|\bbeach\b/i;
// 작업지시서 2026-10-12 "#305 검증" §2① — 사원 단어 사전: 절·사찰·신궁·성당·교회·사원·대성당·Temple·Shrine·Church·Cathedral(+Mosque).
// "신사"는 이름이 "신사"로 끝날 때만(야사카 신사 — "신사이바시"의 "신사"는 아니다), "…사"는 한글 2~4자 + 사로 끝나는 마지막 단어만(불국사·해동용궁사).
// 이전의 "…지로 끝나면 사원" 규칙은 삭제했다.
const NAME_WORSHIP = /신궁|사원|성당|교회|사찰|대성당|(?<![가-힣])절(?![가-힣])|\btemple\b|\bshrine\b|\bchurch\b|\bcathedral\b|\bmosque\b|신사$/i;
const NAME_WORSHIP_SA_SUFFIX = /(?:^|\s)[가-힣]{2,4}사$/;
// "…사"로 끝나는 회사·기관 이름(주식회사·본사·지사·출판사·보험사·증권사·대사관 등)은 사원이 아니다.
const NAME_COMPANY_SUFFIX = /(?:회사|본사|지사|출판사|보험사|증권사|여행사|연구사)$/;
const NAME_PARK = /공원|교엔|정원|가든|\bpark\b|\bgarden\b/i;
const NAME_HERITAGE = /(?:성|궁|궁전|탑|고분)$|궁전|박물관|미술관|유적|\bcastle\b|\bpalace\b|\bmuseum\b|\bruins?\b/i;
const NAME_FOOD = /카오소이|쌀국수|국수|noodle|와규|wagyu|스시|sushi|라멘|ramen|이자카야|izakaya|식당|레스토랑|restaurant|steak|스테이크|\bbbq\b|야키니쿠|yakiniku|맛집/i;

const NAME_RESTAURANT_WORD = /레스토랑|\brestaurant\b|\bbistro\b|\bbrasserie\b/i;
const NAME_BY_CHEF = /\bby\s+\p{Lu}/u; // 대소문자 구분 — "by Paul Pairet"
const NAME_CAFE_WORD = /카페|커피|베이커리|\bcafe\b|café|\bcoffee\b|\bbakery\b|\broasters?\b/i;

export function courseSpotCategory(p: { category: string; name: string; beach?: boolean; reviewCount?: number | null }): CourseSpotCategory {
  const raw = (p.category ?? "").toLowerCase();
  const exact = TYPE_TABLE[raw];
  // 작업지시서 2026-10-13 "새 대표 일수 코스 점검" §1③ — 이름이 …해변/…Beach/…비치(+괄호 표기)로 끝나면 primaryType 이 park 여도 해변이다
  // (이파오 해변(스노클링)·탄중 리팟 해변이 "공원"으로 나갔다). 식음료·공연 시설은 isBeachByName 이 제외한다.
  if ((exact === undefined || exact === "공원") && isBeachByName(p)) return "해변";
  if (exact) return exact;

  // 작업지시서 2026-10-12 "#306 검증" §2 — 종일시설(facilityDay)인 스팟은 종류도 "테마파크"다. Kakao(국내) 후보는 primaryType이
  // 없어 롯데월드 어드벤처가 "관광지"로 나갔다 — 표시(facilityDay)와 종류가 같은 판정(isLargeFacility)을 쓰게 한다.
  if (isLargeFacility(p)) return "테마파크";

  const bucket = liveCategoryBucket(p.category ?? "");
  // 작업지시서 2026-10-13 "#312 검증" §4 — primaryType 이 cafe 여도 이름이 레스토랑 표지(Restaurant·레스토랑·Bistro·Brasserie·"by {셰프명}")면 음식점
  // (상하이 Polux by Paul Pairet). 이름에 카페·커피·베이커리 단어가 있으면 카페 그대로.
  if (bucket === "카페" && (NAME_RESTAURANT_WORD.test(p.name) || NAME_BY_CHEF.test(p.name)) && !NAME_CAFE_WORD.test(p.name)) return "음식점";
  if (bucket === "음식점" || bucket === "술집" || bucket === "카페" || bucket === "숙소") return bucket;
  if (bucket === "테마파크") {
    // Kakao 한글 분류("아쿠아리움"·"동물원")는 테마파크가 아니다.
    if (/아쿠아리움/.test(p.category)) return "수족관";
    if (/동물원/.test(p.category)) return "동물원";
    return "테마파크";
  }

  // 여기부터는 "관광지"·"기타"(또는 버킷에 없는 값) — 이름 단서로 더 구체적인 종류를 찾는다.
  const asPlace = { category: p.category, name: p.name };
  if (p.beach === true) return "해변"; // 원본 primaryType으로 정한 플래그가 이름 단서보다 우선(섬 이름의 해변 등)
  if (NAME_STREET.test(p.name)) return "관광지"; // 상점가·시장·거리는 다른 이름 규칙보다 우선
  if (isJetty(asPlace)) return "선착장";
  if (isIsland(asPlace)) return "섬";
  if (NAME_BEACH.test(p.name) && !isVenueName(p.name)) return "해변"; // 식당·바·디너쇼는 이름에 비치가 있어도 해변이 아니다(2026-10-13 §1①)
  if (NAME_SPA.test(p.name)) return "스파";
  if (NAME_TOWER.test(p.name)) return "전망대";
  if (NAME_WORSHIP.test(p.name) || (NAME_WORSHIP_SA_SUFFIX.test(p.name) && !NAME_COMPANY_SUFFIX.test(p.name))) return "사원·성당";
  if (NAME_PARK.test(p.name)) return "공원";
  if (NAME_HERITAGE.test(p.name)) return "명소/유적";
  if (bucket === "관광지") return "관광지";
  if (NAME_FOOD.test(p.name)) return "음식점";
  return "기타";
}
