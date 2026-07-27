import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

export const dynamic = "force-dynamic";

/**
 * Google Places (New) place details for the 딥 다이브 popup — the app-side
 * substitute for "구글맵에서 메뉴 보기". Google's API does not expose the
 * menu tab's structured data at all, but it *does* return up to 5 reviews
 * and up to 10 photos, which together convey "what this place serves / how
 * it looks" without leaving the app. The server key never reaches the
 * client; photo *resource names* are returned and rendered through the
 * existing /api/places/photo redirect proxy.
 */
interface GoogleReview {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string };
}

export interface PlaceDetails {
  photoNames: string[];
  reviews: {
    author: string;
    rating: number | null;
    text: string;
    when: string;
  }[];
  rating: number | null;
  reviewCount: number | null;
  /** e.g. "영업 중" / "영업 종료" when Google provides it. */
  openNow: boolean | null;
}

const EMPTY_DETAILS: PlaceDetails = { photoNames: [], reviews: [], rating: null, reviewCount: null, openNow: null };

/**
 * New Places API place ids are opaque tokens (commonly "ChIJ…", ~27 chars).
 * A Kakao Local id (domestic search) or a curated /discover seed id (e.g.
 * "o-f12") never matches this, which is exactly the signal used below to
 * fall back to name+coordinate resolution instead of calling Google with an
 * id it will never recognize.
 */
function looksLikeLiveGoogleId(id: string): boolean {
  return /^[A-Za-z0-9_-]{20,}$/.test(id);
}

/**
 * Resolves a non-Google place (Kakao 국내 검색 결과, /discover 큐레이션
 * 시드) to the nearest real Google place with the same name, so its reviews
 * and photos can still be fetched — the search is biased tightly (500m)
 * around the known coordinate so a same-named place elsewhere in the city
 * doesn't get matched instead. Returns null if nothing close enough matches.
 */
async function resolvePlaceId(name: string, lat: number, lng: number, apiKey: string): Promise<string | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({
      textQuery: name,
      maxResultCount: 1,
      languageCode: "ko",
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 500 } },
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { places?: { id: string }[] };
  return data.places?.[0]?.id ?? null;
}

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const rawPlaceId = (request.nextUrl.searchParams.get("placeId") ?? "").trim();
  const name = (request.nextUrl.searchParams.get("name") ?? "").trim();
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "no api key" }, { status: 500 });

  let placeId = rawPlaceId;
  if (!looksLikeLiveGoogleId(placeId)) {
    // 검색으로 찾은 장소가 아니라 국내(카카오) 결과나 추천 코스 큐레이션
    // 장소라 구글 place id가 아님 — 이름+좌표로 실제 구글 장소를 찾아본다.
    // 좌표 정보가 없거나 매칭되는 곳이 없으면 "리뷰 없음"으로 조용히 넘어간다.
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(EMPTY_DETAILS);
    }
    const resolved = await resolvePlaceId(name, lat, lng, apiKey);
    if (!resolved) return NextResponse.json(EMPTY_DETAILS);
    placeId = resolved;
  }

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "photos,reviews,rating,userRatingCount,currentOpeningHours.openNow",
      "Accept-Language": "ko",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ error: "details lookup failed" }, { status: res.status === 404 ? 404 : 502 });
  }

  const data = (await res.json()) as {
    photos?: { name: string }[];
    reviews?: GoogleReview[];
    rating?: number;
    userRatingCount?: number;
    currentOpeningHours?: { openNow?: boolean };
  };

  const details: PlaceDetails = {
    photoNames: (data.photos ?? []).slice(0, 8).map((p) => p.name),
    reviews: (data.reviews ?? []).slice(0, 5).map((r) => ({
      author: r.authorAttribution?.displayName ?? "익명",
      rating: r.rating ?? null,
      text: (r.text?.text ?? r.originalText?.text ?? "").trim(),
      when: r.relativePublishTimeDescription ?? "",
    })),
    rating: data.rating ?? null,
    reviewCount: data.userRatingCount ?? null,
    openNow: data.currentOpeningHours?.openNow ?? null,
  };

  return NextResponse.json(details, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
});
