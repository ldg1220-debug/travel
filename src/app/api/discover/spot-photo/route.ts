import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

export const dynamic = "force-dynamic";

/**
 * Representative photo for a *curated* spot (지금 뜨는 장소 / 꾸준히
 * 사랑받는 명소 cards) — these are hand-authored entries with no photo of
 * their own, so this route resolves one live: Places searchText for the
 * spot's name+city (1 result, photos-only field mask) → that place's
 * first photo → 302 to its short-lived googleusercontent URL. The API
 * key never leaves the server.
 *
 * Cost control: a module-level memo caches the name→photo lookup per
 * warm lambda, and long CDN cache headers on both the redirect and the
 * 404 mean each unique spot only bills Google roughly once a week per
 * edge region — not once per card render.
 *
 * Capped at MEMO_MAX entries (evicting the oldest first, since Map
 * preserves insertion order) — this route sees a wide, ever-growing set of
 * distinct spot names, and a warm lambda instance can stay alive for a long
 * time, so an unbounded Map here would otherwise just grow forever.
 */
const MEMO_MAX = 2000;
const photoNameMemo = new Map<string, string | null>();

function rememberPhotoName(q: string, photoName: string | null): void {
  if (photoNameMemo.size >= MEMO_MAX) {
    const oldestKey = photoNameMemo.keys().next().value;
    if (oldestKey !== undefined) photoNameMemo.delete(oldestKey);
  }
  photoNameMemo.set(q, photoName);
}

const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400, s-maxage=604800" };

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "no api key" }, { status: 404, headers: CACHE_HEADERS });

  let photoName = photoNameMemo.get(q);
  if (photoName === undefined) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.photos",
      },
      body: JSON.stringify({ textQuery: q, maxResultCount: 1, languageCode: "ko" }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "lookup failed" }, { status: 404, headers: CACHE_HEADERS });
    }
    const data = (await res.json()) as { places?: { photos?: { name: string }[] }[] };
    photoName = data.places?.[0]?.photos?.[0]?.name ?? null;
    rememberPhotoName(q, photoName);
  }
  if (!photoName) return NextResponse.json({ error: "no photo" }, { status: 404, headers: CACHE_HEADERS });

  const media = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=480&skipHttpRedirect=true`,
    { headers: { "X-Goog-Api-Key": apiKey }, cache: "no-store" },
  );
  if (!media.ok) return NextResponse.json({ error: "photo fetch failed" }, { status: 404, headers: CACHE_HEADERS });
  const { photoUri } = (await media.json()) as { photoUri?: string };
  if (!photoUri) return NextResponse.json({ error: "no photo uri" }, { status: 404, headers: CACHE_HEADERS });

  return NextResponse.redirect(photoUri, { headers: CACHE_HEADERS });
});
