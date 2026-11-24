import { chooseGuardedMask, hasMapsHeadroom, photoScreenFromReferer, releaseMapsOp, reserveMapsOp, runWithMapsRoute, runWithPhotoScreen, settleGuarded } from "@/lib/server/mapsBudget";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { checkRateLimit } from "@/lib/server/rateLimit";

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

// 작업지시서 2026-11-22 §1① — photoUri 도 1일 TTL 로 메모해 둔다. 적중하면 Google 을 부르지 않으므로 photos/text-pro 카운터도 올리지 않는다(없으면 같은 q 를 다시 요청할 때마다 photos 가 실제로 다시 나간다).
const PHOTO_URI_TTL_MS = 24 * 60 * 60 * 1000;
const photoUriMemo = new Map<string, { uri: string; at: number }>();

function rememberPhotoUri(q: string, uri: string): void {
  if (photoUriMemo.size >= MEMO_MAX) {
    const oldestKey = photoUriMemo.keys().next().value;
    if (oldestKey !== undefined) photoUriMemo.delete(oldestKey);
  }
  photoUriMemo.set(q, { uri, at: Date.now() });
}

// 작업지시서 2026-11-22 §1② — 열린 엔드포인트 잠금. 거절은 "사진 없음"(404)으로 응답해 클라이언트가 플레이스홀더로 떨어지게 하되, 같은 URL 의 정상 응답을 CDN 이 404 로 오염시키지 않도록 no-store.
const DENY_HEADERS = { "Cache-Control": "no-store" };
const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|python-requests|curl\/|wget\/|go-http-client|axios|node-fetch|undici/i;
const IP_LIMIT_PER_MIN = 30;

/** 우리 화면에서 <img> 로 불린 요청인가 — Sec-Fetch-Site 가 same-origin 이거나 Referer 호스트가 이 요청의 호스트와 같을 때만 true. */
function isOwnPageRequest(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin") return true;
  if (site && site !== "none") return false;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// 작업지시서 2026-10-14 "Google Places 데이터 보관 기간 점검" — 사진 참조는 Places 콘텐츠라 CDN 캐시도 하루로(원래 7일).
const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400, s-maxage=86400" };

// 작업지시서 2026-11-22 §6 — 307/302 는 Vercel CDN 이 캐시하지 않아(실측) 같은 화면이 매번 함수를 실행했다. photoUri 의 이미지를 직접 받아 200 으로 내려 CDN 1일 캐시(s-maxage=86400)가 걸리게 한다. 이미지 받기에 실패하면 예전처럼 리다이렉트.
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

// 작업지시서 2026-11-03 §1① — 이 라우트의 Places 호출은 health todayBySource["user:spot-photo"] 로 센다.
export const GET = withApiErrorHandling((request: NextRequest) =>
  runWithMapsRoute("spot-photo", () => runWithPhotoScreen(photoScreenFromReferer(request.headers.get("referer")), () => handleSpotPhoto(request))),
);
// 작업지시서 2026-11-22 §1② — 화면별 호출 수는 Referer 경로로 센다(health maps.photosByScreenToday). ?from= 쿼리는 CDN 캐시 키를 화면별로 갈라 같은 장소를 화면 수만큼 다시 과금하므로 붙이지 않는다(★).

async function handleSpotPhoto(request: NextRequest): Promise<NextResponse> {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });

  if (BOT_UA.test(request.headers.get("user-agent") ?? "") || !isOwnPageRequest(request)) {
    return NextResponse.json({ error: "not allowed" }, { status: 404, headers: DENY_HEADERS });
  }

  const cachedUri = photoUriMemo.get(q);
  if (cachedUri) {
    if (Date.now() - cachedUri.at < PHOTO_URI_TTL_MS) return photoResponse(cachedUri.uri);
    photoUriMemo.delete(q);
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "no api key" }, { status: 404, headers: CACHE_HEADERS });

  // 여기부터는 Google 로 실제 요청이 나갈 수 있는 경로 — IP 당 분당 상한(DB 장애 시엔 막지 않는다).
  const underLimit = await checkRateLimit(`spot-photo:${clientIp(request)}`, IP_LIMIT_PER_MIN, 60).catch(() => true);
  if (!underLimit) return NextResponse.json({ error: "rate limited" }, { status: 404, headers: DENY_HEADERS });

  let photoName = photoNameMemo.get(q);
  // 작업지시서 2026-10-14 "Places 호출 비용" §2 — 검색(Text Search Pro)과 사진(Photos)은 월 한도 가드를 거친다. 닿으면 사진 없음(플레이스홀더)로 짧게 응답한다.
  const BUDGET_SKIP = { "Cache-Control": "public, max-age=600" };
  if (photoName === undefined) {
    // 작업지시서 2026-11-24 #388 — 검색(text-pro)을 쓰기 전에 사진(photos) 오늘·월 한도부터 본다. 사진을 못 받을 거면 검색만 헛되이 쓰이기 때문.
    if (!(await hasMapsHeadroom("photos"))) return NextResponse.json({ error: "photo budget exhausted" }, { status: 404, headers: BUDGET_SKIP });
    const guarded = await chooseGuardedMask("text", "places.photos");
    if (!guarded) return NextResponse.json({ error: "photo budget exhausted" }, { status: 404, headers: BUDGET_SKIP });
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": guarded.mask,
      },
      body: JSON.stringify({ textQuery: q, maxResultCount: 1, languageCode: "ko" }),
    });
    await settleGuarded(guarded, res.status);
    if (!res.ok) {
      return NextResponse.json({ error: "lookup failed" }, { status: 404, headers: CACHE_HEADERS });
    }
    const data = (await res.json()) as { places?: { photos?: { name: string }[] }[] };
    photoName = data.places?.[0]?.photos?.[0]?.name ?? null;
    rememberPhotoName(q, photoName);
  }
  if (!photoName) return NextResponse.json({ error: "no photo" }, { status: 404, headers: CACHE_HEADERS });

  if (!(await reserveMapsOp("photos")).allowed) return NextResponse.json({ error: "photo budget exhausted" }, { status: 404, headers: BUDGET_SKIP });
  const media = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=480&skipHttpRedirect=true`,
    { headers: { "X-Goog-Api-Key": apiKey }, cache: "no-store" },
  );
  if (!media.ok) {
    if (media.status === 429 || media.status >= 500) await releaseMapsOp("photos"); // Google 이 처리하지 않은 호출은 카운트를 되돌린다
    return NextResponse.json({ error: "photo fetch failed" }, { status: 404, headers: CACHE_HEADERS });
  }
  const { photoUri } = (await media.json()) as { photoUri?: string };
  if (!photoUri) return NextResponse.json({ error: "no photo uri" }, { status: 404, headers: CACHE_HEADERS });
  rememberPhotoUri(q, photoUri);

  return photoResponse(photoUri);
}
