import { NextRequest, NextResponse } from "next/server";
import { colorForId } from "@/lib/placeStyle";
import type { Place } from "@/lib/types";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { curateCourseWithLlm, type CourseSlotCandidates } from "@/lib/server/courseLlm";

export const dynamic = "force-dynamic";

/**
 * "AI 추천 동선" — auto-assembles an ordered day course for a city, like
 * 경복궁 → 광장시장 → 점심 → 익선동 → 청계천 야경 → 저녁. The Places/Kakao
 * APIs have no route-planning endpoint, so this composes one from real
 * data: for each course slot it runs a live search and gathers a candidate
 * pool. Then:
 *  - If LLM_API_KEY is set, Claude curates the pools into a coherent day
 *    (picking + ordering + a one-line reason per stop) — see courseLlm.ts.
 *  - Otherwise a deterministic ranker picks the top place per slot by a
 *    rating×review score minus a travel-distance penalty from the previous
 *    stop (keeps the day walkable), varying the pick among the top few so
 *    re-running gives a different course.
 * Either way the result is a genuine, ranked itinerary of real places.
 *
 * A `theme` param reshapes the day (미식/힐링·감성/역사·문화/액티비티) so the
 * same city no longer always returns the identical 7-slot skeleton.
 */
interface RecommendSlot {
  key: string;
  label: string;
  keyword: string;
  hour: number;
  category?: "attraction" | "restaurant" | "lodging";
  /** Meal slots get a "점심"/"저녁" style marker in the course. */
  meal?: boolean;
}

type CourseTheme = "balanced" | "foodie" | "healing" | "culture" | "active";

const THEME_LABELS: Record<CourseTheme, string> = {
  balanced: "밸런스 (관광+맛집+야경 골고루)",
  foodie: "미식 위주",
  healing: "힐링·감성",
  culture: "역사·문화",
  active: "액티비티",
};

// 테마별 하루 골격. 슬롯 키워드가 도시명 뒤에 붙어 라이브 검색어가 된다
// ("강릉 감성 카페"). 어느 테마든 점심·저녁 식사 슬롯은 유지해 실용성을 지킴.
const THEME_SLOTS: Record<CourseTheme, RecommendSlot[]> = {
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

function parseTheme(raw: string | null): CourseTheme {
  return raw && raw in THEME_SLOTS ? (raw as CourseTheme) : "balanced";
}

const CATEGORY_TYPE: Record<string, string> = {
  attraction: "tourist_attraction",
  restaurant: "restaurant",
  lodging: "lodging",
};
const CATEGORY_LABEL: Record<string, string> = { attraction: "관광명소", restaurant: "맛집", lodging: "숙소" };

/** How many candidates per slot to keep — bounds LLM token cost and gives the deterministic ranker a few to vary among. */
const POOL_SIZE = 6;

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
 * Popularity minus a travel-distance penalty from the previous stop — so the
 * course flows through the city instead of zig-zagging (a slightly
 * lower-rated café 500m away beats a top-rated one across town). ~0.35점 per
 * km, capped so a genuinely famous far-away spot can still win.
 */
function proximityScore(rating: number | undefined, reviews: number | undefined, lat: number, lng: number, prev: { lat: number; lng: number } | null): number {
  const base = score(rating, reviews);
  if (!prev || !lat || !lng) return base;
  return base - Math.min(distKm(prev.lat, prev.lng, lat, lng) * 0.35, 4);
}

/** Same-shop duplicate guard: normalized-name prefix match (우오신/우오신 우메다점) so the course doesn't book the same brand twice. */
function normName(s: string): string {
  return s.toLowerCase().replace(/[（(【「][^）)】」]*[）)】」]/g, "").replace(/[\s·・,，.\-–—!！?？'"|｜/]/g, "");
}
function sameShop(a: string, b: string): boolean {
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

/** A candidate pool for one slot. */
interface SlotPool {
  slot: RecommendSlot;
  candidates: Place[];
}

/** The assembled course entry the client renders on the timeline. */
type FinalStop = Place & { slotLabel: string; hour: number; meal: boolean; reason?: string };

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

/** Best still-unused candidate for a slot, biased toward the running course's last stop; random among the top 3 so re-runs vary. */
function pickDeterministic(candidates: Place[], used: Set<string>, course: FinalStop[]): Place | undefined {
  const prev = course.length > 0 ? { lat: course[course.length - 1].lat, lng: course[course.length - 1].lng } : null;
  const pool = candidates
    .filter((p) => !used.has(p.id) && !course.some((c) => sameShop(c.name, p.name)))
    .sort((a, b) => proximityScore(b.rating, b.reviewCount, b.lat, b.lng, prev) - proximityScore(a.rating, a.reviewCount, a.lat, a.lng, prev))
    .slice(0, 3);
  return pool[Math.floor(Math.random() * pool.length)];
}

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const scope = request.nextUrl.searchParams.get("scope") === "domestic" ? "domestic" : "overseas";
  const city = (request.nextUrl.searchParams.get("city") ?? "").trim().slice(0, 40);
  const theme = parseTheme(request.nextUrl.searchParams.get("theme"));
  if (!city) return NextResponse.json({ error: "missing city" }, { status: 400 });

  const slots = THEME_SLOTS[theme];

  // ── 1. Gather a candidate pool per slot from live search. ──
  const pools: SlotPool[] = [];
  if (scope === "overseas") {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ course: [], source: "mock", theme });
    for (const slot of slots) {
      const type = slot.category ? CATEGORY_TYPE[slot.category] : undefined;
      const label = slot.category ? CATEGORY_LABEL[slot.category] : "";
      const results = await googleTop(`${city} ${slot.keyword}${label ? " " + label : ""}`, apiKey, type);
      pools.push({ slot, candidates: results.map((p) => googleToPlace(p, slot.label)).slice(0, POOL_SIZE) });
    }
  } else {
    const apiKey = process.env.KAKAO_REST_API_KEY;
    if (!apiKey) return NextResponse.json({ course: [], source: "mock", theme });
    for (const slot of slots) {
      const results = await kakaoTop(`${city} ${slot.keyword}`, apiKey);
      pools.push({ slot, candidates: results.map((d) => kakaoToPlace(d, slot.label)).slice(0, POOL_SIZE) });
    }
  }

  // ── 2. Optional LLM curation over the pools (null → deterministic). ──
  const llmSlots: CourseSlotCandidates[] = pools.map(({ slot, candidates }) => ({
    slotKey: slot.key,
    slotLabel: slot.label,
    candidates: candidates.map((c) => ({ id: c.id, name: c.name, rating: c.rating, reviews: c.reviewCount, category: c.category })),
  }));
  const llmPicks = await curateCourseWithLlm(city, THEME_LABELS[theme], llmSlots);

  // ── 3. Assemble the day. Prefer the LLM's pick per slot; fall back to the
  //       deterministic ranker for any slot the LLM skipped or that collided
  //       with an already-used place. ──
  const used = new Set<string>();
  const course: FinalStop[] = [];
  for (const { slot, candidates } of pools) {
    const llmPick = llmPicks?.find((p) => p.slotKey === slot.key);
    let chosen: Place | undefined;
    if (llmPick) {
      const c = candidates.find((cand) => cand.id === llmPick.id);
      if (c && !used.has(c.id) && !course.some((s) => sameShop(s.name, c.name))) chosen = c;
    }
    if (!chosen) chosen = pickDeterministic(candidates, used, course);
    if (!chosen) continue;
    used.add(chosen.id);
    course.push({
      ...chosen,
      slotLabel: slot.label,
      hour: slot.hour,
      meal: Boolean(slot.meal),
      ...(llmPick?.reason ? { reason: llmPick.reason } : {}),
    });
  }

  const source = llmPicks ? "llm" : scope === "overseas" ? "google" : "kakao";
  return NextResponse.json({ course, source, theme });
});
