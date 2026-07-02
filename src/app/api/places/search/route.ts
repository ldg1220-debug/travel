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
export async function GET(request: NextRequest) {
  const region: Region = request.nextUrl.searchParams.get("region") === "domestic" ? "domestic" : "international";
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!query) return NextResponse.json({ places: [] });

  if (region === "domestic") {
    return NextResponse.json({ places: await searchDomestic(query) });
  }

  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!googleApiKey) {
    console.error("[places/search] Google API Key is completely missing");
    return NextResponse.json({ error: "Google API Key is completely missing" }, { status: 500 });
  }
  return NextResponse.json({ places: await searchInternational(query, googleApiKey) });
}

interface GooglePlaceResult {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  primaryType?: string;
}

async function searchInternational(query: string, apiKey: string): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.primaryType",
    },
    body: JSON.stringify({ textQuery: query }),
  });
  console.log("[places/search] Google response status:", res.status);
  if (res.ok) {
    const data = (await res.json()) as { places?: GooglePlaceResult[] };
    console.log("[places/search] Google API Response:", JSON.stringify(data));
    return (data.places ?? []).slice(0, 8).map(googlePlaceToPlace);
  }
  console.error("[places/search] Google API error:", res.status, res.statusText, await res.text());
  return filterByName(await getTrendingPlaces(), query);
}

function googlePlaceToPlace(p: GooglePlaceResult): Place {
  const category = p.primaryType ?? "Place";
  const { color, icon } = styleForCategory(category);
  return {
    id: p.id,
    placeId: p.id,
    name: p.displayName?.text ?? "Unknown place",
    category,
    color,
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    rating: p.rating,
    address: p.formattedAddress,
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

async function searchDomestic(query: string): Promise<Place[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  console.log("[places/search] Using Kakao API Key:", apiKey ? "Set" : "Missing");
  if (apiKey) {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`,
      { cache: "no-store", headers: { Authorization: `KakaoAK ${apiKey}` } },
    );
    console.log("[places/search] Kakao response status:", res.status);
    if (res.ok) {
      const data = (await res.json()) as { documents?: KakaoLocalDocument[] };
      console.log("[places/search] Kakao API Response:", JSON.stringify(data));
      return (data.documents ?? []).slice(0, 8).map(kakaoDocToPlace);
    }
    console.error("[places/search] Kakao API error:", res.status, res.statusText, await res.text());
  }
  return filterByName(DOMESTIC_PLACES, query);
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
