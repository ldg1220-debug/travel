import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Keyless proxy for Google Places (New) photos. The client only ever
 * knows a photo *resource name* (`places/…/photos/…`, returned by
 * /api/places/search) — fetching the actual image needs the server-side
 * API key, which must never appear in an <img src> URL. This route asks
 * Google for the photo's short-lived googleusercontent URL
 * (skipHttpRedirect=true → JSON instead of a 302) and redirects the
 * browser there; the final image URL needs no key at all.
 */
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name") ?? "";
  const width = Math.min(Math.max(Number(request.nextUrl.searchParams.get("w")) || 640, 64), 1600);
  // Strict shape check — this proxy must only ever relay Places photo
  // resources, not act as an open redirect/fetch for arbitrary paths.
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name)) {
    return NextResponse.json({ error: "invalid photo name" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google API key missing" }, { status: 500 });
  }

  const res = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true`,
    { headers: { "X-Goog-Api-Key": apiKey }, cache: "no-store" },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "photo lookup failed" }, { status: 404 });
  }
  const data = (await res.json()) as { photoUri?: string };
  if (!data.photoUri) {
    return NextResponse.json({ error: "no photo uri" }, { status: 404 });
  }

  return NextResponse.redirect(data.photoUri, {
    // The redirect target is short-lived but the mapping is stable enough
    // to spare Google (and our quota) repeat lookups for a day.
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
