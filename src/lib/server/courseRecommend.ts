import { colorForId } from "@/lib/placeStyle";
import type { Place } from "@/lib/types";

/**
 * Shared building blocks for "AI 추천 동선" — the day-slot definitions,
 * live Google/Kakao candidate search, and the deterministic ranker. Used
 * by both the full-day assembly route (course/recommend) and the
 * single-slot reroll route (course/recommend/reroll) so a "다른 곳 추천"
 * on one stop reuses exactly the same search/ranking as the initial build.
 */

export interface RecommendSlot {
  key: string;
  label: string;
  keyword: string;
  hour: number;
  category?: "attraction" | "restaurant" | "lodging";
  /** Meal slots get a "점심"/"저녁" style marker in the course. */
  meal?: boolean;
}

export type CourseTheme = "balanced" | "foodie" | "healing" | "culture" | "active";

export const THEME_LABELS: Record<CourseTheme, string> = {
  balanced: "밸런스 (관광+맛집+야경 골고루)",
  foodie: "미식 위주",
  healing: "힐링·감성",
  culture: "역사·문화",
  active: "액티비티",
};

// 테마별 하루 골격. 슬롯 키워드가 도시명 뒤에 붙어 라이브 검색어가 된다
// ("강릉 감성 카페"). 어느 테마든 점심·저녁 식사 슬롯은 유지해 실용성을 지킴.
export const THEME_SLOTS: Record<CourseTheme, RecommendSlot[]> = {
  balanced: [
    { key: "am-sight", label: "오전 명소", keyword: "관광지", hour: 10, category: "attraction" },
    { key: "market", label: "시장·거리", keyword: "시장 거리", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심", keyword: "맛집", hour: 12, category: "restaurant", meal: true },
    { key: "pm-sight", label: "오후 명소", keyword: "가볼만한곳", hour: 14, category: "attraction" },
    { key: "cafe", label: "카페", keyword: "카페", hour: 16 },
    { key: "night", label: "야경 명소", keyword: "야경", hour: 19, category: "attraction" },
    { key: "dinner", label: "저녁", keyword: "맛집", hour: 20, category: "restaurant", meal: true },
  ],
  foodie: [
    { key: "brunch", label: "브런치", keyword: "브런치 카페", hour: 10, category: "restaurant", meal: true },
    { key: "market", label: "먹거리 시장", keyword: "전통시장 먹거리", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심 맛집", keyword: "맛집", hour: 13, category: "restaurant", meal: true },
    { key: "dessert", label: "디저트 카페", keyword: "디저트 카페", hour: 15 },
    { key: "pm-sight", label: "오후 명소", keyword: "가볼만한곳", hour: 16, category: "attraction" },
    { key: "dinner", label: "저녁 맛집", keyword: "맛집", hour: 19, category: "restaurant", meal: true },
    { key: "bar", label: "야식·술집", keyword: "술집 포차", hour: 21, category: "restaurant" },
  ],
  healing: [
    { key: "cafe-am", label: "감성 카페", keyword: "감성 카페", hour: 10 },
    { key: "park", label: "공원 산책", keyword: "공원 산책", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심", keyword: "브런치 맛집", hour: 13, category: "restaurant", meal: true },
    { key: "view", label: "전망 명소", keyword: "전망 좋은 곳", hour: 15, category: "attraction" },
    { key: "cafe-pm", label: "분위기 카페", keyword: "분위기 좋은 카페", hour: 16 },
    { key: "sunset", label: "노을 명소", keyword: "노을 명소", hour: 18, category: "attraction" },
    { key: "dinner", label: "저녁", keyword: "조용한 맛집", hour: 19, category: "restaurant", meal: true },
  ],
  culture: [
    { key: "palace", label: "고궁·유적", keyword: "고궁 유적", hour: 10, category: "attraction" },
    { key: "museum", label: "박물관·미술관", keyword: "박물관 미술관", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심", keyword: "맛집", hour: 13, category: "restaurant", meal: true },
    { key: "oldtown", label: "근대·한옥거리", keyword: "근대거리 한옥마을", hour: 15, category: "attraction" },
    { key: "gallery", label: "갤러리·전시", keyword: "갤러리 전시", hour: 16, category: "attraction" },
    { key: "night", label: "야경 명소", keyword: "야경 명소", hour: 19, category: "attraction" },
    { key: "dinner", label: "저녁", keyword: "전통 맛집", hour: 20, category: "restaurant", meal: true },
  ],
  active: [
    { key: "activity", label: "액티비티", keyword: "액티비티 체험", hour: 10, category: "attraction" },
    { key: "landmark", label: "랜드마크·전망대", keyword: "랜드마크 전망대", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심", keyword: "맛집", hour: 13, category: "restaurant", meal: true },
    { key: "outdoor", label: "야외 액티비티", keyword: "야외 액티비티", hour: 15, category: "attraction" },
    { key: "market", label: "거리·쇼핑", keyword: "거리 쇼핑", hour: 17, category: "attraction" },
    { key: "night", label: "야경 명소", keyword: "야경 명소", hour: 19, category: "attraction" },
    { key: "dinner", label: "저녁", keyword: "맛집", hour: 20, category: "restaurant", meal: true },
  ],
};

export function parseTheme(raw: string | null): CourseTheme {
  return raw && raw in THEME_SLOTS ? (raw as CourseTheme) : "balanced";
}

export function findSlot(theme: CourseTheme, slotKey: string): RecommendSlot | undefined {
  return THEME_SLOTS[theme].find((s) => s.key === slotKey);
}

const CATEGORY_TYPE: Record<string, string> = {
  attraction: "tourist_attraction",
  restaurant: "restaurant",
  lodging: "lodging",
};
const CATEGORY_LABEL: Record<string, string> = { attraction: "관광명소", restaurant: "맛집", lodging: "숙소" };

/** How many candidates per slot to keep — bounds LLM token cost and gives the deterministic ranker a few to vary among. */
export const POOL_SIZE = 6;

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  photos?: { name: string }[];
  googleMapsUri?: string;
}

/** rating weighted by log(review count) — favors well-reviewed AND well-rated places over a 5.0 with 3 reviews. */
function score(rating?: number, reviews?: number): number {
  if (rating == null) return 0;
  return rating * Math.log10((reviews ?? 0) + 10);
}

/** Haversine distance in km. */
function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Popularity minus a travel-distance penalty from a reference point — so
 * the course flows through the city instead of zig-zagging (a slightly
 * lower-rated café 500m away beats a top-rated one across town). ~0.35점 per
 * km, capped so a genuinely famous far-away spot can still win.
 */
export function proximityScore(rating: number | undefined, reviews: number | undefined, lat: number, lng: number, anchor: { lat: number; lng: number } | null): number {
  const base = score(rating, reviews);
  if (!anchor || !lat || !lng) return base;
  return base - Math.min(distKm(anchor.lat, anchor.lng, lat, lng) * 0.35, 4);
}

/** Same-shop duplicate guard: normalized-name prefix match (우오신/우오신 우메다점) so the course doesn't book the same brand twice. */
function normName(s: string): string {
  return s.toLowerCase().replace(/[（(【「][^）)】」]*[）)】」]/g, "").replace(/[\s·・,，.\-–—!！?？'"|｜/]/g, "");
}
export function sameShop(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  return na.startsWith(nb) || nb.startsWith(na);
}

async function googleTop(query: string, apiKey: string, includedType?: string): Promise<GooglePlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType,places.photos,places.googleMapsUri",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 8, languageCode: "ko", ...(includedType ? { includedType } : {}) }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  return data.places ?? [];
}

interface KakaoDoc {
  id: string;
  place_name: string;
  category_group_name?: string;
  road_address_name?: string;
  address_name?: string;
  x: string;
  y: string;
}
async function kakaoTop(query: string, apiKey: string): Promise<KakaoDoc[]> {
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=10`, {
    cache: "no-store",
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { documents?: KakaoDoc[] };
  return data.documents ?? [];
}

function googleToPlace(p: GooglePlace, fallbackCategory: string): Place {
  return {
    id: p.id,
    placeId: p.id,
    name: p.displayName?.text ?? "이름 미확인",
    category: p.primaryType ?? fallbackCategory,
    color: colorForId(p.id),
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    rating: p.rating,
    reviewCount: p.userRatingCount,
    address: p.formattedAddress,
    photoName: p.photos?.[0]?.name,
    googleMapsUri: p.googleMapsUri,
    icon: "pin",
  };
}

function kakaoToPlace(d: KakaoDoc, fallbackCategory: string): Place {
  return {
    id: d.id,
    placeId: d.id,
    name: d.place_name,
    category: d.category_group_name?.split(" > ").pop() || fallbackCategory,
    color: colorForId(d.id),
    lat: Number(d.y),
    lng: Number(d.x),
    address: d.road_address_name || d.address_name,
    icon: "pin",
  };
}

/** Live-searches one slot's candidate pool. Empty array when no API key is configured for the scope. */
export async function fetchSlotCandidates(scope: "overseas" | "domestic", city: string, slot: RecommendSlot): Promise<Place[]> {
  if (scope === "overseas") {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return [];
    const type = slot.category ? CATEGORY_TYPE[slot.category] : undefined;
    const label = slot.category ? CATEGORY_LABEL[slot.category] : "";
    const results = await googleTop(`${city} ${slot.keyword}${label ? " " + label : ""}`, apiKey, type);
    return results.map((p) => googleToPlace(p, slot.label)).slice(0, POOL_SIZE);
  }
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return [];
  const results = await kakaoTop(`${city} ${slot.keyword}`, apiKey);
  return results.map((d) => kakaoToPlace(d, slot.label)).slice(0, POOL_SIZE);
}

/** Best still-unused candidate for a slot, biased toward `anchor` (usually a neighboring stop); random among the top 3 so re-runs vary. */
export function pickDeterministic(candidates: Place[], excludeIds: Set<string>, excludeNames: string[], anchor: { lat: number; lng: number } | null): Place | undefined {
  const pool = candidates
    .filter((p) => !excludeIds.has(p.id) && !excludeNames.some((n) => sameShop(n, p.name)))
    .sort((a, b) => proximityScore(b.rating, b.reviewCount, b.lat, b.lng, anchor) - proximityScore(a.rating, a.reviewCount, a.lat, a.lng, anchor))
    .slice(0, 3);
  return pool[Math.floor(Math.random() * pool.length)];
}
