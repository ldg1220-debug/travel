import { NextRequest, NextResponse } from "next/server";
import { colorForId } from "@/lib/placeStyle";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * "AI 추천 동선" — auto-assembles an ordered day course for a city, like
 * 경복궁 → 광장시장 → 점심 → 익선동 → 청계천 야경 → 저녁. The Places/Kakao
 * APIs have no route-planning endpoint, so this composes one from real
 * data: for each course slot it runs a live search, picks the top place
 * by a rating×review score (skipping any already used), and stamps it with
 * the slot's schedule hour. The result is a genuine, ranked itinerary of
 * real places — deterministic and free, no LLM call required. If an
 * LLM_API_KEY is later configured this route is the natural place to swap
 * in a model for the ordering/selection; the response shape wouldn't
 * change.
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

// A fuller day than the manual builder's 5 slots — two sightseeing stops
// bracketing lunch, an afternoon spot + café, then a night view + dinner.
const RECOMMEND_SLOTS: RecommendSlot[] = [
  { key: "am-sight", label: "오전 명소", keyword: "관광지", hour: 10, category: "attraction" },
  { key: "market", label: "시장·거리", keyword: "시장 거리", hour: 11, category: "attraction" },
  { key: "lunch", label: "점심", keyword: "맛집", hour: 12, category: "restaurant", meal: true },
  { key: "pm-sight", label: "오후 명소", keyword: "가볼만한곳", hour: 14, category: "attraction" },
  { key: "cafe", label: "카페", keyword: "카페", hour: 16 },
  { key: "night", label: "야경 명소", keyword: "야경", hour: 19, category: "attraction" },
  { key: "dinner", label: "저녁", keyword: "맛집", hour: 20, category: "restaurant", meal: true },
];

const CATEGORY_TYPE: Record<string, string> = {
  attraction: "tourist_attraction",
  restaurant: "restaurant",
  lodging: "lodging",
};
const CATEGORY_LABEL: Record<string, string> = { attraction: "관광명소", restaurant: "맛집", lodging: "숙소" };

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

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope") === "domestic" ? "domestic" : "overseas";
  const city = (request.nextUrl.searchParams.get("city") ?? "").trim().slice(0, 40);
  if (!city) return NextResponse.json({ error: "missing city" }, { status: 400 });

  const used = new Set<string>();
  const course: (Place & { slotLabel: string; hour: number; meal: boolean })[] = [];

  if (scope === "overseas") {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ course: [], source: "mock" });
    for (const slot of RECOMMEND_SLOTS) {
      const type = slot.category ? CATEGORY_TYPE[slot.category] : undefined;
      const label = slot.category ? CATEGORY_LABEL[slot.category] : "";
      const results = await googleTop(`${city} ${slot.keyword}${label ? " " + label : ""}`, apiKey, type);
      // Popularity + proximity to the previous stop (keeps the day walkable),
      // skipping ids already used AND same-brand duplicates by name.
      const prev = course.length > 0 ? { lat: course[course.length - 1].lat, lng: course[course.length - 1].lng } : null;
      // Picking strictly the #1-ranked candidate every time made "AI 추천
      // 동선" return the exact same course for the same city on every
      // request — a random pick among the top few keeps quality (still
      // ranked candidates only) while actually varying run to run.
      const topPool = results
        .filter((p) => !used.has(p.id) && !course.some((c) => sameShop(c.name, p.displayName?.text ?? "")))
        .sort(
          (a, b) =>
            proximityScore(b.rating, b.userRatingCount, b.location?.latitude ?? 0, b.location?.longitude ?? 0, prev) -
            proximityScore(a.rating, a.userRatingCount, a.location?.latitude ?? 0, a.location?.longitude ?? 0, prev),
        )
        .slice(0, 3);
      const best = topPool[Math.floor(Math.random() * topPool.length)];
      if (!best) continue;
      used.add(best.id);
      course.push({
        id: best.id,
        placeId: best.id,
        name: best.displayName?.text ?? "이름 미확인",
        category: best.primaryType ?? slot.label,
        color: colorForId(best.id),
        lat: best.location?.latitude ?? 0,
        lng: best.location?.longitude ?? 0,
        rating: best.rating,
        reviewCount: best.userRatingCount,
        address: best.formattedAddress,
        photoName: best.photos?.[0]?.name,
        googleMapsUri: best.googleMapsUri,
        icon: "pin",
        slotLabel: slot.label,
        hour: slot.hour,
        meal: Boolean(slot.meal),
      });
    }
    return NextResponse.json({ course, source: "google" });
  }

  // domestic → Kakao (no rating data, so first result per keyword is the best proxy)
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return NextResponse.json({ course: [], source: "mock" });
  for (const slot of RECOMMEND_SLOTS) {
    const results = await kakaoTop(`${city} ${slot.keyword}`, apiKey);
    // Kakao has no ratings — among its (already relevance-ranked) top hits,
    // prefer the one closest to the previous stop; skip same-brand names.
    const prev = course.length > 0 ? { lat: course[course.length - 1].lat, lng: course[course.length - 1].lng } : null;
    const candidates = results.filter((d) => !used.has(d.id) && !course.some((c) => sameShop(c.name, d.place_name)));
    // Same reasoning as the overseas branch above — random pick among the
    // top few (still Kakao's own relevance/proximity ranking) instead of
    // always the single best, so re-running gives a different course.
    const topPool = prev
      ? [...candidates.slice(0, 5)].sort((a, b) => distKm(prev.lat, prev.lng, Number(a.y), Number(a.x)) - distKm(prev.lat, prev.lng, Number(b.y), Number(b.x))).slice(0, 3)
      : candidates.slice(0, 3);
    const best = topPool[Math.floor(Math.random() * topPool.length)];
    if (!best) continue;
    used.add(best.id);
    course.push({
      id: best.id,
      placeId: best.id,
      name: best.place_name,
      category: best.category_group_name?.split(" > ").pop() || slot.label,
      color: colorForId(best.id),
      lat: Number(best.y),
      lng: Number(best.x),
      address: best.road_address_name || best.address_name,
      icon: "pin",
      slotLabel: slot.label,
      hour: slot.hour,
      meal: Boolean(slot.meal),
    });
  }
  return NextResponse.json({ course, source: "kakao" });
}
