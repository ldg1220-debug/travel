import { releaseMapsOp, reserveMapsOp } from "@/lib/server/mapsBudget";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { checkPhotoRequest } from "@/lib/server/photoGuard";
import { readPhotoCache, writePhotoCache } from "@/lib/server/photoCache";

export const dynamic = "force-dynamic";

/**
 * Keyless proxy for Google Places (New) photos. The client only ever
 * knows a photo *resource name* (`places/…/photos/…`, returned by
 * /api/places/search) — fetching the actual image needs the server-side
 * API key, which must never appear in an <img src> URL. This route asks
 * Google for the photo's short-lived googleusercontent URL
 * (skipHttpRedirect=true → JSON instead of a 302) and redirects the
 * browser there; the final image URL needs no key at all.
 *
 * 작업지시서 2026-11-22 "사진 사용량" — 입구 검사(봇 UA · 외부 Referer · IP 분당 30건)를 통과한 요청만 받고, photoUri 는 DB 에 1일 TTL 로 저장해
 * 같은 사진을 Google 에 다시 묻지 않는다. photos 카운터는 Google 로 실제 요청을 보낸 때만 오르고, 실패하면 되돌린다.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const name = request.nextUrl.searchParams.get("name") ?? "";
  const width = Math.min(Math.max(Number(request.nextUrl.searchParams.get("w")) || 640, 64), 1600);
  // Strict shape check — this proxy must only ever relay Places photo
  // resources, not act as an open redirect/fetch for arbitrary paths.
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name)) {
    return NextResponse.json({ error: "invalid photo name" }, { status: 400 });
  }

  const rejected = checkPhotoRequest(request.headers);
  if (rejected) return NextResponse.json({ error: `rejected:${rejected}` }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const cacheKey = `places-photo:${width}:${name}`;
  const cached = await readPhotoCache(cacheKey);
  if (cached) {
    if (!cached.uri) return NextResponse.json({ error: "no photo uri" }, { status: 404 });
    return NextResponse.redirect(cached.uri, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google API key missing" }, { status: 500 });
  }

  // 작업지시서 2026-10-14 "Places 호출 비용" §2① — 사진(Place Photos)은 월 무료 1,000회. 한도(90%)에 닿으면 호출하지 않는다(화면은 사진 없음/플레이스홀더).
  if (!(await reserveMapsOp("photos")).allowed) {
    return NextResponse.json({ error: "photo budget exhausted" }, { status: 404, headers: { "Cache-Control": "public, max-age=600" } });
  }
  const res = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true`,
    { headers: { "X-Goog-Api-Key": apiKey }, cache: "no-store" },
  );
  if (!res.ok) {
    await releaseMapsOp("photos"); // Google 이 처리하지 않은 호출은 센 것을 되돌린다
    return NextResponse.json({ error: "photo lookup failed" }, { status: 404 });
  }
  const data = (await res.json()) as { photoUri?: string };
  if (!data.photoUri) {
    return NextResponse.json({ error: "no photo uri" }, { status: 404 });
  }

  await writePhotoCache(cacheKey, { uri: data.photoUri });
  return NextResponse.redirect(data.photoUri, {
    // The redirect target is short-lived but the mapping is stable enough
    // to spare Google (and our quota) repeat lookups for a day.
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
});
