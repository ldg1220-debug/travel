import { photoScreenFromReferer, reserveMapsOp, runWithMapsRoute, runWithPhotoScreen } from "@/lib/server/mapsBudget";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

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
// 작업지시서 2026-11-22 §1① — health todayBySource["user:place-photo"] 로 센다. 화면은 Referer 경로로 가른다(쿼리를 붙이면 CDN 캐시 키가 갈라진다).
export const GET = withApiErrorHandling((request: NextRequest) =>
  runWithMapsRoute("place-photo", () => runWithPhotoScreen(photoScreenFromReferer(request.headers.get("referer")), () => handlePlacePhoto(request))),
);

async function handlePlacePhoto(request: NextRequest): Promise<NextResponse> {
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

  // 작업지시서 2026-10-14 "Places 호출 비용" §2① — 사진(Place Photos)은 월 무료 1,000회. 한도(90%)에 닿으면 호출하지 않는다(화면은 사진 없음/플레이스홀더).
  if (!(await reserveMapsOp("photos")).allowed) {
    return NextResponse.json({ error: "photo budget exhausted" }, { status: 404, headers: { "Cache-Control": "public, max-age=600" } });
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

  return photoResponse(data.photoUri);
}

// 작업지시서 2026-11-25 — 307/302 는 Vercel CDN 이 캐시하지 않아 같은 사진이 보일 때마다 함수·Google 호출이 났다(health photos 월 69%).
// 이미지를 직접 받아 200 + s-maxage=86400(1일, Places 콘텐츠 보관 기준)으로 내려 CDN 이 캐시하게 한다. 실패하면 예전처럼 리다이렉트.
const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400, s-maxage=86400" };
async function photoResponse(uri: string): Promise<NextResponse> {
  try {
    const img = await fetch(uri, { cache: "no-store" });
    const type = img.headers.get("content-type") ?? "";
    if (img.ok && type.startsWith("image/")) {
      return new NextResponse(await img.arrayBuffer(), { status: 200, headers: { ...CACHE_HEADERS, "Content-Type": type } });
    }
  } catch {
    // 아래 리다이렉트로
  }
  return NextResponse.redirect(uri, { headers: CACHE_HEADERS });
}
