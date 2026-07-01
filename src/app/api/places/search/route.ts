import { NextRequest, NextResponse } from "next/server";
import { getTrendingPlaces } from "@/lib/server/getTrendingPlaces";
import { DOMESTIC_PLACES } from "@/lib/mockPlacesDomestic";
import { styleForCategory } from "@/lib/placeStyle";
import type { Place, Region } from "@/lib/types";

/**
 * Region-branching place search:
 *  - international → Google Places (New) `searchText`
 *  - domestic → Kakao Local keyword search
 * Falls back to a name/category filter over the cached trend list when the
 * relevant API key isn't configured, so search stays testable offline.
 */
export async function GET(request: NextRequest) {
  const region: Region = request.nextUrl.searchParams.get("region") === "domestic" ? "domestic" : "international";
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!query) return NextResponse.json({ places: [] });

  const places = region === "domestic" ? await searchDomestic(query) : await searchInternational(query);
  return NextResponse.json({ places });
}

interface GooglePlaceResult {
  id: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  primaryType?: string;
}

async function searchInternational(query: string): Promise<Place[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (apiKey) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.primaryType",
      },
      body: JSON.stringify({ textQuery: query }),
    });
    if (res.ok) {
      const data = (await res.json()) as { places?: GooglePlaceResult[] };
      return (data.places ?? []).slice(0, 8).map(googlePlaceToPlace);
    }
  }
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
    icon,
  };
}

interface KakaoLocalDocument {
  id: string;
  place_name: string;
  category_group_name?: string;
  x: string;
  y: string;
}

async function searchDomestic(query: string): Promise<Place[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (apiKey) {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`,
      { headers: { Authorization: `KakaoAK ${apiKey}` } },
    );
    if (res.ok) {
      const data = (await res.json()) as { documents?: KakaoLocalDocument[] };
      return (data.documents ?? []).slice(0, 8).map(kakaoDocToPlace);
    }
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
    icon,
  };
}

function filterByName(places: Place[], query: string): Place[] {
  const q = query.toLowerCase();
  return places.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
}
