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
export type SpotIconKey = "coffee" | "camera" | "waves" | "landmark" | "utensils" | "pin" | "tent" | "wine" | "building";

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

export const DISCOVER_DATA: Record<DiscoverScope, DiscoverBundle> = {
  domestic: DOMESTIC,
  overseas: OVERSEAS,
};

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
 * a real 3-level 대륙→국가→도시 tree (every current country happens to be
 * in 아시아, but the structure holds for adding more); domestic stops at
 * 2 levels (시도→동네) since "대륙/국가" doesn't mean anything within Korea.
 */
const COUNTRY_CONTINENT: Record<string, string> = {
  일본: "아시아",
  베트남: "아시아",
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

/** Free-text match over a spot's name/region/tag. */
export function spotMatches(spot: DiscoverSpot, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    spot.name.toLowerCase().includes(q) ||
    spot.region.toLowerCase().includes(q) ||
    spot.tag.toLowerCase().includes(q)
  );
}

/** Free-text match over a route's title/region/subtitle/stop names. */
export function routeMatches(route: DiscoverRoute, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    route.title.toLowerCase().includes(q) ||
    route.region.toLowerCase().includes(q) ||
    route.subtitle.toLowerCase().includes(q) ||
    route.stops.some((s) => s.name.toLowerCase().includes(q))
  );
}
