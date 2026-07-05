import { NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  const placeId = (request.nextUrl.searchParams.get("placeId") ?? "").trim();
  // New Places API place ids are opaque tokens (commonly "ChIJ…") — a
  // loose allowlist keeps this from being pointed at arbitrary paths.
  if (!/^[A-Za-z0-9_-]{10,}$/.test(placeId)) {
    return NextResponse.json({ error: "invalid placeId" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "no api key" }, { status: 500 });

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
}
