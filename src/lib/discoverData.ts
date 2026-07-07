/**
 * Curated /discover feed data — trending + all-time spots and community
 * route templates, branched by scope (국내/해외) the same way the planner's
 * trend list branches by region (see src/lib/mockPlacesDomestic.ts /
 * src/lib/server/getTrendingPlaces.ts). Served through /api/discover/trends
 * so the client always goes through a real API boundary instead of reading
 * a hardcoded object baked into the page bundle — a real deployment would
 * swap this module's contents for a DB-backed query, same as those.
 */

import { CONTINENT_ORDER, DOMESTIC_CANONICAL, SIDO_PROVINCE } from "./regions";

export type DiscoverScope = "domestic" | "overseas";
export type Season = "spring" | "summer" | "fall" | "winter";

/** Coarse place categories used to bucket search results (탐색 탭 카테고리별 리스트). */
export type PlaceCategoryTag =
  | "관광지"
  | "테마파크"
  | "음식점"
  | "술집"
  | "박물관"
  | "카페"
  | "자연"
  | "쇼핑"
  | "숙소";

/** String key for a lucide icon — kept serializable so this data can flow through a JSON API route. */
export type SpotIconKey = "coffee" | "camera" | "waves" | "landmark" | "utensils" | "pin" | "tent" | "wine" | "building" | "hotel";

/** 음식점-only sub-category, surfaced as a second row of filter chips once 음식점 is the active category. */
export type CuisineTag = "일식" | "한식" | "양식/아시안" | "카페/디저트";

export interface DiscoverSpot {
  id: string;
  name: string;
  region: string;
  tag: PlaceCategoryTag;
  season: Season;
  saves: number;
  gradient: string;
  iconKey: SpotIconKey;
  lat: number;
  lng: number;
  color: string;
  /** Only meaningful for tag === "음식점" — which sub-category chip this falls under. */
  cuisine?: CuisineTag;
  /** Specific dish/menu keywords ("라멘", "스시", ...) — matched by search in addition to name/region/tag, so a dish-specific query like "오사카 라멘" returns every ramen-adjacent place, not just ones with "라멘" literally in their name. */
  subTags?: string[];
  /** Google-Places-style rating out of 5 (e.g. 4.7) — backfilled for every spot if not set explicitly, see the metadata pass near the bottom of this file. */
  rating?: number;
  /** Review count backing the rating (e.g. 1240) — shown alongside it on SpotCard as "⭐4.7 · 1.2k". */
  reviewCount?: number;
}

export interface DiscoverRouteStop {
  time: string;
  name: string;
  lat: number;
  lng: number;
}

export interface DiscoverRoute {
  id: string;
  title: string;
  subtitle: string;
  region: string;
  duration: string;
  gradient: string;
  stops: DiscoverRouteStop[];
  author: string;
  likes: number;
  views: number;
}

export interface DiscoverBundle {
  trending: DiscoverSpot[];
  favorites: DiscoverSpot[];
  routes: DiscoverRoute[];
}

/** Current season for the "계절별" recommendation chip, from the server clock. */
export function seasonNow(date = new Date()): Season {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

export const SEASON_LABEL: Record<Season, string> = {
  spring: "봄",
  summer: "여름",
  fall: "가을",
  winter: "겨울",
};

const GENERATED_GRADIENTS = [
  "from-rose-400 to-orange-300",
  "from-violet-400 to-fuchsia-300",
  "from-sky-400 to-cyan-300",
  "from-amber-400 to-yellow-300",
  "from-emerald-400 to-teal-300",
  "from-indigo-400 to-purple-300",
  "from-red-400 to-orange-300",
  "from-lime-400 to-green-300",
];
const GENERATED_COLORS = ["#fb7185", "#a78bfa", "#38bdf8", "#fbbf24", "#34d399", "#818cf8", "#f87171", "#a3e635"];
const GENERATED_SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

/**
 * Pads a (city, category) combination out to a browsable volume from a
 * hand-authored name list, instead of hand-typing every field of every
 * entry — only the names carry real creative effort; id, a small
 * deterministic coordinate offset (so generated pins spread out near the
 * seed coordinate instead of stacking exactly on top of each other),
 * gradient/color/season cycling, and a descending save-count ramp are
 * all derived mechanically from the list index.
 */
function generateSpots(
  idPrefix: string,
  names: string[],
  region: string,
  tag: PlaceCategoryTag,
  iconKey: SpotIconKey,
  baseLat: number,
  baseLng: number,
  savesStart: number,
  /** Per-name (same index as `names`) cuisine/subTags — only relevant for tag === "음식점". */
  extras?: { cuisine?: CuisineTag; subTags?: string[] }[],
): DiscoverSpot[] {
  return names.map((name, i) => {
    const angle = i * 2.4; // spreads points around the seed coordinate instead of a straight line
    const radius = 0.0025 * (1 + i * 0.35);
    return {
      id: `${idPrefix}${i + 1}`,
      name,
      region,
      tag,
      season: GENERATED_SEASONS[i % GENERATED_SEASONS.length],
      saves: Math.max(120, savesStart - i * 65),
      gradient: GENERATED_GRADIENTS[i % GENERATED_GRADIENTS.length],
      iconKey,
      lat: baseLat + Math.cos(angle) * radius,
      lng: baseLng + Math.sin(angle) * radius,
      color: GENERATED_COLORS[i % GENERATED_COLORS.length],
      cuisine: extras?.[i]?.cuisine,
      subTags: extras?.[i]?.subTags,
    };
  });
}

const DOMESTIC: DiscoverBundle = {
  trending: [
    { id: "d-t1", name: "애월 감성 카페거리", region: "제주 · 애월", tag: "카페", season: "summer", saves: 1240, gradient: "from-rose-400 to-orange-300", iconKey: "coffee", lat: 33.4623, lng: 126.3096, color: "#fb7185" },
    { id: "d-t2", name: "성수동 팝업 스트리트", region: "서울 · 성수", tag: "쇼핑", season: "fall", saves: 980, gradient: "from-violet-400 to-fuchsia-300", iconKey: "camera", lat: 37.5445, lng: 127.0557, color: "#a78bfa" },
    { id: "d-t3", name: "해운대 블루라인 파크", region: "부산 · 해운대", tag: "자연", season: "summer", saves: 872, gradient: "from-sky-400 to-cyan-300", iconKey: "waves", lat: 35.1587, lng: 129.1604, color: "#38bdf8" },
    { id: "d-t4", name: "익선동 한옥골목", region: "서울 · 종로", tag: "관광지", season: "fall", saves: 640, gradient: "from-amber-400 to-yellow-300", iconKey: "landmark", lat: 37.573, lng: 126.991, color: "#fbbf24" },
    { id: "d-t5", name: "황리단길 포장마차거리", region: "경주 · 황남동", tag: "술집", season: "summer", saves: 1560, gradient: "from-indigo-400 to-purple-300", iconKey: "wine", lat: 35.8345, lng: 129.2115, color: "#818cf8" },
    { id: "d-t6", name: "경주월드 테마파크", region: "경주 · 보문동", tag: "테마파크", season: "summer", saves: 1120, gradient: "from-orange-400 to-amber-300", iconKey: "tent", lat: 35.8215, lng: 129.2695, color: "#fb923c" },
  ],
  favorites: [
    { id: "d-f1", name: "경복궁", region: "서울 · 종로", tag: "관광지", season: "spring", saves: 5200, gradient: "from-emerald-400 to-teal-300", iconKey: "landmark", lat: 37.5796, lng: 126.977, color: "#34d399" },
    { id: "d-f2", name: "성산일출봉", region: "제주 · 서귀포", tag: "자연", season: "fall", saves: 4800, gradient: "from-lime-400 to-green-300", iconKey: "waves", lat: 33.4586, lng: 126.9425, color: "#a3e635" },
    { id: "d-f3", name: "광장시장 먹자골목", region: "서울 · 종로", tag: "음식점", season: "winter", saves: 4100, gradient: "from-orange-400 to-red-300", iconKey: "utensils", lat: 37.5701, lng: 126.9997, color: "#fb923c" },
    { id: "d-f4", name: "감천문화마을", region: "부산 · 사하", tag: "관광지", season: "summer", saves: 3600, gradient: "from-pink-400 to-rose-300", iconKey: "camera", lat: 35.0975, lng: 129.0107, color: "#f472b6" },
    { id: "d-f5", name: "불국사", region: "경주 · 진현동", tag: "관광지", season: "fall", saves: 3900, gradient: "from-teal-400 to-emerald-300", iconKey: "landmark", lat: 35.7898, lng: 129.332, color: "#2dd4bf" },
    { id: "d-f6", name: "대릉원 돌담길", region: "경주 · 황남동", tag: "관광지", season: "spring", saves: 3300, gradient: "from-rose-400 to-pink-300", iconKey: "camera", lat: 35.8367, lng: 129.2133, color: "#fb7185" },
    { id: "d-f7", name: "국립경주박물관", region: "경주 · 인왕동", tag: "박물관", season: "winter", saves: 2100, gradient: "from-sky-400 to-indigo-300", iconKey: "building", lat: 35.8305, lng: 129.2274, color: "#38bdf8" },
    { id: "d-f8", name: "교촌마을 한옥 맛집", region: "경주 · 교동", tag: "음식점", season: "fall", saves: 1980, gradient: "from-amber-400 to-orange-300", iconKey: "utensils", lat: 35.8305, lng: 129.2105, color: "#fbbf24" },
    // 경주 음식점 — 황리단길 일대 트렌디 맛집 (야끼니꾸/라멘 포함), 검색 시 "카테고리별 장소"에서 음식점 칩으로 걸러진다.
    { id: "d-f9", name: "황리단길 라멘하우스", region: "경주 · 황남동", tag: "음식점", season: "winter", saves: 1720, gradient: "from-orange-400 to-red-300", iconKey: "utensils", lat: 35.8342, lng: 129.2109, color: "#fb923c" },
    { id: "d-f10", name: "경주 야키니쿠 스미비", region: "경주 · 황남동", tag: "음식점", season: "fall", saves: 1540, gradient: "from-red-400 to-orange-300", iconKey: "utensils", lat: 35.8355, lng: 129.213, color: "#f87171" },
    { id: "d-f11", name: "황남빵 본점", region: "경주 · 황남동", tag: "음식점", season: "spring", saves: 2650, gradient: "from-amber-400 to-yellow-300", iconKey: "utensils", lat: 35.838, lng: 129.2077, color: "#fbbf24" },
    // 경주 숙소 — 호텔/게스트하우스/에어비앤비, 아직 국내 데이터에 "숙소" 태그가 하나도 없었어서 새로 추가.
    { id: "d-f12", name: "경주 힐탑호텔", region: "경주 · 불국동", tag: "숙소", season: "summer", saves: 1380, gradient: "from-sky-400 to-blue-300", iconKey: "hotel", lat: 35.8256, lng: 129.2231, color: "#38bdf8" },
    { id: "d-f13", name: "황리단길 게스트하우스", region: "경주 · 황남동", tag: "숙소", season: "fall", saves: 960, gradient: "from-violet-400 to-purple-300", iconKey: "hotel", lat: 35.834, lng: 129.2115, color: "#a78bfa" },
    { id: "d-f14", name: "경주 라한셀렉트 호텔", region: "경주 · 보문동", tag: "숙소", season: "winter", saves: 1210, gradient: "from-slate-400 to-slate-300", iconKey: "hotel", lat: 35.843, lng: 129.275, color: "#94a3b8" },
    { id: "d-f15", name: "보문단지 한옥스테이 에어비앤비", region: "경주 · 보문동", tag: "숙소", season: "spring", saves: 890, gradient: "from-emerald-400 to-teal-300", iconKey: "hotel", lat: 35.841, lng: 129.27, color: "#34d399" },
  ],
  routes: [
    {
      id: "d-r1",
      title: "서울 종로 근본 투어",
      subtitle: "궁궐부터 시장까지, 하루 완주 코스",
      region: "서울",
      duration: "당일치기 · 4곳",
      gradient: "from-emerald-500 to-teal-400",
      author: "서울토박이",
      likes: 2140,
      views: 18900,
      stops: [
        { time: "10:00", name: "경복궁", lat: 37.5796, lng: 126.977 },
        { time: "13:00", name: "광장시장", lat: 37.5701, lng: 126.9997 },
        { time: "15:30", name: "익선동 한옥골목", lat: 37.573, lng: 126.991 },
        { time: "18:00", name: "청계천 야경", lat: 37.5696, lng: 126.9784 },
      ],
    },
    {
      id: "d-r2",
      title: "제주 애월 감성 드라이브",
      subtitle: "바다 뷰 카페와 노을 명소",
      region: "제주",
      duration: "당일치기 · 3곳",
      gradient: "from-sky-500 to-cyan-400",
      author: "제주살이",
      likes: 1680,
      views: 12300,
      stops: [
        { time: "11:00", name: "애월 카페거리", lat: 33.4623, lng: 126.3096 },
        { time: "14:00", name: "협재해수욕장", lat: 33.3937, lng: 126.2394 },
        { time: "18:30", name: "곽지 노을 스팟", lat: 33.4498, lng: 126.2989 },
      ],
    },
    {
      id: "d-r3",
      title: "경주 역사 탐방 코스",
      subtitle: "천년 신라의 흔적을 하루 만에",
      region: "경주",
      duration: "당일치기 · 4곳",
      gradient: "from-amber-500 to-orange-400",
      author: "여행자_민지",
      likes: 3200,
      views: 21400,
      stops: [
        { time: "09:30", name: "불국사", lat: 35.7898, lng: 129.332 },
        { time: "13:00", name: "대릉원 돌담길", lat: 35.8367, lng: 129.2133 },
        { time: "15:00", name: "국립경주박물관", lat: 35.8305, lng: 129.2274 },
        { time: "18:00", name: "황리단길 포장마차거리", lat: 35.8345, lng: 129.2115 },
      ],
    },
    {
      id: "d-r4",
      title: "황리단길 감성 카페 투어",
      subtitle: "한옥 카페와 소품샵을 걸어서",
      region: "경주",
      duration: "반나절 · 3곳",
      gradient: "from-rose-500 to-amber-400",
      author: "황리단길러버",
      likes: 1450,
      views: 9800,
      stops: [
        { time: "11:00", name: "교촌마을 한옥 맛집", lat: 35.8305, lng: 129.2105 },
        { time: "14:00", name: "대릉원 돌담길", lat: 35.8367, lng: 129.2133 },
        { time: "16:30", name: "황리단길 포장마차거리", lat: 35.8345, lng: 129.2115 },
      ],
    },
  ],
};

const OVERSEAS: DiscoverBundle = {
  trending: [
    { id: "o-t1", name: "도톤보리 글리코 사인", region: "일본 · 오사카", tag: "관광지", season: "summer", saves: 3120, gradient: "from-fuchsia-400 to-pink-300", iconKey: "camera", lat: 34.6688, lng: 135.5019, color: "#e879f9" },
    { id: "o-t2", name: "유후인 플로랄 빌리지", region: "일본 · 오이타", tag: "관광지", season: "spring", saves: 2540, gradient: "from-rose-400 to-amber-300", iconKey: "landmark", lat: 33.2668, lng: 131.3717, color: "#fb7185" },
    { id: "o-t3", name: "하노이 구시가지 나이트", region: "베트남 · 하노이", tag: "술집", season: "summer", saves: 1980, gradient: "from-amber-400 to-orange-300", iconKey: "utensils", lat: 21.0343, lng: 105.8508, color: "#fbbf24" },
    { id: "o-t4", name: "캐널시티 하카타", region: "일본 · 후쿠오카", tag: "쇼핑", season: "fall", saves: 1670, gradient: "from-cyan-400 to-blue-300", iconKey: "pin", lat: 33.5898, lng: 130.4103, color: "#22d3ee" },
  ],
  favorites: [
    { id: "o-f1", name: "오사카성", region: "일본 · 오사카", tag: "관광지", season: "spring", saves: 8900, gradient: "from-teal-400 to-emerald-300", iconKey: "landmark", lat: 34.6873, lng: 135.5259, color: "#2dd4bf" },
    { id: "o-f2", name: "이치란 라멘 본점", region: "일본 · 후쿠오카", tag: "음식점", season: "winter", saves: 7300, gradient: "from-red-400 to-orange-300", iconKey: "utensils", lat: 33.5958, lng: 130.409, color: "#f87171" },
    { id: "o-f3", name: "호안끼엠 호수", region: "베트남 · 하노이", tag: "자연", season: "summer", saves: 6100, gradient: "from-green-400 to-lime-300", iconKey: "waves", lat: 21.0285, lng: 105.8524, color: "#4ade80" },
    { id: "o-f4", name: "나라 사슴공원", region: "일본 · 나라", tag: "자연", season: "spring", saves: 5400, gradient: "from-yellow-400 to-amber-300", iconKey: "camera", lat: 34.6851, lng: 135.843, color: "#facc15" },
    // 오사카 음식점 — 도톤보리/신사이바시/우메다 일대 (기존엔 오사카 태그의 음식점이 하나도 없었음).
    { id: "o-f5", name: "도톤보리 타코야키 왕골목", region: "일본 · 오사카", tag: "음식점", season: "summer", saves: 6800, gradient: "from-orange-400 to-red-300", iconKey: "utensils", lat: 34.6688, lng: 135.5019, color: "#fb923c" },
    { id: "o-f6", name: "신사이바시 야키니쿠 규카쿠", region: "일본 · 오사카", tag: "음식점", season: "fall", saves: 4200, gradient: "from-red-400 to-rose-300", iconKey: "utensils", lat: 34.6731, lng: 135.5013, color: "#f87171" },
    { id: "o-f7", name: "우메다 라멘 스트리트", region: "일본 · 오사카", tag: "음식점", season: "winter", saves: 5100, gradient: "from-amber-400 to-orange-300", iconKey: "utensils", lat: 34.7025, lng: 135.4959, color: "#fbbf24" },
    { id: "o-f8", name: "쿠로몬 시장 스시", region: "일본 · 오사카", tag: "음식점", season: "spring", saves: 3900, gradient: "from-rose-400 to-pink-300", iconKey: "utensils", lat: 34.6656, lng: 135.5065, color: "#fb7185" },
    // 오사카 숙소 — 호텔/게스트하우스/에어비앤비.
    { id: "o-f9", name: "난바 시티 호텔", region: "일본 · 오사카", tag: "숙소", season: "summer", saves: 2400, gradient: "from-sky-400 to-blue-300", iconKey: "hotel", lat: 34.6656, lng: 135.5006, color: "#38bdf8" },
    { id: "o-f10", name: "신사이바시 캡슐호텔", region: "일본 · 오사카", tag: "숙소", season: "fall", saves: 1680, gradient: "from-slate-400 to-slate-300", iconKey: "hotel", lat: 34.6741, lng: 135.502, color: "#94a3b8" },
    { id: "o-f11", name: "도톤보리뷰 에어비앤비", region: "일본 · 오사카", tag: "숙소", season: "winter", saves: 1950, gradient: "from-violet-400 to-purple-300", iconKey: "hotel", lat: 34.669, lng: 135.503, color: "#a78bfa" },
    { id: "o-f12", name: "우메다 스카이 호텔", region: "일본 · 오사카", tag: "숙소", season: "spring", saves: 2870, gradient: "from-emerald-400 to-teal-300", iconKey: "hotel", lat: 34.7052, lng: 135.4906, color: "#34d399" },
  ],
  routes: [
    {
      id: "o-r1",
      title: "오사카 당일치기 먹방 코스",
      subtitle: "타코야키부터 라멘까지 위장 투어",
      region: "오사카",
      duration: "당일치기 · 4곳",
      gradient: "from-rose-500 to-orange-400",
      author: "오사카_먹방러",
      likes: 2870,
      views: 24100,
      stops: [
        { time: "11:00", name: "쿠로몬 시장", lat: 34.6656, lng: 135.5065 },
        { time: "13:30", name: "도톤보리 타코야키", lat: 34.6688, lng: 135.5019 },
        { time: "16:00", name: "신세카이 쿠시카츠", lat: 34.6524, lng: 135.5063 },
        { time: "19:00", name: "우메다 라멘 골목", lat: 34.7024, lng: 135.4959 },
      ],
    },
    {
      id: "o-r2",
      title: "후쿠오카-유후인 핵심 동선",
      subtitle: "텐진 도심 산책부터 유후인 킨린코까지",
      region: "후쿠오카",
      duration: "1박 2일 · 4곳",
      gradient: "from-violet-500 to-fuchsia-400",
      author: "규슈여행자",
      likes: 1930,
      views: 15600,
      stops: [
        { time: "09:00", name: "텐진 지하상가", lat: 33.5904, lng: 130.3986 },
        { time: "11:00", name: "오호리공원", lat: 33.5847, lng: 130.3782 },
        { time: "15:00", name: "유후인 플로랄 빌리지", lat: 33.2668, lng: 131.3717 },
        { time: "17:00", name: "킨린코 호수", lat: 33.2696, lng: 131.3745 },
      ],
    },
  ],
};

// ── volume pass: 경주/오사카 previously had only 1-4 음식점/숙소/관광지
// entries each — nowhere near enough to browse. Generated (not hand-typed
// one-by-one) via generateSpots() from real-sounding name lists, per city
// per category, to reach a scrollable 13-15 cards each. ──
const GYEONGJU_ATTRACTION_NAMES = [
  "첨성대",
  "동궁과 월지",
  "계림",
  "오릉",
  "분황사",
  "황룡사지",
  "문무대왕릉",
  "감은사지 삼층석탑",
  "양동마을",
  "보문호수공원",
  "김유신장군묘",
  "첨성대 별빛광장",
  "안압지 야경 산책로",
];
const GYEONGJU_FOOD_NAMES = [
  "요석궁 한정식",
  "함양집 왕갈비탕",
  "황남관 한우꽃등심",
  "첨성대 국밥거리",
  "황리단길 스시오마카세",
  "신라밀면 본점",
  "경주 한우 명가",
  "교동법주 안주상",
  "보문호수 브런치하우스",
  "불국사 산채정식",
];
// Same order/index as GYEONGJU_FOOD_NAMES above.
const GYEONGJU_FOOD_EXTRAS: { cuisine: CuisineTag; subTags: string[] }[] = [
  { cuisine: "한식", subTags: ["한정식", "전통음식"] },
  { cuisine: "한식", subTags: ["갈비탕", "한우"] },
  { cuisine: "한식", subTags: ["한우", "꽃등심"] },
  { cuisine: "한식", subTags: ["국밥", "순대국"] },
  { cuisine: "일식", subTags: ["스시", "오마카세"] },
  { cuisine: "한식", subTags: ["밀면", "냉면"] },
  { cuisine: "한식", subTags: ["한우", "갈비"] },
  { cuisine: "한식", subTags: ["전통주", "안주"] },
  { cuisine: "양식/아시안", subTags: ["브런치", "파스타"] },
  { cuisine: "한식", subTags: ["산채정식", "사찰음식"] },
];
const GYEONGJU_LODGING_NAMES = [
  "신라스테이 경주",
  "켄싱턴리조트 경주",
  "코오롱호텔 경주",
  "보문 게스트하우스 소풍",
  "황남동 한옥스테이 다솜",
  "첨성대뷰 에어비앤비",
  "경주 브릿지호텔",
  "대릉원 게스트하우스",
  "보문호수 리조트빌라",
  "황리단길 부티크스테이",
];

const OSAKA_ATTRACTION_NAMES = [
  "우메다 스카이빌딩 공중정원",
  "신사이바시스지 상점가",
  "오사카 아쿠아리움 카이유칸",
  "텐노지 동물원",
  "시텐노지",
  "나카노시마 공원",
  "텐진바시스지 상점가",
  "스파월드",
  "오사카성 매화숲",
  "신세카이 츠텐카쿠 타워",
  "난바 그랜드 카게츠",
  "오사카시립과학관",
  "도톤보리 리버크루즈 선착장",
];
const OSAKA_FOOD_NAMES = [
  "규카츠 이치우마",
  "신사이바시 스시로 회전초밥",
  "도톤보리 오코노미야키 미즈노",
  "쿠시카츠 다루마 신세카이본점",
  "텐진바시스지 다코야키 골목",
  "우메다 스시장인",
  "신사이바시 규카츠 만넨야",
  "난바 멘야무사시 라멘",
  "오사카 오모니식당",
  "츠루하시 야키니쿠거리",
];
// Same order/index as OSAKA_FOOD_NAMES above. A few entries carry a
// secondary "라멘" subTag on top of their main dish (many 규카츠/다코야키
// spots realistically also run a ramen menu) so a dish-specific search
// like "오사카 라멘" surfaces a full spread, not just the 1-2 places with
// literally "라멘" in the name.
const OSAKA_FOOD_EXTRAS: { cuisine: CuisineTag; subTags: string[] }[] = [
  { cuisine: "일식", subTags: ["규카츠", "돈카츠", "라멘"] },
  { cuisine: "일식", subTags: ["스시", "회전초밥"] },
  { cuisine: "일식", subTags: ["오코노미야키", "철판요리"] },
  { cuisine: "일식", subTags: ["쿠시카츠", "튀김꼬치"] },
  { cuisine: "일식", subTags: ["다코야키", "길거리음식", "라멘"] },
  { cuisine: "일식", subTags: ["스시", "오마카세"] },
  { cuisine: "일식", subTags: ["규카츠", "돈카츠", "라멘"] },
  { cuisine: "일식", subTags: ["라멘", "돈코츠라멘"] },
  { cuisine: "한식", subTags: ["한식", "코리아타운"] },
  { cuisine: "일식", subTags: ["야키니쿠", "숯불구이"] },
];
const OSAKA_LODGING_NAMES = [
  "신사이바시 프리미어호텔",
  "난바 백패커스호스텔",
  "도톤보리 리버사이드 아파트먼트",
  "우메다 스카이 게스트하우스",
  "텐노지 캡슐인",
  "신세카이 다다미스테이",
  "오사카 에어비앤비 츠루하시뷰",
  "난바 스테이션프론트 호텔",
  "신사이바시 디자이너스호텔",
  "오사카성뷰 레지던스",
];

// 우메다 자체를 콕 집어 검색했을 때 (예: "우메다 맛집", "우메다 근처 맛집")
// 결과가 2개뿐이었던 문제 — 우메다 동네 이름을 이름에 직접 박은 음식점/숙소를
// 대거 추가해 검색 시 15곳 이상 나오도록 보강.
const UMEDA_FOOD_NAMES = [
  "우메다 스시효",
  "우메다 오코노미야키 아젠",
  "우메다 라멘 무테키야",
  "우메다 야키토리 골목",
  "우메다 지하식당가",
  "우메다 소바 혼텐",
  "우메다 텐푸라 스이쇼",
  "우메다 스테이크하우스",
  "우메다 디저트 카페 하루",
  "우메다 우동 사누키야",
  "우메다 카레 전문점",
  "우메다 이자카야 토리키조쿠",
  "우메다 브런치 다이너",
];
// Same order/index as UMEDA_FOOD_NAMES above.
const UMEDA_FOOD_EXTRAS: { cuisine: CuisineTag; subTags: string[] }[] = [
  { cuisine: "일식", subTags: ["스시", "오마카세"] },
  { cuisine: "일식", subTags: ["오코노미야키", "철판요리"] },
  { cuisine: "일식", subTags: ["라멘", "돈코츠라멘"] },
  { cuisine: "일식", subTags: ["야키토리", "꼬치구이"] },
  { cuisine: "일식", subTags: ["지하상가", "여러메뉴"] },
  { cuisine: "일식", subTags: ["소바", "면요리"] },
  { cuisine: "일식", subTags: ["텐푸라", "튀김"] },
  { cuisine: "양식/아시안", subTags: ["스테이크", "그릴"] },
  { cuisine: "카페/디저트", subTags: ["디저트", "케이크"] },
  { cuisine: "일식", subTags: ["우동", "사누키우동"] },
  { cuisine: "양식/아시안", subTags: ["카레", "일본식카레"] },
  { cuisine: "일식", subTags: ["이자카야", "꼬치구이"] },
  { cuisine: "양식/아시안", subTags: ["브런치", "디저트"] },
];
const UMEDA_LODGING_NAMES = ["우메다 아트호텔", "우메다 스테이션호텔", "우메다 레지던스 스위트", "우메다 캡슐앤스파"];

// Splits a generated batch across trending/favorites (first `trendingCount`
// names go to trending) instead of dumping everything into favorites —
// otherwise drilling 지역별 down to a specific neighborhood/city can leave
// "Trending Now" with only the 1-2 hand-authored entries that happened to
// live there, well under a readable minimum. Two distinct id-prefix
// suffixes keep every id unique even though both slices share the same
// `names` array (and therefore the same starting index 0 for coordinate
// jitter, which is fine — it's just a visual spread, not a real position).
function pushGeneratedBatch(
  bundle: DiscoverBundle,
  idPrefix: string,
  names: string[],
  region: string,
  tag: PlaceCategoryTag,
  iconKey: SpotIconKey,
  baseLat: number,
  baseLng: number,
  savesStart: number,
  trendingCount: number,
  extras?: { cuisine?: CuisineTag; subTags?: string[] }[],
): void {
  const trendingNames = names.slice(0, trendingCount);
  const favoritesNames = names.slice(trendingCount);
  const trendingExtras = extras?.slice(0, trendingCount);
  const favoritesExtras = extras?.slice(trendingCount);
  bundle.trending.push(...generateSpots(`${idPrefix}-t`, trendingNames, region, tag, iconKey, baseLat, baseLng, savesStart, trendingExtras));
  bundle.favorites.push(
    ...generateSpots(`${idPrefix}-f`, favoritesNames, region, tag, iconKey, baseLat, baseLng, savesStart - trendingCount * 65, favoritesExtras),
  );
}

// 경주 관광지/음식점 already cluster around 황남동 (황리단길); 숙소 around
// 보문동 (the lake resort area) — reuses the same neighborhoods the
// hand-authored entries above already use, rather than inventing new ones.
pushGeneratedBatch(DOMESTIC, "d-gj-attr", GYEONGJU_ATTRACTION_NAMES, "경주 · 황남동", "관광지", "landmark", 35.8356, 129.2115, 2200, 4);
pushGeneratedBatch(DOMESTIC, "d-gj-food", GYEONGJU_FOOD_NAMES, "경주 · 황남동", "음식점", "utensils", 35.8342, 129.211, 1600, 4, GYEONGJU_FOOD_EXTRAS);
pushGeneratedBatch(DOMESTIC, "d-gj-stay", GYEONGJU_LODGING_NAMES, "경주 · 보문동", "숙소", "hotel", 35.8395, 129.269, 1100, 4);
pushGeneratedBatch(OVERSEAS, "o-osk-attr", OSAKA_ATTRACTION_NAMES, "일본 · 오사카", "관광지", "landmark", 34.68, 135.505, 3200, 4);
pushGeneratedBatch(OVERSEAS, "o-osk-food", OSAKA_FOOD_NAMES, "일본 · 오사카", "음식점", "utensils", 34.671, 135.503, 2400, 4, OSAKA_FOOD_EXTRAS);
pushGeneratedBatch(OVERSEAS, "o-osk-stay", OSAKA_LODGING_NAMES, "일본 · 오사카", "숙소", "hotel", 34.669, 135.501, 1800, 4);
pushGeneratedBatch(OVERSEAS, "o-umd-food", UMEDA_FOOD_NAMES, "일본 · 오사카", "음식점", "utensils", 34.7025, 135.4959, 2000, 4, UMEDA_FOOD_EXTRAS);
pushGeneratedBatch(OVERSEAS, "o-umd-stay", UMEDA_LODGING_NAMES, "일본 · 오사카", "숙소", "hotel", 34.7038, 135.4935, 1400, 2);

// ── global expansion: 유럽(영국/프랑스), 미주(미국/캐나다) — previously
// every overseas spot was in 아시아 (일본/베트남), so 지역별 only ever
// had one continent to drill into. A small real seed per country is
// enough to populate the tree; matchesRegionPath's country-level fallback
// (in the API route) covers any city under these that has no data yet. ──
OVERSEAS.favorites.push(
  { id: "o-uk1", name: "빅벤 & 웨스트민스터", region: "영국 · 런던", tag: "관광지", season: "spring", saves: 4200, gradient: "from-indigo-400 to-purple-300", iconKey: "landmark", lat: 51.4994, lng: -0.1245, color: "#818cf8" },
  { id: "o-uk2", name: "버킹엄 궁전", region: "영국 · 런던", tag: "관광지", season: "summer", saves: 3800, gradient: "from-rose-400 to-pink-300", iconKey: "landmark", lat: 51.5014, lng: -0.1419, color: "#fb7185" },
  { id: "o-uk3", name: "캄든마켓 피시앤칩스", region: "영국 · 런던", tag: "음식점", season: "fall", saves: 2100, gradient: "from-amber-400 to-orange-300", iconKey: "utensils", lat: 51.5416, lng: -0.1465, color: "#fbbf24", cuisine: "양식/아시안", subTags: ["피시앤칩스", "스트리트푸드"] },
  { id: "o-fr1", name: "에펠탑", region: "프랑스 · 파리", tag: "관광지", season: "spring", saves: 9200, gradient: "from-sky-400 to-blue-300", iconKey: "landmark", lat: 48.8584, lng: 2.2945, color: "#38bdf8" },
  { id: "o-fr2", name: "루브르 박물관", region: "프랑스 · 파리", tag: "박물관", season: "winter", saves: 7100, gradient: "from-violet-400 to-fuchsia-300", iconKey: "building", lat: 48.8606, lng: 2.3376, color: "#a78bfa" },
  { id: "o-fr3", name: "몽마르뜨 크레페거리", region: "프랑스 · 파리", tag: "음식점", season: "fall", saves: 2600, gradient: "from-rose-400 to-orange-300", iconKey: "utensils", lat: 48.8867, lng: 2.3431, color: "#fb7185", cuisine: "양식/아시안", subTags: ["크레페", "디저트"] },
  { id: "o-us1", name: "타임스퀘어", region: "미국 · 뉴욕", tag: "관광지", season: "winter", saves: 8600, gradient: "from-red-400 to-orange-300", iconKey: "landmark", lat: 40.758, lng: -73.9855, color: "#f87171" },
  { id: "o-us2", name: "센트럴파크", region: "미국 · 뉴욕", tag: "자연", season: "fall", saves: 6900, gradient: "from-lime-400 to-green-300", iconKey: "waves", lat: 40.7829, lng: -73.9654, color: "#a3e635" },
  { id: "o-us3", name: "브루클린 피자거리", region: "미국 · 뉴욕", tag: "음식점", season: "summer", saves: 3300, gradient: "from-orange-400 to-red-300", iconKey: "utensils", lat: 40.7081, lng: -73.9571, color: "#fb923c", cuisine: "양식/아시안", subTags: ["피자", "뉴욕스타일"] },
  { id: "o-ca1", name: "스탠리파크", region: "캐나다 · 밴쿠버", tag: "자연", season: "summer", saves: 4100, gradient: "from-emerald-400 to-teal-300", iconKey: "waves", lat: 49.3017, lng: -123.1417, color: "#34d399" },
  { id: "o-ca2", name: "그랜빌아일랜드 마켓", region: "캐나다 · 밴쿠버", tag: "음식점", season: "spring", saves: 2400, gradient: "from-amber-400 to-yellow-300", iconKey: "utensils", lat: 49.2714, lng: -123.1341, color: "#fbbf24", cuisine: "양식/아시안", subTags: ["마켓", "브런치"] },
);

// ── further global expansion: 아시아(태국·방콕, 대만·타이베이), 유럽
// (이탈리아·로마, 스페인·바르셀로나), 미주(미국·샌프란시스코) — same
// small-real-seed approach as the UK/France/US/Canada batch above. ──
OVERSEAS.favorites.push(
  { id: "o-th1", name: "왓 아룬 (새벽사원)", region: "태국 · 방콕", tag: "관광지", season: "winter", saves: 5100, gradient: "from-orange-400 to-amber-300", iconKey: "landmark", lat: 13.7437, lng: 100.4888, color: "#fb923c" },
  { id: "o-th2", name: "짜뚜짝 주말시장", region: "태국 · 방콕", tag: "쇼핑", season: "fall", saves: 3400, gradient: "from-emerald-400 to-lime-300", iconKey: "pin", lat: 13.7997, lng: 100.5502, color: "#4ade80" },
  { id: "o-th3", name: "카오산로드 팟타이거리", region: "태국 · 방콕", tag: "음식점", season: "summer", saves: 4600, gradient: "from-red-400 to-orange-300", iconKey: "utensils", lat: 13.7589, lng: 100.4977, color: "#f87171", cuisine: "양식/아시안", subTags: ["팟타이", "스트리트푸드"] },
  { id: "o-tw1", name: "타이베이 101", region: "대만 · 타이베이", tag: "관광지", season: "spring", saves: 6200, gradient: "from-sky-400 to-indigo-300", iconKey: "landmark", lat: 25.0340, lng: 121.5645, color: "#38bdf8" },
  { id: "o-tw2", name: "스펀 천등축제", region: "대만 · 타이베이", tag: "관광지", season: "winter", saves: 3900, gradient: "from-amber-400 to-yellow-300", iconKey: "camera", lat: 25.0731, lng: 121.7699, color: "#fbbf24" },
  { id: "o-tw3", name: "스린 야시장 소룽바오", region: "대만 · 타이베이", tag: "음식점", season: "fall", saves: 4800, gradient: "from-rose-400 to-red-300", iconKey: "utensils", lat: 25.0879, lng: 121.5241, color: "#fb7185", cuisine: "일식", subTags: ["딤섬", "소룽바오", "야시장"] },
  { id: "o-it1", name: "콜로세움", region: "이탈리아 · 로마", tag: "관광지", season: "spring", saves: 8100, gradient: "from-amber-400 to-orange-300", iconKey: "landmark", lat: 41.8902, lng: 12.4922, color: "#fbbf24" },
  { id: "o-it2", name: "트레비 분수", region: "이탈리아 · 로마", tag: "관광지", season: "summer", saves: 6700, gradient: "from-sky-400 to-blue-300", iconKey: "waves", lat: 41.9009, lng: 12.4833, color: "#38bdf8" },
  { id: "o-it3", name: "트라스테베레 트라토리아", region: "이탈리아 · 로마", tag: "음식점", season: "fall", saves: 3600, gradient: "from-red-400 to-rose-300", iconKey: "utensils", lat: 41.8896, lng: 12.4696, color: "#f87171", cuisine: "양식/아시안", subTags: ["파스타", "피자"] },
  { id: "o-es1", name: "사그라다 파밀리아", region: "스페인 · 바르셀로나", tag: "관광지", season: "spring", saves: 7400, gradient: "from-violet-400 to-purple-300", iconKey: "landmark", lat: 41.4036, lng: 2.1744, color: "#a78bfa" },
  { id: "o-es2", name: "구엘 공원", region: "스페인 · 바르셀로나", tag: "자연", season: "summer", saves: 5200, gradient: "from-emerald-400 to-teal-300", iconKey: "waves", lat: 41.4145, lng: 2.1527, color: "#34d399" },
  { id: "o-es3", name: "보케리아 시장 타파스", region: "스페인 · 바르셀로나", tag: "음식점", season: "fall", saves: 4100, gradient: "from-orange-400 to-red-300", iconKey: "utensils", lat: 41.3819, lng: 2.1716, color: "#fb923c", cuisine: "양식/아시안", subTags: ["타파스", "시장음식"] },
  { id: "o-us4", name: "금문교", region: "미국 · 샌프란시스코", tag: "관광지", season: "fall", saves: 7900, gradient: "from-red-400 to-orange-300", iconKey: "landmark", lat: 37.8199, lng: -122.4783, color: "#f87171" },
  { id: "o-us5", name: "피셔맨스 워프", region: "미국 · 샌프란시스코", tag: "관광지", season: "summer", saves: 5300, gradient: "from-sky-400 to-cyan-300", iconKey: "camera", lat: 37.808, lng: -122.4177, color: "#38bdf8" },
  { id: "o-us6", name: "클램차우더 소서딜리토", region: "미국 · 샌프란시스코", tag: "음식점", season: "winter", saves: 3100, gradient: "from-amber-400 to-orange-300", iconKey: "utensils", lat: 37.8087, lng: -122.4098, color: "#fbbf24", cuisine: "양식/아시안", subTags: ["클램차우더", "해산물"] },
);

// ── city-depth pass: every overseas country above had exactly ONE seeded
// city, so drilling 지역별 into 베트남/태국/영국/… showed a single lonely
// chip. This block adds 2-3 real cities per country (each with a small
// 관광지/음식점/숙소 spread) so the country→도시 level actually branches.
// Driven by a config array + pushGeneratedBatch rather than hand-typing
// each spot, same approach as the 오사카/경주 volume pass above. ──
interface CitySeed {
  /** Unique-across-file id stem, e.g. "o-vn-dn" — batch suffixes (-attr/-food/-stay) keep every generated id distinct. */
  idPrefix: string;
  /** "국가 · 도시", matching the COUNTRY_CONTINENT keys so the region tree picks it up automatically. */
  region: string;
  lat: number;
  lng: number;
  attractions: string[];
  foods: { name: string; cuisine: CuisineTag; subTags: string[] }[];
  lodgings: string[];
}

const CITY_SEEDS: CitySeed[] = [
  // ── 아시아 ──
  {
    idPrefix: "o-vn-dn", region: "베트남 · 다낭", lat: 16.0544, lng: 108.2022,
    attractions: ["미케 비치", "바나힐 골든브릿지", "오행산 마블마운틴", "다낭 대성당", "손트라 반도 전망대"],
    foods: [
      { name: "반미프엉 다낭", cuisine: "양식/아시안", subTags: ["반미", "베트남샌드위치"] },
      { name: "미꽝 1A", cuisine: "양식/아시안", subTags: ["미꽝", "쌀국수"] },
      { name: "분짜까 109", cuisine: "양식/아시안", subTags: ["분짜", "쌀국수"] },
      { name: "하이산 베맨 해산물", cuisine: "양식/아시안", subTags: ["해산물", "씨푸드"] },
      { name: "콩카페 다낭", cuisine: "카페/디저트", subTags: ["코코넛커피", "카페"] },
    ],
    lodgings: ["다낭 미케비치 리조트", "프리미어 빌리지 다낭", "다낭 하이안 리버사이드 호텔"],
  },
  {
    idPrefix: "o-vn-hcm", region: "베트남 · 호치민", lat: 10.7769, lng: 106.7009,
    attractions: ["통일궁", "노트르담 대성당", "벤탄시장", "사이공 중앙우체국", "부이비엔 워킹스트리트"],
    foods: [
      { name: "포호아 파스퇴르", cuisine: "양식/아시안", subTags: ["쌀국수", "포"] },
      { name: "냐항 응온", cuisine: "양식/아시안", subTags: ["베트남가정식", "로컬푸드"] },
      { name: "반쎄오 46A", cuisine: "양식/아시안", subTags: ["반쎄오", "베트남부침개"] },
      { name: "콩카페 호치민", cuisine: "카페/디저트", subTags: ["코코넛커피", "카페"] },
      { name: "사이공 스트리트푸드", cuisine: "양식/아시안", subTags: ["길거리음식", "로컬푸드"] },
    ],
    lodgings: ["렉스 호텔 사이공", "호치민 리버티센트럴", "사이공 백패커스 호스텔"],
  },
  {
    idPrefix: "o-th-cm", region: "태국 · 치앙마이", lat: 18.7883, lng: 98.9853,
    attractions: ["도이수텝 사원", "님만해민 거리", "올드시티 성곽", "치앙마이 선데이마켓", "왓 체디루앙"],
    foods: [
      { name: "카오소이 매사이", cuisine: "양식/아시안", subTags: ["카오소이", "커리국수"] },
      { name: "님만 카페거리", cuisine: "카페/디저트", subTags: ["카페", "디저트"] },
      { name: "치앙마이 나이트바자 푸드코트", cuisine: "양식/아시안", subTags: ["야시장", "길거리음식"] },
      { name: "반타이 타이쿠킹", cuisine: "양식/아시안", subTags: ["태국요리", "팟타이"] },
      { name: "통 카페 치앙마이", cuisine: "카페/디저트", subTags: ["카페", "브런치"] },
    ],
    lodgings: ["치앙마이 님만 부티크", "올드시티 게스트하우스", "핑리버 리조트"],
  },
  {
    idPrefix: "o-th-pk", region: "태국 · 푸켓", lat: 7.8804, lng: 98.3923,
    attractions: ["파통 비치", "빅붓다 푸켓", "프롬텝 케이프", "푸켓 올드타운", "카타 비치"],
    foods: [
      { name: "라야 레스토랑", cuisine: "양식/아시안", subTags: ["태국요리", "커리"] },
      { name: "푸켓 시푸드마켓", cuisine: "양식/아시안", subTags: ["해산물", "씨푸드"] },
      { name: "카오만까이 코분", cuisine: "양식/아시안", subTags: ["카오만까이", "치킨라이스"] },
      { name: "파통 나이트푸드", cuisine: "양식/아시안", subTags: ["야시장", "길거리음식"] },
      { name: "반림파 타이", cuisine: "양식/아시안", subTags: ["태국요리", "로컬푸드"] },
    ],
    lodgings: ["파통비치 리조트", "푸켓 카타 호텔", "올드타운 부티크스테이"],
  },
  {
    idPrefix: "o-tw-ks", region: "대만 · 가오슝", lat: 22.6273, lng: 120.3014,
    attractions: ["롄츠탄 연지담", "보얼 예술특구", "시즈완 반달만", "포광산 불광사", "류허 야시장"],
    foods: [
      { name: "류허야시장 굴전", cuisine: "양식/아시안", subTags: ["굴전", "야시장"] },
      { name: "가오슝 우육면 노포", cuisine: "양식/아시안", subTags: ["우육면", "소고기국수"] },
      { name: "단수이 아게이", cuisine: "양식/아시안", subTags: ["아게이", "로컬푸드"] },
      { name: "리우허 버블티", cuisine: "카페/디저트", subTags: ["버블티", "밀크티"] },
      { name: "가오슝 딤섬관", cuisine: "양식/아시안", subTags: ["딤섬", "만두"] },
    ],
    lodgings: ["가오슝 85빌딩 호텔", "시즈완 게스트하우스", "롄츠탄 리조트"],
  },
  {
    idPrefix: "o-tw-tc", region: "대만 · 타이중", lat: 24.1477, lng: 120.6736,
    attractions: ["무지개마을", "가오메이 습지", "국립자연과학박물관", "이중제 야시장", "친미 마을"],
    foods: [
      { name: "이중제 닭날개밥", cuisine: "양식/아시안", subTags: ["닭날개밥", "로컬푸드"] },
      { name: "타이중 태양병 본점", cuisine: "카페/디저트", subTags: ["태양병", "베이커리"] },
      { name: "펑자야시장 스낵", cuisine: "양식/아시안", subTags: ["야시장", "길거리음식"] },
      { name: "미야하라 아이스크림", cuisine: "카페/디저트", subTags: ["아이스크림", "디저트"] },
      { name: "타이중 우육면", cuisine: "양식/아시안", subTags: ["우육면", "소고기국수"] },
    ],
    lodgings: ["타이중 펑자 호텔", "국립극장 부티크스테이", "가오메이 리조트"],
  },
  // ── 유럽 ──
  {
    idPrefix: "o-uk-ed", region: "영국 · 에든버러", lat: 55.9533, lng: -3.1883,
    attractions: ["에든버러성", "로열마일", "아서스시트", "칼튼힐", "홀리루드 궁전"],
    foods: [
      { name: "에든버러 피시앤칩스", cuisine: "양식/아시안", subTags: ["피시앤칩스", "영국음식"] },
      { name: "그라스마켓 펍", cuisine: "양식/아시안", subTags: ["펍", "영국음식"] },
      { name: "로열마일 스코티시 다이닝", cuisine: "양식/아시안", subTags: ["스코틀랜드요리", "하기스"] },
      { name: "스톡브릿지 브런치", cuisine: "카페/디저트", subTags: ["브런치", "카페"] },
      { name: "에든버러 하기스 전문점", cuisine: "양식/아시안", subTags: ["하기스", "전통요리"] },
    ],
    lodgings: ["로열마일 부티크호텔", "에든버러 올드타운 인", "프린세스스트리트 호텔"],
  },
  {
    idPrefix: "o-uk-mc", region: "영국 · 맨체스터", lat: 53.4808, lng: -2.2426,
    attractions: ["올드트래포드 스타디움", "맨체스터 대성당", "노던쿼터", "과학산업박물관", "캐슬필드"],
    foods: [
      { name: "노던쿼터 브런치", cuisine: "카페/디저트", subTags: ["브런치", "카페"] },
      { name: "커리마일 인도요리", cuisine: "양식/아시안", subTags: ["인도요리", "커리"] },
      { name: "맨체스터 피시앤칩스", cuisine: "양식/아시안", subTags: ["피시앤칩스", "영국음식"] },
      { name: "스피니필즈 스테이크하우스", cuisine: "양식/아시안", subTags: ["스테이크", "그릴"] },
      { name: "차이나타운 딤섬", cuisine: "양식/아시안", subTags: ["딤섬", "중식"] },
    ],
    lodgings: ["맨체스터 시티센터 호텔", "노던쿼터 부티크", "스피니필즈 레지던스"],
  },
  {
    idPrefix: "o-fr-ni", region: "프랑스 · 니스", lat: 43.7102, lng: 7.2620,
    attractions: ["프롬나드 데 장글레", "니스 구시가지", "마세나 광장", "카스텔 언덕 전망대", "살레야 시장"],
    foods: [
      { name: "니스 살라드 니수아즈", cuisine: "양식/아시안", subTags: ["샐러드", "프랑스요리"] },
      { name: "소카 전문점 셰테레사", cuisine: "양식/아시안", subTags: ["소카", "니스음식"] },
      { name: "비외니스 트라토리아", cuisine: "양식/아시안", subTags: ["파스타", "지중해요리"] },
      { name: "코트다쥐르 해산물", cuisine: "양식/아시안", subTags: ["해산물", "씨푸드"] },
      { name: "니스 젤라또 페니키아", cuisine: "카페/디저트", subTags: ["젤라또", "디저트"] },
    ],
    lodgings: ["프롬나드 오션뷰 호텔", "니스 구시가지 게스트하우스", "마세나 부티크스테이"],
  },
  {
    idPrefix: "o-fr-ly", region: "프랑스 · 리옹", lat: 45.7640, lng: 4.8357,
    attractions: ["푸르비에르 대성당", "리옹 구시가지", "벨쿠르 광장", "뤼미에르 박물관", "테트도르 공원"],
    foods: [
      { name: "리옹 부숑 전통식당", cuisine: "양식/아시안", subTags: ["부숑", "프랑스요리"] },
      { name: "레알 드 리옹 미식시장", cuisine: "양식/아시안", subTags: ["미식시장", "프랑스요리"] },
      { name: "벨쿠르 비스트로", cuisine: "양식/아시안", subTags: ["비스트로", "프랑스요리"] },
      { name: "리옹 프랄린 타르트", cuisine: "카페/디저트", subTags: ["타르트", "디저트"] },
      { name: "손강변 카페", cuisine: "카페/디저트", subTags: ["카페", "브런치"] },
    ],
    lodgings: ["벨쿠르 그랜드호텔", "리옹 구시가지 인", "테트도르 레지던스"],
  },
  {
    idPrefix: "o-it-ve", region: "이탈리아 · 베네치아", lat: 45.4408, lng: 12.3155,
    attractions: ["산마르코 광장", "리알토 다리", "두칼레 궁전", "부라노섬", "곤돌라 선착장"],
    foods: [
      { name: "베네치아 치케티 바", cuisine: "양식/아시안", subTags: ["치케티", "타파스"] },
      { name: "리알토 시푸드", cuisine: "양식/아시안", subTags: ["해산물", "씨푸드"] },
      { name: "산마르코 젤라또", cuisine: "카페/디저트", subTags: ["젤라또", "디저트"] },
      { name: "부라노 트라토리아", cuisine: "양식/아시안", subTags: ["파스타", "이탈리아요리"] },
      { name: "베네치아 리조또 하우스", cuisine: "양식/아시안", subTags: ["리조또", "이탈리아요리"] },
    ],
    lodgings: ["산마르코 운하뷰 호텔", "리알토 부티크", "베네치아 팔라초 스테이"],
  },
  {
    idPrefix: "o-it-fi", region: "이탈리아 · 피렌체", lat: 43.7696, lng: 11.2558,
    attractions: ["두오모 대성당", "우피치 미술관", "폰테베키오", "미켈란젤로 광장", "피티 궁전"],
    foods: [
      { name: "피렌체 비스테카 스테이크", cuisine: "양식/아시안", subTags: ["비스테카", "스테이크"] },
      { name: "중앙시장 람프레도토", cuisine: "양식/아시안", subTags: ["람프레도토", "로컬푸드"] },
      { name: "피렌체 젤라또 비볼리", cuisine: "카페/디저트", subTags: ["젤라또", "디저트"] },
      { name: "트라토리아 마리오", cuisine: "양식/아시안", subTags: ["파스타", "이탈리아요리"] },
      { name: "오르트라르노 와인바", cuisine: "양식/아시안", subTags: ["와인바", "이탈리아요리"] },
    ],
    lodgings: ["두오모뷰 부티크호텔", "피렌체 중앙시장 인", "아르노강변 레지던스"],
  },
  {
    idPrefix: "o-es-md", region: "스페인 · 마드리드", lat: 40.4168, lng: -3.7038,
    attractions: ["프라도 미술관", "마요르 광장", "레티로 공원", "마드리드 왕궁", "그란비아"],
    foods: [
      { name: "마드리드 추로스 초콜라테리아", cuisine: "카페/디저트", subTags: ["추로스", "디저트"] },
      { name: "산미겔 시장 타파스", cuisine: "양식/아시안", subTags: ["타파스", "시장음식"] },
      { name: "소브리노 데 보틴", cuisine: "양식/아시안", subTags: ["코치니요", "스페인요리"] },
      { name: "마드리드 하몽 바", cuisine: "양식/아시안", subTags: ["하몽", "타파스"] },
      { name: "라티나 파에야", cuisine: "양식/아시안", subTags: ["파에야", "스페인요리"] },
    ],
    lodgings: ["그란비아 호텔", "마요르광장 부티크", "레티로 레지던스"],
  },
  {
    idPrefix: "o-es-sv", region: "스페인 · 세비야", lat: 37.3891, lng: -5.9845,
    attractions: ["세비야 대성당", "스페인 광장", "알카사르 궁전", "히랄다 탑", "트리아나 거리"],
    foods: [
      { name: "세비야 타파스 바", cuisine: "양식/아시안", subTags: ["타파스", "스페인요리"] },
      { name: "트리아나 해산물", cuisine: "양식/아시안", subTags: ["해산물", "씨푸드"] },
      { name: "세비야 플라멩코 디너", cuisine: "양식/아시안", subTags: ["플라멩코", "디너쇼"] },
      { name: "산타크루즈 비스트로", cuisine: "양식/아시안", subTags: ["비스트로", "스페인요리"] },
      { name: "세비야 살모레호", cuisine: "양식/아시안", subTags: ["살모레호", "스페인수프"] },
    ],
    lodgings: ["산타크루즈 부티크호텔", "세비야 대성당뷰 인", "트리아나 게스트하우스"],
  },
  // ── 미주 ──
  {
    idPrefix: "o-us-la", region: "미국 · 로스앤젤레스", lat: 34.0522, lng: -118.2437,
    attractions: ["할리우드 사인", "산타모니카 피어", "그리피스 천문대", "게티 센터", "베니스 비치"],
    foods: [
      { name: "인앤아웃 버거", cuisine: "양식/아시안", subTags: ["버거", "패스트푸드"] },
      { name: "그랜드센트럴 마켓", cuisine: "양식/아시안", subTags: ["푸드마켓", "다양한음식"] },
      { name: "코리아타운 BBQ", cuisine: "한식", subTags: ["코리안BBQ", "고기구이"] },
      { name: "산타모니카 시푸드", cuisine: "양식/아시안", subTags: ["해산물", "씨푸드"] },
      { name: "LA 타코트럭", cuisine: "양식/아시안", subTags: ["타코", "멕시칸"] },
    ],
    lodgings: ["할리우드 부티크호텔", "산타모니카 오션뷰", "다운타운 LA 레지던스"],
  },
  {
    idPrefix: "o-us-lv", region: "미국 · 라스베이거스", lat: 36.1699, lng: -115.1398,
    attractions: ["벨라지오 분수", "라스베이거스 스트립", "프리몬트 스트리트", "하이롤러 대관람차", "레드록 캐년"],
    foods: [
      { name: "벨라지오 뷔페", cuisine: "양식/아시안", subTags: ["뷔페", "다양한음식"] },
      { name: "고든램지 헬스키친", cuisine: "양식/아시안", subTags: ["파인다이닝", "스테이크"] },
      { name: "라스베이거스 스테이크하우스", cuisine: "양식/아시안", subTags: ["스테이크", "그릴"] },
      { name: "프리몬트 푸드코트", cuisine: "양식/아시안", subTags: ["푸드코트", "다양한음식"] },
      { name: "스트립 브런치 카페", cuisine: "카페/디저트", subTags: ["브런치", "카페"] },
    ],
    lodgings: ["벨라지오 리조트", "라스베이거스 스트립호텔", "프리몬트 카지노호텔"],
  },
  {
    idPrefix: "o-ca-to", region: "캐나다 · 토론토", lat: 43.6532, lng: -79.3832,
    attractions: ["CN 타워", "토론토 아일랜드", "로열 온타리오 박물관", "켄싱턴 마켓", "디스틸러리 디스트릭트"],
    foods: [
      { name: "세인트로렌스 마켓", cuisine: "양식/아시안", subTags: ["푸드마켓", "로컬푸드"] },
      { name: "토론토 랍스터 시푸드", cuisine: "양식/아시안", subTags: ["해산물", "씨푸드"] },
      { name: "켄싱턴 타코", cuisine: "양식/아시안", subTags: ["타코", "멕시칸"] },
      { name: "차이나타운 딤섬 토론토", cuisine: "양식/아시안", subTags: ["딤섬", "중식"] },
      { name: "토론토 푸틴 하우스", cuisine: "양식/아시안", subTags: ["푸틴", "캐나다음식"] },
    ],
    lodgings: ["CN타워뷰 호텔", "켄싱턴 부티크", "토론토 하버프론트 레지던스"],
  },
  {
    idPrefix: "o-ca-mo", region: "캐나다 · 몬트리올", lat: 45.5017, lng: -73.5673,
    attractions: ["노트르담 대성당", "몽로얄 공원", "올드 몬트리올", "자크카르티에 광장", "몬트리올 구항구"],
    foods: [
      { name: "슈워츠 델리 스모크미트", cuisine: "양식/아시안", subTags: ["스모크미트", "델리"] },
      { name: "몬트리올 베이글 세인트비아투스", cuisine: "카페/디저트", subTags: ["베이글", "베이커리"] },
      { name: "올드몬트리올 비스트로", cuisine: "양식/아시안", subTags: ["비스트로", "프랑스요리"] },
      { name: "라방스 푸틴", cuisine: "양식/아시안", subTags: ["푸틴", "캐나다음식"] },
      { name: "장탈롱 시장", cuisine: "양식/아시안", subTags: ["푸드마켓", "로컬푸드"] },
    ],
    lodgings: ["올드몬트리올 부티크호텔", "몽로얄 게스트하우스", "구항구 레지던스"],
  },
];

// A few AI 추천 동선 for major new cities — routes carry only a city-level
// `region` (matched via routeMatchesRegionPath), so these surface whenever
// 지역별 is drilled into 방콕/파리/로마/뉴욕/다낭.
OVERSEAS.routes.push(
  {
    id: "o-r3", title: "방콕 하루 사원 & 야시장 코스", subtitle: "새벽사원부터 카오산로드 팟타이까지",
    region: "방콕", duration: "당일치기 · 4곳", gradient: "from-orange-500 to-amber-400",
    author: "방콕러버", likes: 2140, views: 18700,
    stops: [
      { time: "09:00", name: "왓 아룬 (새벽사원)", lat: 13.7437, lng: 100.4888 },
      { time: "12:00", name: "왓 포 사원", lat: 13.7465, lng: 100.4927 },
      { time: "15:00", name: "짜뚜짝 주말시장", lat: 13.7997, lng: 100.5502 },
      { time: "19:00", name: "카오산로드 팟타이거리", lat: 13.7589, lng: 100.4977 },
    ],
  },
  {
    id: "o-r4", title: "파리 로맨틱 랜드마크 코스", subtitle: "에펠탑부터 몽마르뜨 야경까지",
    region: "파리", duration: "당일치기 · 4곳", gradient: "from-sky-500 to-indigo-400",
    author: "파리지앵", likes: 3620, views: 31200,
    stops: [
      { time: "10:00", name: "에펠탑", lat: 48.8584, lng: 2.2945 },
      { time: "13:00", name: "루브르 박물관", lat: 48.8606, lng: 2.3376 },
      { time: "16:00", name: "노트르담 대성당", lat: 48.8530, lng: 2.3499 },
      { time: "19:00", name: "몽마르뜨 크레페거리", lat: 48.8867, lng: 2.3431 },
    ],
  },
  {
    id: "o-r5", title: "로마 역사 산책 코스", subtitle: "콜로세움부터 트레비 분수까지",
    region: "로마", duration: "당일치기 · 4곳", gradient: "from-amber-500 to-orange-400",
    author: "로마여행자", likes: 2980, views: 25400,
    stops: [
      { time: "09:30", name: "콜로세움", lat: 41.8902, lng: 12.4922 },
      { time: "12:00", name: "포로 로마노", lat: 41.8925, lng: 12.4853 },
      { time: "15:00", name: "트레비 분수", lat: 41.9009, lng: 12.4833 },
      { time: "18:00", name: "트라스테베레 트라토리아", lat: 41.8896, lng: 12.4696 },
    ],
  },
  {
    id: "o-r6", title: "뉴욕 맨해튼 하이라이트", subtitle: "센트럴파크부터 타임스퀘어 야경까지",
    region: "뉴욕", duration: "당일치기 · 4곳", gradient: "from-rose-500 to-red-400",
    author: "뉴요커", likes: 4100, views: 38800,
    stops: [
      { time: "10:00", name: "센트럴파크", lat: 40.7829, lng: -73.9654 },
      { time: "13:00", name: "브루클린 피자거리", lat: 40.7081, lng: -73.9571 },
      { time: "16:00", name: "타임스퀘어", lat: 40.758, lng: -73.9855 },
      { time: "19:00", name: "브루클린 브릿지 야경", lat: 40.7061, lng: -73.9969 },
    ],
  },
  {
    id: "o-r7", title: "다낭 자연 & 미케비치 코스", subtitle: "바나힐 골든브릿지부터 미케비치 선셋까지",
    region: "다낭", duration: "당일치기 · 4곳", gradient: "from-emerald-500 to-teal-400",
    author: "다낭홀릭", likes: 1870, views: 16300,
    stops: [
      { time: "09:00", name: "바나힐 골든브릿지", lat: 15.9955, lng: 107.9967 },
      { time: "13:00", name: "오행산 마블마운틴", lat: 16.0035, lng: 108.2637 },
      { time: "16:00", name: "다낭 대성당", lat: 16.0664, lng: 108.2233 },
      { time: "18:00", name: "미케 비치", lat: 16.0544, lng: 108.2470 },
    ],
  },
);

for (const city of CITY_SEEDS) {
  pushGeneratedBatch(OVERSEAS, `${city.idPrefix}-attr`, city.attractions, city.region, "관광지", "landmark", city.lat, city.lng, 3000, 2);
  pushGeneratedBatch(
    OVERSEAS,
    `${city.idPrefix}-food`,
    city.foods.map((f) => f.name),
    city.region,
    "음식점",
    "utensils",
    city.lat,
    city.lng,
    2600,
    2,
    city.foods.map((f) => ({ cuisine: f.cuisine, subTags: f.subTags })),
  );
  pushGeneratedBatch(OVERSEAS, `${city.idPrefix}-stay`, city.lodgings, city.region, "숙소", "hotel", city.lat, city.lng, 2000, 1);
}

// ── breadth pass: a world-city registry so every major country branches
// into a deep list of economically/touristically important cities, plus
// two brand-new countries (중국·독일·멕시코·브라질) and a new continent
// (오세아니아 — 호주·뉴질랜드). The hand-authored/CITY_SEEDS cities above
// carry real spot names; the long tail here is filled by a neutral
// template generator (no false specific claims — this file is explicitly
// curated placeholder content, see the header). Any city already seeded
// above is skipped so it keeps its authored spots. ──
type WorldCity = [country: string, city: string, lat: number, lng: number];
const WORLD_CITIES: WorldCity[] = [
  // 아시아 · 일본
  ["일본", "도쿄", 35.6762, 139.6503], ["일본", "교토", 35.0116, 135.7681], ["일본", "삿포로", 43.0618, 141.3545],
  ["일본", "나고야", 35.1815, 136.9066], ["일본", "요코하마", 35.4437, 139.638], ["일본", "고베", 34.6901, 135.1955],
  ["일본", "오키나와", 26.2124, 127.6809], ["일본", "유후인", 33.2668, 131.3717],
  // 아시아 · 베트남
  ["베트남", "호이안", 15.8801, 108.338], ["베트남", "냐짱", 12.2388, 109.1967], ["베트남", "푸꾸옥", 10.2899, 103.984],
  ["베트남", "달랏", 11.9404, 108.4583], ["베트남", "사파", 22.3364, 103.8438], ["베트남", "하이퐁", 20.8449, 106.6881],
  // 아시아 · 태국
  ["태국", "파타야", 12.9236, 100.8825], ["태국", "아유타야", 14.3532, 100.5689], ["태국", "코사무이", 9.512, 100.0136],
  ["태국", "끄라비", 8.0863, 98.9063], ["태국", "후아힌", 12.5684, 99.9577],
  // 아시아 · 대만
  ["대만", "타이난", 22.9999, 120.227], ["대만", "화롄", 23.9871, 121.6015], ["대만", "신베이", 25.0169, 121.4628],
  ["대만", "지룽", 25.1276, 121.7392],
  // 아시아 · 중국 (신규)
  ["중국", "베이징", 39.9042, 116.4074], ["중국", "상하이", 31.2304, 121.4737], ["중국", "광저우", 23.1291, 113.2644],
  ["중국", "선전", 22.5431, 114.0579], ["중국", "홍콩", 22.3193, 114.1694], ["중국", "마카오", 22.1987, 113.5439],
  ["중국", "청두", 30.5728, 104.0668], ["중국", "충칭", 29.563, 106.5516], ["중국", "시안", 34.3416, 108.9398],
  ["중국", "항저우", 30.2741, 120.1551], ["중국", "칭다오", 36.0671, 120.3826],
  // 유럽 · 영국
  ["영국", "버밍엄", 52.4862, -1.8904], ["영국", "리버풀", 53.4084, -2.9916], ["영국", "글래스고", 55.8642, -4.2518],
  ["영국", "옥스퍼드", 51.752, -1.2577], ["영국", "캠브리지", 52.2053, 0.1218], ["영국", "브리스틀", 51.4545, -2.5879],
  // 유럽 · 프랑스
  ["프랑스", "마르세유", 43.2965, 5.3698], ["프랑스", "보르도", 44.8378, -0.5792], ["프랑스", "스트라스부르", 48.5734, 7.7521],
  ["프랑스", "툴루즈", 43.6047, 1.4442], ["프랑스", "칸", 43.5528, 7.0174], ["프랑스", "릴", 50.6292, 3.0573],
  // 유럽 · 이탈리아
  ["이탈리아", "밀라노", 45.4642, 9.19], ["이탈리아", "나폴리", 40.8518, 14.2681], ["이탈리아", "토리노", 45.0703, 7.6869],
  ["이탈리아", "제노바", 44.4056, 8.9463], ["이탈리아", "팔레르모", 38.1157, 13.3615], ["이탈리아", "볼로냐", 44.4949, 11.3426],
  // 유럽 · 스페인
  ["스페인", "발렌시아", 39.4699, -0.3763], ["스페인", "빌바오", 43.263, -2.935], ["스페인", "그라나다", 37.1773, -3.5986],
  ["스페인", "말라가", 36.7213, -4.4214], ["스페인", "사라고사", 41.6488, -0.8891],
  // 유럽 · 독일 (신규)
  ["독일", "베를린", 52.52, 13.405], ["독일", "뮌헨", 48.1351, 11.582], ["독일", "프랑크푸르트", 50.1109, 8.6821],
  ["독일", "함부르크", 53.5511, 9.9937], ["독일", "쾰른", 50.9375, 6.9603], ["독일", "슈투트가르트", 48.7758, 9.1829],
  ["독일", "뒤셀도르프", 51.2277, 6.7735], ["독일", "드레스덴", 51.0504, 13.7373],
  // 미주 · 미국
  ["미국", "시카고", 41.8781, -87.6298], ["미국", "마이애미", 25.7617, -80.1918], ["미국", "워싱턴 D.C.", 38.9072, -77.0369],
  ["미국", "보스턴", 42.3601, -71.0589], ["미국", "시애틀", 47.6062, -122.3321], ["미국", "휴스턴", 29.7604, -95.3698],
  ["미국", "댈러스", 32.7767, -96.797], ["미국", "호놀룰루", 21.3069, -157.8583],
  // 미주 · 캐나다
  ["캐나다", "캘거리", 51.0447, -114.0719], ["캐나다", "오타와", 45.4215, -75.6972], ["캐나다", "퀘벡시티", 46.8139, -71.208],
  ["캐나다", "에드먼턴", 53.5461, -113.4938], ["캐나다", "빅토리아", 48.4284, -123.3656], ["캐나다", "핼리팩스", 44.6488, -63.5752],
  // 미주 · 멕시코 (신규)
  ["멕시코", "멕시코시티", 19.4326, -99.1332], ["멕시코", "칸쿤", 21.1619, -86.8515], ["멕시코", "몬테레이", 25.6866, -100.3161],
  ["멕시코", "과달라하라", 20.6597, -103.3496], ["멕시코", "메리다", 20.9674, -89.5926], ["멕시코", "푸에블라", 19.0414, -98.2063],
  // 미주 · 브라질 (신규)
  ["브라질", "상파울루", -23.5505, -46.6333], ["브라질", "리우데자네이루", -22.9068, -43.1729], ["브라질", "브라질리아", -15.8267, -47.9218],
  ["브라질", "사우바도르", -12.9777, -38.5016], ["브라질", "포르탈레자", -3.7319, -38.5267], ["브라질", "벨루오리존치", -19.9167, -43.9345],
  // 오세아니아 · 호주 (신규)
  ["호주", "시드니", -33.8688, 151.2093], ["호주", "멜버른", -37.8136, 144.9631], ["호주", "브리즈번", -27.4698, 153.0251],
  ["호주", "퍼스", -31.9505, 115.8605], ["호주", "골드코스트", -28.0167, 153.4], ["호주", "애들레이드", -34.9285, 138.6007],
  ["호주", "캔버라", -35.2809, 149.13], ["호주", "호바트", -42.8821, 147.3272], ["호주", "다윈", -12.4634, 130.8456],
  // 오세아니아 · 뉴질랜드 (신규)
  ["뉴질랜드", "오클랜드", -36.8485, 174.7633], ["뉴질랜드", "웰링턴", -41.2865, 174.7762], ["뉴질랜드", "크라이스트처치", -43.5321, 172.6362],
  ["뉴질랜드", "퀸즈타운", -45.0312, 168.6626], ["뉴질랜드", "로터루아", -38.1368, 176.2497], ["뉴질랜드", "해밀턴", -37.787, 175.2793],
  ["뉴질랜드", "더니든", -45.8788, 170.5028],
  // 아프리카 (신규 대륙)
  ["이집트", "카이로", 30.0444, 31.2357], ["이집트", "룩소르", 25.6872, 32.6396], ["이집트", "후르가다", 27.2579, 33.8116],
  ["모로코", "마라케시", 31.6295, -7.9811], ["모로코", "카사블랑카", 33.5731, -7.5898], ["모로코", "셰프샤우엔", 35.1688, -5.2636],
  ["남아프리카공화국", "케이프타운", -33.9249, 18.4241], ["남아프리카공화국", "요하네스버그", -26.2041, 28.0473],
  ["케냐", "나이로비", -1.2921, 36.8219], ["케냐", "몸바사", -4.0435, 39.6682],
  // 남미 보강 (신규 국가)
  ["아르헨티나", "부에노스아이레스", -34.6037, -58.3816], ["아르헨티나", "멘도사", -32.8895, -68.8458],
  ["페루", "리마", -12.0464, -77.0428], ["페루", "쿠스코", -13.5319, -71.9675],
];

// Neutral, no-false-claim name suffixes — combined with the city name to
// produce browsable placeholder spots (e.g. "베를린 구시가지 산책로").
const GEN_ATTR_SUFFIXES = ["랜드마크 전망대", "구시가지 산책로", "리버사이드 워크", "센트럴 광장", "시립 미술관", "시티 파크", "아트 스트리트", "하버뷰 포인트", "대표 재래시장", "야경 명소"];
const GEN_FOOD_SUFFIXES: { suffix: string; cuisine: CuisineTag; subTags: string[] }[] = [
  { suffix: "로컬 다이닝", cuisine: "양식/아시안", subTags: ["로컬푸드", "현지음식"] },
  { suffix: "시푸드 하우스", cuisine: "양식/아시안", subTags: ["해산물", "씨푸드"] },
  { suffix: "미식 골목", cuisine: "양식/아시안", subTags: ["맛집거리", "현지음식"] },
  { suffix: "나이트 푸드마켓", cuisine: "양식/아시안", subTags: ["야시장", "길거리음식"] },
  { suffix: "브런치 카페", cuisine: "카페/디저트", subTags: ["브런치", "카페"] },
  { suffix: "전통 레스토랑", cuisine: "양식/아시안", subTags: ["전통요리", "현지음식"] },
  { suffix: "스트리트 푸드코트", cuisine: "양식/아시안", subTags: ["푸드코트", "다양한음식"] },
  { suffix: "디저트 카페", cuisine: "카페/디저트", subTags: ["디저트", "카페"] },
];
const GEN_STAY_SUFFIXES = ["센트럴 호텔", "부티크 스테이", "게스트하우스", "리버뷰 레지던스", "다운타운 호스텔"];

/** Rotates `arr` by `offset` and takes the first `n` items — different cities pick different suffixes so the list doesn't read identically everywhere. */
function rotatePick<T>(arr: T[], offset: number, n: number): T[] {
  const start = offset % arr.length;
  return Array.from({ length: n }, (_, i) => arr[(start + i) % arr.length]);
}

const seededRegions = new Set([...OVERSEAS.trending, ...OVERSEAS.favorites].map((s) => s.region));
WORLD_CITIES.forEach(([country, city, lat, lng], idx) => {
  const region = `${country} · ${city}`;
  if (seededRegions.has(region)) return; // keep hand-authored cities' real spots
  const off = [...city].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const prefix = `o-gen${idx}`;
  const attrNames = rotatePick(GEN_ATTR_SUFFIXES, off, 5).map((s) => `${city} ${s}`);
  const foods = rotatePick(GEN_FOOD_SUFFIXES, off, 5);
  const stayNames = rotatePick(GEN_STAY_SUFFIXES, off, 3).map((s) => `${city} ${s}`);
  pushGeneratedBatch(OVERSEAS, `${prefix}-attr`, attrNames, region, "관광지", "landmark", lat, lng, 2800, 2);
  pushGeneratedBatch(
    OVERSEAS,
    `${prefix}-food`,
    foods.map((f) => `${city} ${f.suffix}`),
    region,
    "음식점",
    "utensils",
    lat,
    lng,
    2400,
    2,
    foods.map((f) => ({ cuisine: f.cuisine, subTags: f.subTags })),
  );
  pushGeneratedBatch(OVERSEAS, `${prefix}-stay`, stayNames, region, "숙소", "hotel", lat, lng, 1900, 1);
});

// ── domestic breadth pass: the overseas registry above grew 해외 to 1,800+
// spots, but 국내 was still only 제주2/서울4/부산2/경주46 — drilling 지역별
// into almost any Korean region showed 1-2 lonely cards or the coming-soon
// fallback. Same template-generator approach, one entry per canonical
// 시/군/구 (regions.ts): metro 동네 keep the "시도 · 동네" format the
// existing data uses; 도-cities use their bare label ("강릉"). ──
type DomesticCitySeed = [region: string, lat: number, lng: number];
const DOMESTIC_CITY_SEEDS: DomesticCitySeed[] = [
  // 서울 (구/동네)
  ["서울 · 종로", 37.573, 126.9794], ["서울 · 성수", 37.5445, 127.0557], ["서울 · 강남", 37.4979, 127.0276],
  ["서울 · 홍대", 37.5563, 126.922], ["서울 · 명동", 37.5636, 126.983], ["서울 · 잠실", 37.5133, 127.1001],
  ["서울 · 이태원", 37.5347, 126.9945],
  // 부산
  ["부산 · 해운대", 35.1587, 129.1604], ["부산 · 광안리", 35.1532, 129.1187], ["부산 · 남포동", 35.0988, 129.0304],
  ["부산 · 사하", 35.0983, 128.977], ["부산 · 기장", 35.2446, 129.2222],
  // 인천
  ["인천 · 송도", 37.3825, 126.6567], ["인천 · 월미도", 37.4753, 126.5972], ["인천 · 강화", 37.7468, 126.4878],
  ["인천 · 영종도", 37.4933, 126.5386],
  // 제주
  ["제주 · 제주시", 33.4996, 126.5312], ["제주 · 서귀포", 33.2541, 126.5601], ["제주 · 애월", 33.4623, 126.3096],
  ["제주 · 성산", 33.4586, 126.9425], ["제주 · 중문", 33.2496, 126.412], ["제주 · 한림", 33.4108, 126.2691],
  // 경기
  ["수원", 37.2636, 127.0286], ["용인", 37.2411, 127.1776], ["가평", 37.8315, 127.5105],
  ["파주", 37.7599, 126.78], ["포천", 37.8949, 127.2003], ["양평", 37.4914, 127.4874],
  // 강원
  ["강릉", 37.7519, 128.8761], ["속초", 38.207, 128.5918], ["춘천", 37.8813, 127.7298],
  ["평창", 37.3705, 128.3897], ["양양", 38.0754, 128.6191], ["정선", 37.3806, 128.6608], ["동해", 37.5247, 129.1143],
  // 충청
  ["대전", 36.3504, 127.3845], ["청주", 36.6424, 127.489], ["공주", 36.4465, 127.119],
  ["단양", 36.9845, 128.3655], ["보령", 36.3331, 126.6129], ["태안", 36.7456, 126.2978], ["천안", 36.8151, 127.1139],
  // 전라
  ["광주", 35.1595, 126.8526], ["전주", 35.8242, 127.148], ["여수", 34.7604, 127.6622],
  ["순천", 34.9507, 127.4872], ["목포", 34.8118, 126.3922], ["군산", 35.9678, 126.7369], ["담양", 35.3211, 126.988],
  // 경상 (경주는 위에 실명 데이터가 이미 풍부해서 제외)
  ["대구", 35.8714, 128.6014], ["울산", 35.5384, 129.3114], ["통영", 34.8544, 128.4331],
  ["거제", 34.8806, 128.6211], ["진주", 35.18, 128.1076], ["김해", 35.2285, 128.8894],
  ["남해", 34.8376, 127.8924], ["안동", 36.5684, 128.7294], ["포항", 36.019, 129.3435],
  ["문경", 36.5866, 128.1867], ["울릉", 37.4844, 130.9058],
];

const DOM_ATTR_SUFFIXES = ["대표 전망대", "구시가지 산책길", "중앙시장", "시립 미술관", "시민공원", "문화의 거리", "야경 명소", "핫플 골목", "전통 한옥길", "레트로 골목"];
const DOM_FOOD_SUFFIXES: { suffix: string; cuisine: CuisineTag; subTags: string[] }[] = [
  { suffix: "로컬 맛집", cuisine: "한식", subTags: ["로컬맛집", "현지음식"] },
  { suffix: "전통시장 먹거리", cuisine: "한식", subTags: ["시장", "길거리음식"] },
  { suffix: "노포 국밥집", cuisine: "한식", subTags: ["국밥", "노포"] },
  { suffix: "감성 브런치 카페", cuisine: "카페/디저트", subTags: ["브런치", "카페"] },
  { suffix: "디저트 카페", cuisine: "카페/디저트", subTags: ["디저트", "카페"] },
  { suffix: "한우 구이집", cuisine: "한식", subTags: ["한우", "구이"] },
  { suffix: "분식 골목", cuisine: "한식", subTags: ["분식", "길거리음식"] },
  { suffix: "해물 맛집", cuisine: "한식", subTags: ["해산물", "회"] },
];
const DOM_STAY_SUFFIXES = ["시티 호텔", "게스트하우스", "한옥스테이", "리버뷰 펜션", "부티크 스테이"];

DOMESTIC_CITY_SEEDS.forEach(([region, lat, lng], idx) => {
  const label = region.split(" · ").pop()!;
  const off = [...label].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const prefix = `d-gen${idx}`;
  const attrNames = rotatePick(DOM_ATTR_SUFFIXES, off, 4).map((s) => `${label} ${s}`);
  const foods = rotatePick(DOM_FOOD_SUFFIXES, off, 4);
  const stayNames = rotatePick(DOM_STAY_SUFFIXES, off, 2).map((s) => `${label} ${s}`);
  pushGeneratedBatch(DOMESTIC, `${prefix}-attr`, attrNames, region, "관광지", "landmark", lat, lng, 2600, 2);
  pushGeneratedBatch(
    DOMESTIC,
    `${prefix}-food`,
    foods.map((f) => `${label} ${f.suffix}`),
    region,
    "음식점",
    "utensils",
    lat,
    lng,
    2200,
    1,
    foods.map((f) => ({ cuisine: f.cuisine, subTags: f.subTags })),
  );
  pushGeneratedBatch(DOMESTIC, `${prefix}-stay`, stayNames, region, "숙소", "hotel", lat, lng, 1700, 1);
});

export const DISCOVER_DATA: Record<DiscoverScope, DiscoverBundle> = {
  domestic: DOMESTIC,
  overseas: OVERSEAS,
};

// ── hand-authored 음식점 spots from earlier rounds predate cuisine/subTags
// — backfilled here by id instead of editing each literal above, so the
// large existing object literals stay untouched. ──
const FOOD_METADATA: Record<string, { cuisine: CuisineTag; subTags: string[] }> = {
  "d-f3": { cuisine: "한식", subTags: ["전통시장", "길거리음식"] }, // 광장시장 먹자골목
  "d-f8": { cuisine: "한식", subTags: ["한정식", "전통음식"] }, // 교촌마을 한옥 맛집
  "d-f9": { cuisine: "일식", subTags: ["라멘", "돈코츠라멘"] }, // 황리단길 라멘하우스
  "d-f10": { cuisine: "일식", subTags: ["야키니쿠", "숯불구이"] }, // 경주 야키니쿠 스미비
  "d-f11": { cuisine: "카페/디저트", subTags: ["황남빵", "베이커리"] }, // 황남빵 본점
  "o-f2": { cuisine: "일식", subTags: ["라멘", "돈코츠라멘"] }, // 이치란 라멘 본점
  "o-f5": { cuisine: "일식", subTags: ["다코야키", "길거리음식"] }, // 도톤보리 타코야키 왕골목
  "o-f6": { cuisine: "일식", subTags: ["야키니쿠", "규카쿠"] }, // 신사이바시 야키니쿠 규카쿠
  "o-f7": { cuisine: "일식", subTags: ["라멘", "라멘스트리트"] }, // 우메다 라멘 스트리트
  "o-f8": { cuisine: "일식", subTags: ["스시", "시장회", "라멘"] }, // 쿠로몬 시장 스시
};
for (const spot of [...DOMESTIC.trending, ...DOMESTIC.favorites, ...OVERSEAS.trending, ...OVERSEAS.favorites]) {
  const meta = FOOD_METADATA[spot.id];
  if (meta) {
    spot.cuisine = meta.cuisine;
    spot.subTags = meta.subTags;
  }
  // No rating/reviewCount backfill here on purpose — this file is curated
  // placeholder content, not a real Places API response, so there's no
  // genuine rating to attach. An earlier version of this file fabricated
  // one from each spot's `saves` count, which looked exactly like a real
  // Google rating and reviewCount without being one; `rating`/`reviewCount`
  // stay unset here and only ever come from a genuine API response (see
  // /discover's "실시간 검색 결과" section, sourced from
  // /api/places/search's real google/kakao results).
}

/** All spots in a scope's trending + favorites lists, deduped by id. */
export function allSpots(scope: DiscoverScope): DiscoverSpot[] {
  const bundle = DISCOVER_DATA[scope];
  return [...bundle.trending, ...bundle.favorites];
}

/**
 * 지역별 드릴-down hierarchy. `region` is already formatted as "국가 ·
 * 도시" (overseas, e.g. "일본 · 오사카") or "시도 · 동네" (domestic, e.g.
 * "제주 · 애월") everywhere in this file, so the tree is derived from that
 * string rather than adding a parallel field to every spot. Overseas gets
 * a real 3-level 대륙→국가→도시 tree across 아시아/유럽/미주; domestic
 * stops at 2 levels (시도→동네) since "대륙/국가" doesn't mean anything
 * within Korea.
 */
const COUNTRY_CONTINENT: Record<string, string> = {
  일본: "아시아",
  베트남: "아시아",
  태국: "아시아",
  대만: "아시아",
  중국: "아시아",
  영국: "유럽",
  프랑스: "유럽",
  이탈리아: "유럽",
  스페인: "유럽",
  독일: "유럽",
  이집트: "아프리카",
  모로코: "아프리카",
  남아프리카공화국: "아프리카",
  케냐: "아프리카",
  미국: "북미",
  캐나다: "북미",
  멕시코: "북미",
  브라질: "남미",
  아르헨티나: "남미",
  페루: "남미",
  호주: "오세아니아",
  뉴질랜드: "오세아니아",
};

export interface RegionNode {
  label: string;
  children: RegionNode[];
}

export function regionHierarchy(scope: DiscoverScope): RegionNode[] {
  const spots = allSpots(scope);
  if (scope === "overseas") {
    const tree = new Map<string, Map<string, Set<string>>>();
    for (const s of spots) {
      const [country, city] = s.region.split(" · ");
      const continent = COUNTRY_CONTINENT[country] ?? "기타";
      if (!tree.has(continent)) tree.set(continent, new Map());
      const countries = tree.get(continent)!;
      if (!countries.has(country)) countries.set(country, new Set());
      if (city) countries.get(country)!.add(city);
    }
    // Fixed canonical continent order (아시아→유럽→아프리카→북미→남미→오세아니아)
    // instead of data-insertion order, so the drill-down reads like an atlas.
    const ordered = [...CONTINENT_ORDER.filter((c) => tree.has(c)), ...Array.from(tree.keys()).filter((c) => !CONTINENT_ORDER.includes(c))];
    return ordered.map((continent) => ({
      label: continent,
      children: Array.from(tree.get(continent)!.entries()).map(([country, cities]) => ({
        label: country,
        children: Array.from(cities).map((city) => ({ label: city, children: [] })),
      })),
    }));
  }
  // 국내: 광역(도/특별시) → 시/군 → 동. The canonical 8도+광역시 skeleton
  // (regions.ts) is always shown; data-derived 동네 leaves merge into it.
  // A 시도 label with a SIDO_PROVINCE parent (e.g. 경주→경상북도) nests one
  // level deeper than a metro city (서울 · 종로 stays 2-level).
  const canonical = new Map<string, Map<string, Set<string>>>();
  for (const prov of DOMESTIC_CANONICAL) {
    canonical.set(prov.label, new Map(prov.children.map((c) => [c, new Set<string>()])));
  }
  for (const s of spots) {
    const [sido, neighborhood] = s.region.split(" · ");
    const province = SIDO_PROVINCE[sido] ?? sido;
    if (!canonical.has(province)) canonical.set(province, new Map());
    const level2 = canonical.get(province)!;
    if (province === sido) {
      // metro: 동네 is the level-2 entry itself
      if (neighborhood) {
        if (!level2.has(neighborhood)) level2.set(neighborhood, new Set());
      }
    } else {
      // 도: 시/군 at level 2, 동 at level 3
      if (!level2.has(sido)) level2.set(sido, new Set());
      if (neighborhood) level2.get(sido)!.add(neighborhood);
    }
  }
  return Array.from(canonical.entries()).map(([province, level2]) => ({
    label: province,
    children: Array.from(level2.entries()).map(([city, dongs]) => ({
      label: city,
      children: Array.from(dongs).map((d) => ({ label: d, children: [] })),
    })),
  }));
}

/**
 * `path` is up to 3 labels deep, most-general first — [continent, country,
 * city] for overseas, [광역, 시/군, 동] for domestic (metro cities like 서울
 * have their 동네 at level 2). Every non-empty segment must match; an empty
 * path matches everything.
 */
export function matchesRegionPath(spot: DiscoverSpot, scope: DiscoverScope, path: string[]): boolean {
  if (path.length === 0) return true;
  const [a, b] = spot.region.split(" · ");
  if (scope === "overseas") {
    const continent = COUNTRY_CONTINENT[a] ?? "기타";
    if (path[0] && continent !== path[0]) return false;
    if (path[1] && a !== path[1]) return false;
    if (path[2] && b !== path[2]) return false;
    return true;
  }
  const province = SIDO_PROVINCE[a] ?? a;
  if (province === a) {
    // metro (서울 · 종로): [서울, 종로]
    if (path[0] && a !== path[0]) return false;
    if (path[1] && b !== path[1]) return false;
    return true;
  }
  // 도 소속 (경주 · 황남동): [경상북도, 경주, 황남동]
  if (path[0] && province !== path[0]) return false;
  if (path[1] && a !== path[1]) return false;
  if (path[2] && b !== path[2]) return false;
  return true;
}

/**
 * Same drill-down filter as `matchesRegionPath`, but for a `DiscoverRoute`
 * — routes only carry a single simplified `region` label (a 시도 name like
 * "경주" for domestic, or a city name like "오사카" for overseas) rather
 * than the "a · b" pair spots use, so it can't reuse that function as-is.
 * The route's label is resolved back up its hierarchy (도 for domestic,
 * country/continent for overseas) so a broader selection still matches it.
 */
export function routeMatchesRegionPath(route: DiscoverRoute, scope: DiscoverScope, path: string[]): boolean {
  if (path.length === 0) return true;
  if (scope === "domestic") {
    const province = SIDO_PROVINCE[route.region] ?? route.region;
    if (path[0] && path[0] !== province) return false;
    if (path[1] && province !== route.region && path[1] !== route.region) return false;
    return true;
  }
  for (const continentNode of regionHierarchy(scope)) {
    for (const countryNode of continentNode.children) {
      if (!countryNode.children.some((c) => c.label === route.region)) continue;
      if (path[0] && continentNode.label !== path[0]) return false;
      if (path[1] && countryNode.label !== path[1]) return false;
      if (path[2] && route.region !== path[2]) return false;
      return true;
    }
  }
  return false;
}

/**
 * Splits a free-text query into lowercase tokens on whitespace. Used
 * instead of one contiguous-substring check so multi-word queries like
 * "경주 황남동" still match a region formatted as "경주 · 황남동" — the
 * literal two-word string never appears verbatim (there's a " · " in the
 * way), but each token independently does, which is how a real search
 * box reads as "AND of these words" rather than "this exact phrase".
 */
function queryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Free-text match over a spot's name/region/tag/cuisine/subTags — every
 * token must appear somewhere (AND, not one exact phrase). subTags is
 * what lets a dish-specific query like "오사카 라멘" surface every
 * ramen-adjacent place, not just ones with "라멘" literally in the name.
 */
export function spotMatches(spot: DiscoverSpot, query: string): boolean {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return false;
  const haystack = `${spot.name} ${spot.region} ${spot.tag} ${spot.cuisine ?? ""} ${(spot.subTags ?? []).join(" ")}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

/** Free-text match over a route's title/region/subtitle/stop names — same AND-of-tokens rule as spotMatches. */
export function routeMatches(route: DiscoverRoute, query: string): boolean {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return false;
  const haystack = `${route.title} ${route.region} ${route.subtitle} ${route.stops.map((s) => s.name).join(" ")}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

/**
 * Keywords that express *intent* ("I want food/lodging/etc") rather than
 * being part of a place's actual name/region — e.g. "경주 밥집" means
 * "show me 경주, and specifically 음식점". Matched longest-first so a
 * longer, more specific keyword (게스트하우스) is recognized before a
 * shorter one that happens to be a substring of it.
 */
const INTENT_KEYWORDS: { keyword: string; tag: PlaceCategoryTag }[] = [
  { keyword: "게스트하우스", tag: "숙소" },
  { keyword: "에어비앤비", tag: "숙소" },
  { keyword: "테마파크", tag: "테마파크" },
  { keyword: "놀이공원", tag: "테마파크" },
  { keyword: "이자카야", tag: "술집" },
  { keyword: "관광지", tag: "관광지" },
  { keyword: "박물관", tag: "박물관" },
  { keyword: "음식점", tag: "음식점" },
  { keyword: "레스토랑", tag: "음식점" },
  { keyword: "숙소", tag: "숙소" },
  { keyword: "호텔", tag: "숙소" },
  { keyword: "맛집", tag: "음식점" },
  { keyword: "밥집", tag: "음식점" },
  { keyword: "술집", tag: "술집" },
  { keyword: "카페", tag: "카페" },
  { keyword: "커피", tag: "카페" },
  { keyword: "명소", tag: "관광지" },
  { keyword: "쇼핑", tag: "쇼핑" },
];
INTENT_KEYWORDS.sort((a, b) => b.keyword.length - a.keyword.length);

/**
 * Specific dish/menu words — unlike INTENT_KEYWORDS these don't get
 * stripped out of the query (they're also useful as an actual subTags
 * match term: "오사카 라멘" should still narrow results to ramen places,
 * not just "오사카" broadly), but they signal food intent just as
 * strongly as an explicit "맛집"/"음식점" suffix would.
 */
const FOOD_DISH_KEYWORDS = [
  "라멘",
  "스시",
  "초밥",
  "야키니쿠",
  "오코노미야키",
  "다코야키",
  "규카츠",
  "쿠시카츠",
  "돈카츠",
  "우동",
  "한우",
  "갈비",
  "갈비탕",
  "냉면",
  "밀면",
  "국밥",
  "파스타",
  "브런치",
  "디저트",
  "케이크",
  "피자",
];

/**
 * Pure proximity filler words ("근처", "인근", ...) — this app has no real
 * geo-radius search, so "우메다 근처 맛집" is handled identically to
 * "우메다 맛집": these carry no category meaning (unlike INTENT_KEYWORDS)
 * and, left in, would break the AND-of-tokens match entirely, since no
 * spot's name/region ever literally contains the word "근처".
 */
const LOCALITY_FILLER_WORDS = ["근처", "인근", "주변", "가까운", "근방"];

export interface ParsedSearchQuery {
  /** The query with any recognized intent keyword removed — this is what actually gets matched against names/regions. Empty if the query was *only* the intent keyword (e.g. just "맛집" with no city). */
  coreQuery: string;
  /** The category the query implies, if any — the search UI auto-activates this as the results' filter chip. */
  intentTag: PlaceCategoryTag | null;
}

/**
 * Strips a trailing/embedded intent keyword ("맛집", "숙소", "호텔", ...)
 * out of a raw search query, so "경주 밥집" is handled as "search 경주,
 * and the user wants 음식점" instead of failing to match anything because
 * no place's name or region literally contains the word "밥집". A query
 * with no explicit intent suffix but a recognizable dish name ("오사카
 * 라멘") is treated the same way — 음식점 intent, dish word kept in the
 * core query since it's also a real subTags match term. Locality filler
 * words ("우메다 근처 맛집") are dropped first, before any of that.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  let trimmed = raw.trim();
  for (const filler of LOCALITY_FILLER_WORDS) {
    trimmed = trimmed.split(filler).join(" ").replace(/\s+/g, " ").trim();
  }
  for (const { keyword, tag } of INTENT_KEYWORDS) {
    if (trimmed.includes(keyword)) {
      const core = trimmed.split(keyword).join(" ").replace(/\s+/g, " ").trim();
      return { coreQuery: core, intentTag: tag };
    }
  }
  const tokens = queryTokens(trimmed);
  if (tokens.some((t) => FOOD_DISH_KEYWORDS.includes(t))) {
    return { coreQuery: trimmed, intentTag: "음식점" };
  }
  return { coreQuery: trimmed, intentTag: null };
}
