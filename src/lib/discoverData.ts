/**
 * Curated /discover feed data — trending + all-time spots and community
 * route templates, branched by scope (국내/해외) the same way the planner's
 * trend list branches by region (see src/lib/mockPlacesDomestic.ts /
 * src/lib/server/getTrendingPlaces.ts). Served through /api/discover/trends
 * so the client always goes through a real API boundary instead of reading
 * a hardcoded object baked into the page bundle — a real deployment would
 * swap this module's contents for a DB-backed query, same as those.
 */

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
      subtitle: "텐진 도심부터 유후인 료칸까지",
      region: "후쿠오카",
      duration: "1박 2일 · 4곳",
      gradient: "from-violet-500 to-fuchsia-400",
      author: "규슈여행자",
      likes: 1930,
      views: 15600,
      stops: [
        { time: "09:00", name: "Tenjin Airbnb (숙소)", lat: 33.5904, lng: 130.3986 },
        { time: "11:00", name: "Clio Court (클리오 코트)", lat: 33.5895, lng: 130.4207 },
        { time: "15:00", name: "Yufuin Floral Village", lat: 33.2668, lng: 131.3717 },
        { time: "18:00", name: "Yufuin Ryokan", lat: 33.2646, lng: 131.3572 },
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
  // Google-Places-style rating/review count, backfilled for every spot
  // that doesn't already carry one — deterministic from `saves` (not
  // literally proportional, so it doesn't read as robotic) rather than
  // random, so the same spot always shows the same rating across requests.
  if (spot.rating == null) {
    const seed = (spot.saves % 97) / 97; // 0..~1 spread
    spot.rating = Math.round((4.2 + seed * 0.75) * 10) / 10;
    spot.reviewCount = Math.max(48, Math.round(spot.saves / 3));
  }
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
  영국: "유럽",
  프랑스: "유럽",
  이탈리아: "유럽",
  스페인: "유럽",
  미국: "미주",
  캐나다: "미주",
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
    return Array.from(tree.entries()).map(([continent, countries]) => ({
      label: continent,
      children: Array.from(countries.entries()).map(([country, cities]) => ({
        label: country,
        children: Array.from(cities).map((city) => ({ label: city, children: [] })),
      })),
    }));
  }
  const tree = new Map<string, Set<string>>();
  for (const s of spots) {
    const [region, neighborhood] = s.region.split(" · ");
    if (!tree.has(region)) tree.set(region, new Set());
    if (neighborhood) tree.get(region)!.add(neighborhood);
  }
  return Array.from(tree.entries()).map(([region, neighborhoods]) => ({
    label: region,
    children: Array.from(neighborhoods).map((n) => ({ label: n, children: [] })),
  }));
}

/**
 * `path` is up to 3 labels deep, most-general first — [continent, country,
 * city] for overseas, [region, neighborhood] for domestic. Every non-empty
 * segment must match; an empty path matches everything.
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
  if (path[0] && a !== path[0]) return false;
  if (path[1] && b !== path[1]) return false;
  return true;
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
