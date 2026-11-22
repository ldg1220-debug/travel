import { chooseGuardedMask, releaseMapsOp, reserveMapsOp, runWithMapsRoute, settleGuarded } from "@/lib/server/mapsBudget";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { allSpots, type DiscoverSpot } from "@/lib/discoverData";
import { checkPhotoRequest } from "@/lib/server/photoGuard";
import { readPhotoCache, writePhotoCache } from "@/lib/server/photoCache";

export const dynamic = "force-dynamic";

/**
 * 큐레이션 스팟(카드 id)의 대표 사진 — Places searchText(사진 필드만, 1건) → 첫 사진 → googleusercontent 로 302. API 키는 서버 밖으로 나가지 않는다.
 *
 * 작업지시서 2026-11-22 "사진 사용량" — 이 라우트는 더 이상 자유 문자열을 받지 않는다:
 *  ② `id` = 서버가 아는 큐레이션 카드 id(discoverData)만 받는다. 모르는 id·옛 `q` 호출은 Google 을 부르지 않고 404(플레이스홀더).
 *     봇 UA · 우리 도메인이 아닌 Referer · IP 당 분당 30건 초과도 같다.
 *  ① 카운터(text-pro · photos)는 Google 로 실제 요청을 보낸 때만 오른다. 사진 URL 은 DB(place_candidate_cache)에 1일 TTL 로 저장해
 *     콜드스타트·배포 뒤에도 재조회하지 않는다(메모리 캐시 대체). 1일보다 오래 저장하지 않는다.
 *  고정 카드(/discover 큐레이션)는 자체 이미지(src/data/spotImages.ts)를 쓰므로 화면에서는 이 라우트를 부르지 않는다 — 이미지 없는 카드의 서버측 폴백으로만 남겨 둔다.
 */
const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400, s-maxage=86400" };
const BUDGET_SKIP = { "Cache-Control": "public, max-age=600" };
// 거절 응답은 CDN 에 남기지 않는다 — 같은 URL 을 사람이 정상 경로로 열 때 거절 응답이 재사용되면 안 된다.
const REJECT_HEADERS = { "Cache-Control": "no-store" };

let spotsById: Map<string, DiscoverSpot> | null = null;
function findSpot(id: string): DiscoverSpot | undefined {
  if (!spotsById) {
    spotsById = new Map();
    for (const scope of ["domestic", "overseas"] as const) for (const s of allSpots(scope)) spotsById.set(s.id, s);
  }
  return spotsById.get(id);
}

// 작업지시서 2026-11-03 §1① — 이 라우트의 Places 호출은 health todayBySource["user:spot-photo"] 로 센다.
export const GET = withApiErrorHandling((request: NextRequest) => runWithMapsRoute("spot-photo", () => handleSpotPhoto(request)));

async function handleSpotPhoto(request: NextRequest): Promise<NextResponse> {
  const rejected = checkPhotoRequest(request.headers);
  if (rejected) return NextResponse.json({ error: `rejected:${rejected}` }, { status: 404, headers: REJECT_HEADERS });

  const id = (request.nextUrl.searchParams.get("id") ?? "").trim().slice(0, 40);
  const spot = id ? findSpot(id) : undefined;
  if (!spot) return NextResponse.json({ error: "unknown key" }, { status: 404, headers: CACHE_HEADERS });

  const cacheKey = `spot-photo:${spot.id}`;
  const cached = await readPhotoCache(cacheKey);
  if (cached) {
    if (!cached.uri) return NextResponse.json({ error: "no photo" }, { status: 404, headers: CACHE_HEADERS });
    return NextResponse.redirect(cached.uri, { headers: CACHE_HEADERS });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "no api key" }, { status: 404, headers: CACHE_HEADERS });

  // 작업지시서 2026-10-14 "Places 호출 비용" §2 — 검색(Text Search Pro)과 사진(Photos)은 월 한도 가드를 거친다. 닿으면 사진 없음(플레이스홀더)로 짧게 응답한다.
  const guarded = await chooseGuardedMask("text", "places.photos");
  if (!guarded) return NextResponse.json({ error: "photo budget exhausted" }, { status: 404, headers: BUDGET_SKIP });
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": guarded.mask },
    body: JSON.stringify({ textQuery: `${spot.name} ${spot.region.split(" · ").join(" ")}`, maxResultCount: 1, languageCode: "ko" }),
  });
  await settleGuarded(guarded, res.status);
  if (!res.ok) return NextResponse.json({ error: "lookup failed" }, { status: 404, headers: CACHE_HEADERS });
  const data = (await res.json()) as { places?: { photos?: { name: string }[] }[] };
  const photoName = data.places?.[0]?.photos?.[0]?.name ?? null;
  if (!photoName) {
    await writePhotoCache(cacheKey, { uri: null });
    return NextResponse.json({ error: "no photo" }, { status: 404, headers: CACHE_HEADERS });
  }

  if (!(await reserveMapsOp("photos")).allowed) return NextResponse.json({ error: "photo budget exhausted" }, { status: 404, headers: BUDGET_SKIP });
  const media = await fetch(`https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=480&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": apiKey }, cache: "no-store" });
  if (!media.ok) {
    await releaseMapsOp("photos"); // 처리되지 않은 호출은 센 것을 되돌린다
    return NextResponse.json({ error: "photo fetch failed" }, { status: 404, headers: CACHE_HEADERS });
  }
  const { photoUri } = (await media.json()) as { photoUri?: string };
  if (!photoUri) return NextResponse.json({ error: "no photo uri" }, { status: 404, headers: CACHE_HEADERS });

  await writePhotoCache(cacheKey, { uri: photoUri, photoName });
  return NextResponse.redirect(photoUri, { headers: CACHE_HEADERS });
}
