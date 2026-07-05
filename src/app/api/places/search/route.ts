import { NextRequest, NextResponse } from "next/server";
import { getTrendingPlaces } from "@/lib/server/getTrendingPlaces";
import { DOMESTIC_PLACES } from "@/lib/mockPlacesDomestic";
import { styleForCategory } from "@/lib/placeStyle";
import type { Place, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Region-branching place search:
 *  - international → Google Places (New) `searchText`. Falls back to
 *    `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` if the server-only
 *    `GOOGLE_PLACES_API_KEY` isn't set; 500s loudly if neither is set
 *    (rather than silently degrading to mock data).
 *  - domestic → Kakao Local keyword search. Falls back to a name/category
 *    filter over the cached trend list when `KAKAO_REST_API_KEY` isn't
 *    configured, so search stays testable offline.
 */
/**
 * Friendly category filter -> Google Places `includedType`. "all"/unset
 * means no filter. NOTE: searchText takes `includedType` (SINGULAR, one
 * type) — the plural `includedTypes` array only exists on searchNearby.
 * Sending the plural form here made Google reject the whole request with
 * a 400, silently collapsing every category-filtered search to the mock
 * fallback (which is why the live section vanished the moment the 음식점
 * chip auto-activated, while the same query without a category worked).
 */
const CATEGORY_TYPE_MAP: Record<string, string> = {
  attraction: "tourist_attraction",
  lodging: "lodging",
  restaurant: "restaurant",
};

/** Same categories, as a Korean keyword to append to the query text itself (e.g. "오사카" -> "오사카 관광명소"). */
const CATEGORY_LABEL_KO: Record<string, string> = {
  attraction: "관광명소",
  lodging: "숙소",
  restaurant: "음식점",
};

/** Whether a response actually came from the live Google Places / Kakao Local API, or fell back to cached/mock data — callers that only want to show genuinely-real results (e.g. /discover's live-search section) key off this instead of assuming "200 OK" means real data. */
export type PlaceSearchSource = "google" | "kakao" | "mock";

export async function GET(request: NextRequest) {
  const region: Region = request.nextUrl.searchParams.get("region") === "domestic" ? "domestic" : "international";
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const category = request.nextUrl.searchParams.get("category") ?? "all";
  if (!query) return NextResponse.json({ places: [], source: "mock" satisfies PlaceSearchSource });

  if (region === "domestic") {
    return NextResponse.json(await searchDomestic(query));
  }

  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!googleApiKey) {
    console.error("[places/search] Google API Key is completely missing");
    return NextResponse.json({ error: "Google API Key is completely missing" }, { status: 500 });
  }
  const includedType = CATEGORY_TYPE_MAP[category];
  return NextResponse.json(await searchInternational(query, googleApiKey, includedType, category));
}

interface GooglePlaceResult {
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

async function searchInternational(
  query: string,
  apiKey: string,
  includedType?: string,
  category?: string,
): Promise<{ places: Place[]; source: PlaceSearchSource }> {
  // A category filter is applied two ways at once, from most to least
  // specific, each step only tried if the previous one comes back empty:
  //  1. query text expanded with the category's Korean label + includedType
  //     (e.g. "오사카" -> "오사카 관광명소") — helps when the plain query is
  //     just a region/place name and Google's text-relevance ranking needs
  //     the hint to surface that category.
  //  2. the original query text + includedType (no expansion).
  //  3. the original query text with no filter at all — a specific/
  //     misclassified place can legitimately return nothing under a type
  //     filter even though it exists.
  const categoryLabel = category ? CATEGORY_LABEL_KO[category] : undefined;
  const expandedQuery = categoryLabel ? `${query} ${categoryLabel}` : null;

  if (expandedQuery) {
    const expanded = await callGoogleSearchText(expandedQuery, apiKey, includedType);
    if (expanded === null) return { places: filterByName(await getTrendingPlaces(), query), source: "mock" };
    if (expanded.length > 0) return { places: expanded, source: "google" };
    console.log("[places/search] 0 results for expanded query — retrying with plain query + category filter");
  }

  const places = await callGoogleSearchText(query, apiKey, includedType);
  if (places === null) return { places: filterByName(await getTrendingPlaces(), query), source: "mock" };

  if (places.length === 0 && includedType) {
    console.log("[places/search] 0 results with includedType — retrying without category filter");
    const unfiltered = await callGoogleSearchText(query, apiKey);
    if (unfiltered !== null) return { places: unfiltered, source: "google" };
  }
  return { places, source: "google" };
}

/** Returns null on a non-ok response (caller decides the offline fallback), otherwise the mapped place list (possibly empty). */
async function callGoogleSearchText(query: string, apiKey: string, includedType?: string): Promise<Place[] | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType,places.photos,places.googleMapsUri",
    },
    body: JSON.stringify({
      textQuery: query,
      // 20 is the New Places API's per-request cap for searchText (no
      // pageToken support in this simplified call) — a generic query like
      // "도톤보리 맛집" should come back with as many real hits as Google
      // itself has, not an arbitrarily small slice of them.
      maxResultCount: 20,
      // Without this, Google localizes names/addresses to English
      // ("Gyukatsu Motomura Dotonbori Branch") even for a Korean query —
      // the whole app is Korean, so ask for Korean display names.
      languageCode: "ko",
      // Singular on purpose — see CATEGORY_TYPE_MAP.
      ...(includedType ? { includedType } : {}),
    }),
  });
  console.log("[places/search] Google response status:", res.status, "includedType:", includedType ?? "none");
  if (!res.ok) {
    console.error("[places/search] Google API error:", res.status, res.statusText, await res.text());
    return null;
  }
  const data = (await res.json()) as { places?: GooglePlaceResult[] };
  console.log("[places/search] Google API Response:", JSON.stringify(data));
  return (data.places ?? []).map(googlePlaceToPlace);
}

function googlePlaceToPlace(p: GooglePlaceResult): Place {
  const category = p.primaryType ?? "Place";
  const { color, icon } = styleForCategory(category);
  return {
    id: p.id,
    placeId: p.id,
    name: p.displayName?.text ?? "이름 미확인 장소",
    category,
    color,
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    rating: p.rating,
    reviewCount: p.userRatingCount,
    address: p.formattedAddress,
    photoName: p.photos?.[0]?.name,
    googleMapsUri: p.googleMapsUri,
    icon,
  };
}

interface KakaoLocalDocument {
  id: string;
  place_name: string;
  category_group_name?: string;
  address_name?: string;
  road_address_name?: string;
  x: string;
  y: string;
}

async function searchDomestic(query: string): Promise<{ places: Place[]; source: PlaceSearchSource }> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  console.log("[places/search] Using Kakao API Key:", apiKey ? "Set" : "Missing");
  if (apiKey) {
    // size=15 is Kakao Local's own per-page maximum for keyword search (no
    // slicing it back down afterward — a popular query deserves all 15,
    // not an arbitrarily smaller subset of them).
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=15`,
      { cache: "no-store", headers: { Authorization: `KakaoAK ${apiKey}` } },
    );
    console.log("[places/search] Kakao response status:", res.status);
    if (res.ok) {
      const data = (await res.json()) as { documents?: KakaoLocalDocument[] };
      console.log("[places/search] Kakao API Response:", JSON.stringify(data));
      return { places: (data.documents ?? []).map(kakaoDocToPlace), source: "kakao" };
    }
    console.error("[places/search] Kakao API error:", res.status, res.statusText, await res.text());
  }
  return { places: filterByName(DOMESTIC_PLACES, query), source: "mock" };
}

function kakaoDocToPlace(d: KakaoLocalDocument): Place {
  const category = d.category_group_name?.split(" > ").pop() || "Place";
  const { color, icon } = styleForCategory(category);
  return {
    id: d.id,
    placeId: d.id,
    name: d.place_name,
    category,
    color,
    lat: Number(d.y),
    lng: Number(d.x),
    address: d.road_address_name || d.address_name,
    icon,
  };
}

function filterByName(places: Place[], query: string): Place[] {
  const q = query.toLowerCase();
  return places.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
}
