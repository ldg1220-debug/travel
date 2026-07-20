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
/**
 * Friendly category filter -> Google Places `includedType`. "all"/unset
 * means no filter. NOTE: searchText takes `includedType` (SINGULAR, one
 * type) — the plural `includedTypes` array only exists on searchNearby.
 * Sending the plural form here made Google reject the whole request with
 * a 400, silently collapsing every category-filtered search to the mock
 * fallback (which is why the live section vanished the moment the 음식점
 * chip auto-activated, while the same query without a category worked).
 */
const CATEGORY_TYPE_MAP: Record<string, string> = {
  attraction: "tourist_attraction",
  lodging: "lodging",
  restaurant: "restaurant",
};

/** Same categories, as a Korean keyword to append to the query text itself (e.g. "오사카" -> "오사카 관광명소"). */
const CATEGORY_LABEL_KO: Record<string, string> = {
  attraction: "관광명소",
  lodging: "숙소",
  restaurant: "음식점",
};

/** Whether a response actually came from the live Google Places / Kakao Local API, or fell back to cached/mock data — callers that only want to show genuinely-real results (e.g. /discover's live-search section) key off this instead of assuming "200 OK" means real data. */
export type PlaceSearchSource = "google" | "kakao" | "mock";

/**
 * Proximity filler words ("우메다 근처 맛집" → "우메다 맛집"). Google/Kakao
 * text search doesn't understand "near X" literally — leaving these in
 * just poisons the relevance ranking (that's why "오사카 카이유칸 근처
 * 관광지" returned almost nothing). The remaining terms still carry both
 * the landmark and the intent, so text relevance surfaces nearby matches.
 */
const LOCALITY_FILLERS = ["근처", "인근", "주변", "가까운", "근방", "옆"];
function stripLocalityFillers(q: string): string {
  let out = q;
  for (const f of LOCALITY_FILLERS) out = out.split(f).join(" ");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * "X 근처 Y" (오사카 레고랜드 근처 맛집) — merely stripping the filler and
 * text-searching lets the landmark's name-match dominate (every result is
 * LEGOLAND itself). Split it instead: `landmark` gets geocoded first, then
 * `want` is searched with a locationBias circle around that point.
 */
function parseNearQuery(raw: string): { landmark: string; want: string } | null {
  for (const f of LOCALITY_FILLERS) {
    const idx = raw.indexOf(f);
    if (idx > 0) {
      const landmark = raw.slice(0, idx).trim();
      const want = raw.slice(idx + f.length).trim();
      if (landmark) return { landmark, want };
    }
  }
  return null;
}

/** Intent word → Places includedType for the near-search ("맛집" → restaurant). */
const NEAR_WANT_TYPE: [string, string][] = [
  ["맛집", "restaurant"], ["음식점", "restaurant"], ["밥집", "restaurant"], ["레스토랑", "restaurant"],
  ["카페", "cafe"], ["커피", "cafe"],
  ["숙소", "lodging"], ["호텔", "lodging"], ["게스트하우스", "lodging"],
  ["관광지", "tourist_attraction"], ["명소", "tourist_attraction"], ["가볼만한곳", "tourist_attraction"],
  ["술집", "bar"],
];
function nearWantType(want: string): string | undefined {
  return NEAR_WANT_TYPE.find(([k]) => want.includes(k))?.[1];
}

const NEAR_RADIUS_M = 3000;

/** Category spread for a bare "X 근처" (no "Y" named) — one query per label, merged, so the grouped live-results UI has something in each theme bucket instead of whatever one generic query happened to surface. */
const NEAR_FANOUT_LABELS = ["관광명소", "맛집", "카페", "술집", "숙소"];

export async function GET(request: NextRequest) {
  const region: Region = request.nextUrl.searchParams.get("region") === "domestic" ? "domestic" : "international";
  const rawQuery = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const near = parseNearQuery(rawQuery);
  const query = stripLocalityFillers(rawQuery);
  const category = request.nextUrl.searchParams.get("category") ?? "all";
  if (!query) return NextResponse.json({ places: [], source: "mock" satisfies PlaceSearchSource });

  if (region === "domestic") {
    return NextResponse.json(await searchDomestic(query, near));
  }

  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!googleApiKey) {
    console.error("[places/search] Google API Key is completely missing");
    return NextResponse.json({ error: "Google API Key is completely missing" }, { status: 500 });
  }
  const includedType = CATEGORY_TYPE_MAP[category];
  return NextResponse.json(await searchInternational(query, googleApiKey, includedType, category, near));
}

interface GooglePlaceResult {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  primaryType?: string;
  photos?: { name: string }[];
  googleMapsUri?: string;
}

/** Google's price-level enum → 0 (free) – 4 (very expensive). */
const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// Concept words that describe an *experience*, not a place name — Google
// text search treats "야경"/"전망" literally, so "우메다 야경" only matches
// the one spot with that phrase in its name (우메다 스카이빌딩) instead of
// every night-view spot in Umeda. Detecting them lets us (a) bias toward
// tourist_attraction and (b) fan out into "그 지역의 명소들" rather than
// "그 이름의 장소 하나".
const CONCEPT_ATTRACTION_KEYWORDS = [
  "야경", "전망대", "전망", "뷰", "노을", "일몰", "일출", "파노라마", "스카이라인", "포토스팟", "산책", "야경명소",
];
function hasConceptKeyword(q: string): boolean {
  return CONCEPT_ATTRACTION_KEYWORDS.some((k) => q.includes(k));
}

// Trailing concept/category words stripped to recover the bare locality
// (e.g. "우메다 야경" → "우메다", "우메다 맛집" → "우메다") so fan-out can
// re-query "{locality} 관광명소 / 맛집 / …". Superset of the concept list.
const LOCALITY_STRIP_WORDS = [
  ...CONCEPT_ATTRACTION_KEYWORDS,
  "관광명소", "명소", "맛집", "음식점", "밥집", "숙소", "호텔", "카페", "여행", "가볼만한곳", "가볼만한",
];
function toLocalityBase(q: string): string {
  let out = q;
  for (const w of LOCALITY_STRIP_WORDS) out = out.split(w).join(" ");
  return out.replace(/\s+/g, " ").trim();
}

// Stop firing extra fan-out queries once we have this many merged hits, and
// the final cap on the response itself. Raised from 20 to 60 so the client
// (course builder, /discover live results) has enough real results to
// paginate through client-side (page 2, 3, … ) instead of a single flat
// list capped at whatever the first handful of queries returned.
const FANOUT_TARGET = 60;

async function searchInternational(
  query: string,
  apiKey: string,
  includedType?: string,
  category?: string,
  near?: { landmark: string; want: string } | null,
): Promise<{ places: Place[]; source: PlaceSearchSource }> {
  // ── "X 근처 Y": geocode the landmark, then search Y with a locationBias
  // circle around it — otherwise the landmark's name-match dominates and
  // every result is the landmark itself. Falls through to the normal text
  // path when the anchor or the biased search comes back empty.
  if (near) {
    const landmarkHits = await rawGoogleSearch(near.landmark, apiKey, undefined, "ko");
    const anchor = landmarkHits?.[0];
    if (anchor?.location) {
      const bias = { lat: anchor.location.latitude, lng: anchor.location.longitude };
      const merged: Place[] = [];
      const explicitWant = near.want || (category && category !== "all" ? CATEGORY_LABEL_KO[category] : "");
      if (explicitWant) {
        // A specific "Y" was named ("맛집", "카페", 스타벅스 …) — one focused
        // query for exactly that.
        const type = includedType ?? nearWantType(explicitWant);
        const nearby = await callGoogleSearchText(explicitWant, apiKey, type, bias);
        if (nearby) mergePlaces(merged, nearby);
      } else {
        // No "Y" at all ("카이유칸 근처" with nothing after) — fan out
        // across several categories within the radius instead of one
        // generic "맛집" call, so every theme bucket in the grouped live
        // results gets a chance to have something in it. Fired together
        // rather than one round trip at a time.
        const nearbyResults = await Promise.all(
          NEAR_FANOUT_LABELS.map((lbl) => callGoogleSearchText(`${near.landmark} ${lbl}`, apiKey, undefined, bias)),
        );
        for (const nearby of nearbyResults) {
          if (nearby) mergePlaces(merged, nearby);
        }
      }
      const filtered = merged.filter((p) => p.id !== anchor.id);
      if (filtered.length > 0) {
        return { places: filtered.slice(0, FANOUT_TARGET), source: "google" };
      }
    }
  }

  const concept = hasConceptKeyword(query);
  // Bias bare concept queries ("우메다 야경") toward attractions even when
  // the user picked no category chip.
  const primaryType = includedType ?? (concept ? "tourist_attraction" : undefined);
  const categoryLabel = category ? CATEGORY_LABEL_KO[category] : undefined;
  const locality = toLocalityBase(query);

  // Ordered attempts, most-specific first. A bare area/landmark query
  // ("우메다") or a concept query ("우메다 야경") returns only 1-2 literal
  // matches, so we fan out into category-augmented variants and MERGE them
  // — that's what turns "우메다" into a full spread of spots instead of one
  // building. `aug` variants only matter once the direct ones came back thin.
  const augLabels =
    concept || includedType === "tourist_attraction"
      ? ["관광명소", "명소", "전망대", "가볼만한곳", "맛집"]
      : ["관광명소", "맛집", "명소", "카페", "가볼만한곳"];

  // Direct attempts, most-specific first (query as typed, category-expanded, unfiltered fallback).
  const direct: { q: string; type?: string }[] = [];
  if (categoryLabel) direct.push({ q: `${query} ${categoryLabel}`, type: includedType });
  direct.push({ q: query, type: primaryType });
  if (primaryType) direct.push({ q: query, type: undefined }); // unfiltered fallback for a misclassified place

  const merged: Place[] = [];
  let anyOk = false;
  let firstFailed = false;
  let isFirst = true;
  const tried = new Set<string>();
  const attempt = async (a: { q: string; type?: string }) => {
    const key = `${a.q}|${a.type ?? ""}`;
    if (tried.has(key)) return;
    tried.add(key);
    const res = await callGoogleSearchText(a.q, apiKey, a.type);
    if (res === null) {
      if (isFirst && !anyOk) firstFailed = true;
      isFirst = false;
      return;
    }
    isFirst = false;
    anyOk = true;
    mergePlaces(merged, res);
  };

  // direct[] is short (2-3 entries) and each is a distinct, specific query —
  // firing them together instead of one full round-trip at a time is a pure
  // latency win with no extra API calls (same total requests either way).
  await Promise.all(direct.map((a) => attempt(a)));

  // Fan out into "{locality} 관광명소/맛집/…" ONLY when it genuinely helps:
  //  - a concept query (야경/전망/…) always wants the wider spread, and
  //  - a bare area/landmark query ("우메다") that came back thin does too.
  // A specific business name ("우오신") that already returned several real
  // hits must NOT pull in the area's famous attractions (e.g. 도톤보리), and
  // an explicit category chip relies on its own expansion, not generic
  // augmentation — so both skip the fan-out entirely (still an up-front
  // quota-saving decision, made once, before any of its calls fire).
  const FANOUT_MIN = 4;
  const wantFanout = !includedType && (concept || merged.length < FANOUT_MIN);
  if (wantFanout && locality) {
    // Same parallel-wave approach — up to 5 attempts that used to run one at
    // a time (each a full round trip) now fire together.
    await Promise.all(augLabels.map((lbl) => attempt({ q: `${locality} ${lbl}`, type: undefined })));
  }

  if (merged.length === 0) {
    // Nothing real came back. Only fall back to the offline mock list if a
    // call actually errored (key/quota/network) — a genuine empty result
    // from Google is still "google", just with no hits.
    if (firstFailed || !anyOk) return { places: filterByName(await getTrendingPlaces(), query), source: "mock" };
    return { places: [], source: "google" };
  }
  return { places: merged.slice(0, FANOUT_TARGET), source: "google" };
}

/**
 * One searchText call, resolved into `Place[]` with duplicate listings and
 * (optionally) a native-language name attached. Returns null only on a
 * non-ok *Korean* response (caller decides the offline fallback).
 *
 * Fires the Korean call and a no-languageCode "native" call in parallel:
 * Google's `languageCode:ko` transliterates a kanji shop name (魚心)
 * inconsistently — 우오신 / 어심 / 어신 — so the same place reads as several
 * different names. Joining the native name back on by place id (ids are
 * language-independent) lets the UI show "우오신 (魚心)", making it obvious
 * they're the same shop. Best-effort: if the native call fails, names just
 * render Korean-only as before.
 */
async function callGoogleSearchText(
  query: string,
  apiKey: string,
  includedType?: string,
  bias?: { lat: number; lng: number },
): Promise<Place[] | null> {
  const [ko, native] = await Promise.all([
    rawGoogleSearch(query, apiKey, includedType, "ko", bias),
    rawGoogleSearch(query, apiKey, includedType, undefined, bias),
  ]);
  if (ko === null) return null;
  const nativeById = new Map<string, string>();
  for (const p of native ?? []) if (p.id && p.displayName?.text) nativeById.set(p.id, p.displayName.text);
  return ko.map((p) => googlePlaceToPlace(p, nativeById.get(p.id)));
}

/** Raw searchText fetch for one language. Returns null on a non-ok response, else the (possibly empty) place array. */
async function rawGoogleSearch(
  query: string,
  apiKey: string,
  includedType: string | undefined,
  languageCode: string | undefined,
  bias?: { lat: number; lng: number },
): Promise<GooglePlaceResult[] | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.primaryType,places.photos,places.googleMapsUri",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 20, // New Places API per-request cap for searchText
      ...(languageCode ? { languageCode } : {}),
      ...(includedType ? { includedType } : {}), // singular on purpose — see CATEGORY_TYPE_MAP
      // "X 근처 Y" — anchor the text search to a circle around the resolved landmark.
      ...(bias ? { locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: NEAR_RADIUS_M } } } : {}),
    }),
  });
  if (!res.ok) {
    // Only log the Korean (primary) failure loudly; a failed native lookup is non-fatal.
    if (languageCode === "ko") {
      console.error("[places/search] Google API error:", res.status, res.statusText, await res.text());
    }
    return null;
  }
  const data = (await res.json()) as { places?: GooglePlaceResult[] };
  return data.places ?? [];
}

/**
 * Collapses whitespace/punctuation/parenthetical suffixes so listing
 * variants of one shop compare equal: "우오신", "우오신(UOSHIN)", "우오신 "
 * all normalize to the same key.
 */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[（(【「][^）)】」]*[）)】」]/g, "") // drop "(UOSHIN)" / "「…」" suffixes
    .replace(/[\s·・,，.\-–—!！?？'"''""|｜/]/g, "")
    .trim();
}

/** Cluster key = normalized name + coordinate (~11m). Same-name listings at the same spot (different floors, stale dupes) collapse; genuinely different branches (different coords) stay separate. */
function clusterKey(p: Place): string {
  return `${normalizeName(p.name)}@${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

/** How "complete" a listing is — used to keep the richest of a duplicate cluster (has rating, reviews, photo). */
function infoScore(p: Place): number {
  return (p.rating != null ? 2 : 0) + ((p.reviewCount ?? 0) > 0 ? 1 : 0) + (p.photoName ? 1 : 0) + (p.reviewCount ?? 0) / 1e6;
}

/** Merge `incoming` into `acc`, de-duplicating by cluster and keeping the richest listing (but never losing a native name). */
function mergePlaces(acc: Place[], incoming: Place[]): void {
  const index = new Map<string, number>();
  acc.forEach((p, i) => index.set(clusterKey(p), i));
  for (const p of incoming) {
    const key = clusterKey(p);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, acc.length);
      acc.push(p);
      continue;
    }
    const winner = infoScore(p) > infoScore(acc[at]) ? { ...p } : { ...acc[at] };
    winner.nativeName = acc[at].nativeName ?? p.nativeName; // don't lose a native name during merge
    acc[at] = winner;
  }
}

function googlePlaceToPlace(p: GooglePlaceResult, nativeText?: string): Place {
  const category = p.primaryType ?? "Place";
  const { color, icon } = styleForCategory(category, p.id);
  const name = p.displayName?.text ?? "이름 미확인 장소";
  // Only attach a native name when it's meaningfully different from the
  // Korean one (otherwise "우오신 (우오신)").
  const nativeName = nativeText && normalizeName(nativeText) !== normalizeName(name) ? nativeText : undefined;
  return {
    id: p.id,
    placeId: p.id,
    name,
    nativeName,
    category,
    color,
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    rating: p.rating,
    reviewCount: p.userRatingCount,
    priceLevel: p.priceLevel ? PRICE_LEVEL_MAP[p.priceLevel] : undefined,
    address: p.formattedAddress,
    photoName: p.photos?.[0]?.name,
    googleMapsUri: p.googleMapsUri,
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

/** One Kakao Local keyword call; `at` anchors it to a coordinate + radius ("근처" searches). size=15 is Kakao's per-page max. */
async function kakaoKeyword(
  query: string,
  apiKey: string,
  at?: { x: string; y: string },
  page = 1,
): Promise<KakaoLocalDocument[] | null> {
  const params = new URLSearchParams({ query, size: "15", page: String(page) });
  if (at) {
    params.set("x", at.x);
    params.set("y", at.y);
    params.set("radius", String(NEAR_RADIUS_M));
    params.set("sort", "distance");
  }
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params.toString()}`, {
    cache: "no-store",
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });
  console.log("[places/search] Kakao response status:", res.status);
  if (!res.ok) {
    console.error("[places/search] Kakao API error:", res.status, res.statusText, await res.text());
    return null;
  }
  const data = (await res.json()) as { documents?: KakaoLocalDocument[] };
  return data.documents ?? [];
}

// Kakao's per-call size cap (15) is too thin for a paginated list — fetch
// this many pages in parallel (up to KAKAO_PAGES * 15 results) so the
// client has enough to page through, matching the ~60-result cap used on
// the Google/international side.
const KAKAO_PAGES = 4;
async function kakaoKeywordAll(query: string, apiKey: string): Promise<KakaoLocalDocument[] | null> {
  const pages = await Promise.all(Array.from({ length: KAKAO_PAGES }, (_, i) => kakaoKeyword(query, apiKey, undefined, i + 1)));
  if (pages[0] === null) return null;
  const merged: KakaoLocalDocument[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (!p) continue;
    for (const d of p) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      merged.push(d);
    }
  }
  return merged;
}

async function searchDomestic(
  query: string,
  near?: { landmark: string; want: string } | null,
): Promise<{ places: Place[]; source: PlaceSearchSource }> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  console.log("[places/search] Using Kakao API Key:", apiKey ? "Set" : "Missing");
  if (apiKey) {
    // "X 근처 Y" — resolve the landmark first, then keyword-search Y sorted
    // by distance within a radius of it (Kakao supports x/y/radius natively).
    if (near) {
      const landmarkDocs = await kakaoKeyword(near.landmark, apiKey);
      const anchor = landmarkDocs?.[0];
      if (anchor) {
        const want = near.want || "맛집";
        const nearby = await kakaoKeyword(want, apiKey, { x: anchor.x, y: anchor.y });
        const filtered = (nearby ?? []).filter((d) => d.id !== anchor.id);
        if (filtered.length > 0) return { places: filtered.map(kakaoDocToPlace), source: "kakao" };
      }
    }
    const docs = await kakaoKeywordAll(query, apiKey);
    if (docs !== null) return { places: docs.map(kakaoDocToPlace), source: "kakao" };
  }
  return { places: filterByName(DOMESTIC_PLACES, query), source: "mock" };
}

function kakaoDocToPlace(d: KakaoLocalDocument): Place {
  const category = d.category_group_name?.split(" > ").pop() || "Place";
  const { color, icon } = styleForCategory(category, d.id);
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
