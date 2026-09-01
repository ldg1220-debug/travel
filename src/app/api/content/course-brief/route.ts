import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { pool } from "@/lib/server/db";
import { generateCourseV2, type FinalStop, type GenerateResultV2 } from "@/lib/server/courseRecommendV2";
import { haversineKm } from "@/lib/server/courseRoute";
import { MODE_SPEED_KMH, cuisineKeyword, googleTop, sameShop, type CourseTheme, type TravelMode, type TravelRadius } from "@/lib/server/courseRecommend";
import { liveCategoryBucket } from "@/lib/liveCategoryBucket";
import { allSpots, OVERSEAS_LOCALITY_NAMES } from "@/lib/discoverData";

/**
 * 트레쥴 콘텐츠 API — 블로그 자동 발행 파이프라인(AutoPipeline, 별도
 * 저장소) 연동용 읽기 전용 엔드포인트. 스펙은 AutoPipeline 쪽 지시서와
 * 동일한 계약이라 필드명·구조를 임의로 바꾸면 안 된다(작업지시서
 * 2026-08-27 "트레쥴 콘텐츠 API").
 *
 * 새 추천 로직을 만들지 않고 기존 courseRecommendV2/courseRoute를 그대로
 * 재사용한다 — Google/Kakao 후보 검색 캐시(place_candidate_cache, 7일
 * TTL)는 fetchSlotCandidates 내부에서 이미 타므로 여기서 따로 손댈 게
 * 없고, 이 라우트 자체는 course_cache를 재사용해 (region, days) 단위로
 * 응답 전체를 캐시한다 — 반복 호출이 매번 취향 큐레이션(LLM 호출 포함)과
 * DP 조립을 다시 하지 않도록.
 *
 * 국내(Kakao) 결과는 애초에 rating이 없어(프로덕션 실측 2026-09-01)
 * discoverData.ts 카탈로그 조인 → 그래도 없으면 Google Places 라이브
 * 조회(place_candidate_cache 재사용, 30일 캐시)로 보강한다 — 아래
 * enrichSpots 참고.
 */

export const dynamic = "force-dynamic";

interface CourseBriefSpot {
  name: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  lat: number;
  lng: number;
  order: number;
  toNextMinutes: number | null;
  toNextMode: TravelMode;
}

interface CourseBrief {
  region: string;
  days: 1 | 2;
  totalDistanceKm: number;
  spots: CourseBriefSpot[];
  imageUrl: null;
  appUrl: string;
}

const DEFAULT_THEME: CourseTheme = "balanced";
const DEFAULT_RADIUS: TravelRadius = 60;

// course_cache.id는 UUID 컬럼(schema.sql)이라 courseRecommendV2처럼
// randomUUID()를 쓰면 매번 다른 행이 되어 캐시가 안 된다 — 대신 (scope,
// city, days) 해시를 UUID 모양으로 접어 넣어, 같은 요청이면 항상 같은
// id에 떨어지게 한다("진짜" UUID가 아니라 결정론적 캐시 키일 뿐이지만
// 컬럼 타입은 형식만 본다). courseRecommendV2가 쓰는 랜덤 UUID와 충돌할
// 확률은 무시 가능한 수준(해시 128비트).
function briefCacheId(scope: string, city: string, days: number): string {
  const h = createHash("sha256").update(`content-brief:${scope}:${city}:${days}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// course_cache 테이블의 기존 TTL 관례(courseRecommendV2.CACHE_TTL_MS)와
// 그대로 맞춘다 — courseRecommendV2의 코스 생성 호출이 5% 확률로 1시간
// 지난 행을 청소하는 잡을 이미 돌리고 있어(rememberCourse 참고), 이보다
// 긴 TTL을 두면 그 청소 잡이 만료 전에 행을 지워버릴 수 있다.
const CACHE_TTL_MS = 60 * 60 * 1000;

async function readBriefCache(id: string): Promise<CourseBrief | null> {
  const result = await pool.query<{ payload: CourseBrief; created_at: string }>(
    `select payload, created_at from course_cache where id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.created_at).getTime() > CACHE_TTL_MS) return null;
  return row.payload;
}

async function writeBriefCache(id: string, brief: CourseBrief): Promise<void> {
  await pool.query(
    `insert into course_cache (id, payload) values ($1, $2)
     on conflict (id) do update set payload = excluded.payload, created_at = now()`,
    [id, JSON.stringify(brief)],
  );
}

/** 하버사인 거리(km) → mode 속도로 환산한 이동 시간(분), 반올림. */
function minutesForKm(km: number, mode: TravelMode): number {
  return Math.round((km / MODE_SPEED_KMH[mode]) * 60);
}

/** generateCourseV2 결과에서 실제 스톱(FinalStop[])만 뽑는다 — "mock"(빈 결과) 응답엔 course 필드가 아예 없다. */
function stopsOf(result: Awaited<ReturnType<typeof generateCourseV2>>): FinalStop[] {
  return "course" in result ? result.course : [];
}

// 구간 거리 기준 이동수단 분기(작업지시서 2026-09-01 §3 — 실측에서
// "황리단길 → 황남시장 1분 car"처럼 도보 거리인데 car로 나와 부자연스러운
// 문구가 나온 문제). 1km 미만은 반드시 walk, 그 위는 대중교통이 실질적인
// 국내 대비 해외에서만 transit을 쓰고 국내는 car로 — courseRecommendV2가
// mode="car"를 기본으로 코스를 짜는 국내 특성과 맞춘다.
const WALK_MAX_KM = 1;
const TRANSIT_OR_CAR_MAX_KM = 5;
function modeForDistance(km: number, scope: "domestic" | "overseas"): TravelMode {
  if (km < WALK_MAX_KM) return "walk";
  if (km <= TRANSIT_OR_CAR_MAX_KM) return scope === "overseas" ? "transit" : "car";
  return "car";
}

// 국내 평점 카탈로그 조인(작업지시서 2026-09-01 §2 — 국내는 Kakao 결과라
// rating이 애초에 없다). discoverData.ts의 큐레이션 카탈로그(allSpots)는
// scripts/match-spot-place-ids.ts로 좌표까지 확인해 채운 실측 rating을
// 이미 들고 있으므로, 여기서 새로 Google을 조회하지 않고 그 값을 조인만
// 한다 — "이미 있는 데이터를 조인만 하면 됩니다"(지시서). 매칭 없으면
// null을 유지한다(추정값 금지).
//
// 매칭 기준은 오탐(다른 곳의 rating을 잘못 붙이는 것)을 우선 피하도록
// 보수적으로 잡았다: 1km 밖은 아예 후보에서 제외하고, 그 안에서도
// 이름이 courseRecommend.ts의 sameShop()(같은 브랜드 판정)으로 맞거나
// 공백·기호를 뺀 이름이 완전히 같을 때만, 혹은 좌표가 60m 이내로
// 사실상 같은 자리일 때만 인정한다. 여러 후보가 걸리면 가장 가까운
// 쪽을 쓴다.
const CATALOG_EXACT_MAX_KM = 1;
const CATALOG_COORD_ONLY_MAX_KM = 0.06;
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[\s·・,，.\-–—!！?？'"|｜/()（）[\]【】「」]/g, "");
}
function catalogRatingFor(scope: "domestic" | "overseas", stop: FinalStop): { rating: number; reviewCount: number | null } | null {
  let best: { rating: number; reviewCount: number | null } | null = null;
  let bestDistKm = Infinity;
  for (const spot of allSpots(scope)) {
    if (spot.rating == null) continue;
    const distKm = haversineKm({ lat: spot.lat, lng: spot.lng }, { lat: stop.lat, lng: stop.lng });
    if (distKm > CATALOG_EXACT_MAX_KM) continue;
    const nameMatches = normalizeForMatch(spot.name) === normalizeForMatch(stop.name) || sameShop(spot.name, stop.name);
    const coordMatches = distKm <= CATALOG_COORD_ONLY_MAX_KM;
    if (!nameMatches && !coordMatches) continue;
    if (distKm < bestDistKm) {
      bestDistKm = distKm;
      best = { rating: spot.rating, reviewCount: spot.reviewCount ?? null };
    }
  }
  return best;
}

// 카탈로그에도 없는 국내(Kakao) 결과의 마지막 보강 — place_candidate_cache를
// 그대로 재사용해 (지역, 이름) 단위로 Google Text Search 결과를 캐시한다.
// TTL은 spot_place_metrics가 이미 지키는 Google ToS 콘텐츠 보관 한도(30일)와
// 맞췄다. 매칭 실패(=null)도 캐시한다 — 안 그러면 애초에 Google에 없는
// 이름(예: 아주 작은 로컬 식당)을 요청마다 재조회하게 되어 캐시가 의미가
// 없어진다.
const RATING_ENRICH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// 같은 물리적 장소로 볼 수 있는 한계 — Kakao/Google 좌표는 같은 곳이면
// 보통 수십~수백m 안쪽으로 겹치므로, 지역명까지 넣은 검색어의 상위 결과
// 중 이 거리 안에서 이름까지 맞는 것만 신뢰한다(다른 지역 동명 업체
// 오매칭 방지).
const LIVE_MATCH_MAX_KM = 3;

function ratingEnrichCacheKey(region: string, name: string): string {
  return `content-brief-rating:${normalizeForMatch(region)}:${normalizeForMatch(name)}`;
}

interface RatingEnrichPayload {
  rating: number | null;
  reviewCount: number | null;
}

async function readRatingEnrichCache(key: string): Promise<RatingEnrichPayload | null> {
  try {
    const result = await pool.query<{ payload: RatingEnrichPayload; created_at: string }>(
      `select payload, created_at from place_candidate_cache where cache_key = $1`,
      [key],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (Date.now() - new Date(row.created_at).getTime() > RATING_ENRICH_CACHE_TTL_MS) return null;
    return row.payload;
  } catch (err) {
    console.error("[content/course-brief] rating-enrich cache read failed:", err);
    return null;
  }
}

async function writeRatingEnrichCache(key: string, payload: RatingEnrichPayload): Promise<void> {
  try {
    await pool.query(
      `insert into place_candidate_cache (cache_key, payload) values ($1, $2)
       on conflict (cache_key) do update set payload = excluded.payload, created_at = now()`,
      [key, JSON.stringify(payload)],
    );
  } catch (err) {
    console.error("[content/course-brief] rating-enrich cache write failed:", err);
  }
}

/** 캐시 미스일 때만 실제로 Google Places Text Search 1건을 태운다(요청당 최대 스톱 수만큼) — 그 결과는 곧바로 위 캐시에 적재된다. */
async function liveDomesticRatingFor(region: string, stop: FinalStop): Promise<RatingEnrichPayload> {
  const key = ratingEnrichCacheKey(region, stop.name);
  const cached = await readRatingEnrichCache(key);
  if (cached) return cached;

  let result: RatingEnrichPayload = { rating: null, reviewCount: null };
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const candidates = await googleTop(`${region} ${stop.name}`, apiKey);
      const match = candidates.find((c) => {
        if (c.rating == null || !c.location) return false;
        const distKm = haversineKm({ lat: c.location.latitude, lng: c.location.longitude }, { lat: stop.lat, lng: stop.lng });
        if (distKm > LIVE_MATCH_MAX_KM) return false;
        const name = c.displayName?.text ?? "";
        return normalizeForMatch(name) === normalizeForMatch(stop.name) || sameShop(name, stop.name);
      });
      if (match) {
        result = { rating: match.rating ?? null, reviewCount: match.userRatingCount ?? null };
      }
    } catch (err) {
      console.error("[content/course-brief] live google rating lookup failed:", err);
    }
  }
  await writeRatingEnrichCache(key, result);
  return result;
}

/**
 * 하루치 스톱 배열을 API 응답의 spots 조각(순서·구간 이동시간·이동수단·
 * 평점 보강 포함)으로 변환한다. order는 baseOrder부터 이어서 매긴다(2일치를
 * 이어붙일 때 order가 1..N으로 연속되도록) — 스펙엔 날짜 구분 필드가
 * 없어(계약 그대로 유지) 이렇게 이어붙이는 것 외엔 표현할 방법이 없다.
 * 그래서 "하루" 단위의 총 이동거리·구간 이동시간만 정확히 계산하고,
 * 날짜가 바뀌는 경계(예: 1일차 마지막 → 2일차 첫 곳)는 실제로 연속된
 * 동선이 아니므로 toNextMinutes를 null로 두고 totalDistanceKm 합산에서도
 * 제외한다.
 *
 * 평점 보강 우선순위(국내만 — 해외는 이미 Google 결과라 rating을 갖고
 * 있다): ① courseRecommendV2가 준 rating(있으면 그대로) → ② 정적
 * 카탈로그(discoverData.ts) 조인, API 호출 없음 → ③ 그래도 없으면 Google
 * Places 라이브 조회(캐시 경유). 세 단계 모두 실패하면 null을 유지한다
 * (추정값 금지).
 */
async function enrichSpots(
  stops: FinalStop[],
  baseOrder: number,
  scope: "domestic" | "overseas",
  region: string,
): Promise<{ spots: CourseBriefSpot[]; distanceKm: number }> {
  let distanceKm = 0;
  const legs = stops.map((stop, i) => {
    let toNextMinutes: number | null = null;
    let toNextMode: TravelMode = "car";
    if (i < stops.length - 1) {
      const km = haversineKm({ lat: stop.lat, lng: stop.lng }, { lat: stops[i + 1].lat, lng: stops[i + 1].lng });
      distanceKm += km;
      toNextMode = modeForDistance(km, scope);
      toNextMinutes = minutesForKm(km, toNextMode);
    }
    return { stop, toNextMinutes, toNextMode };
  });

  const spots = await Promise.all(
    legs.map(async ({ stop, toNextMinutes, toNextMode }, i) => {
      let rating = stop.rating ?? null;
      let reviewCount = stop.reviewCount ?? null;
      if (rating == null) {
        const catalogMatch = catalogRatingFor(scope, stop);
        if (catalogMatch) {
          rating = catalogMatch.rating;
          reviewCount = catalogMatch.reviewCount;
        } else if (scope === "domestic") {
          const live = await liveDomesticRatingFor(region, stop);
          rating = live.rating;
          reviewCount = live.reviewCount;
        }
      }
      return {
        name: stop.name,
        category: liveCategoryBucket(stop.category),
        rating,
        reviewCount,
        lat: stop.lat,
        lng: stop.lng,
        order: baseOrder + i,
        toNextMinutes,
        toNextMode,
      };
    }),
  );
  return { spots, distanceKm };
}

async function buildBrief(scope: "domestic" | "overseas", region: string, days: 1 | 2, appUrl: string): Promise<CourseBrief> {
  // 실패해도 절대 던지지 않는다(스펙 §1 "에러를 던지지 말 것") — 빈
  // spots로 조용히 폴백해 AutoPipeline이 그 지역을 건너뛰게 한다.
  let day1: GenerateResultV2 | { course: []; source: "mock"; theme: CourseTheme };
  try {
    day1 = await generateCourseV2(scope, region, DEFAULT_THEME, DEFAULT_RADIUS, {});
  } catch (err) {
    console.error("[content/course-brief] day1 generateCourseV2 threw:", err);
    day1 = { course: [], source: "mock", theme: DEFAULT_THEME };
  }
  const day1Stops = stopsOf(day1);
  const { spots: day1Spots, distanceKm: day1Distance } = await enrichSpots(day1Stops, 1, scope, region);

  if (days === 1 || day1Stops.length === 0) {
    return { region, days: 1, totalDistanceKm: Math.round(day1Distance * 10) / 10, spots: day1Spots, imageUrl: null, appUrl };
  }

  // 2일치 — fetchMultiDayCourse(src/lib/api.ts)와 같은 원리로 이전 날짜의
  // 장소 id/이름/좌표 중심/음식종류를 다음 날짜 호출에 넘겨 같은 곳이
  // 반복되지 않게 한다. 이 API엔 숙소·도착/출발 앵커 개념이 없으므로
  // (스펙에 그런 입력이 없다) 시작·종료 위치 고정 없이 매일 새로 짠다.
  const seenIds = new Set(day1Stops.map((s) => s.id));
  const seenNames = day1Stops.map((s) => s.name);
  const seenCuisines = [...new Set(day1Stops.map((s) => cuisineKeyword(s.name)).filter((c): c is string => Boolean(c)))];
  const centroid =
    day1Stops.length > 0
      ? { lat: day1Stops.reduce((sum, s) => sum + s.lat, 0) / day1Stops.length, lng: day1Stops.reduce((sum, s) => sum + s.lng, 0) / day1Stops.length }
      : undefined;

  let day2: GenerateResultV2 | { course: []; source: "mock"; theme: CourseTheme };
  try {
    day2 = await generateCourseV2(scope, region, DEFAULT_THEME, DEFAULT_RADIUS, {
      excludeIds: seenIds,
      excludeNames: seenNames,
      avoidCentroid: centroid,
      avoidCuisines: seenCuisines,
      dayIndex: 1,
    });
  } catch (err) {
    console.error("[content/course-brief] day2 generateCourseV2 threw:", err);
    day2 = { course: [], source: "mock", theme: DEFAULT_THEME };
  }
  const day2Stops = stopsOf(day2);
  const { spots: day2Spots, distanceKm: day2Distance } = await enrichSpots(day2Stops, day1Spots.length + 1, scope, region);

  return {
    region,
    days: 2,
    totalDistanceKm: Math.round((day1Distance + day2Distance) * 10) / 10,
    spots: [...day1Spots, ...day2Spots],
    imageUrl: null,
    appUrl,
  };
}

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const region = (request.nextUrl.searchParams.get("region") ?? "").trim().slice(0, 40);
  if (!region) return NextResponse.json({ error: "missing region" }, { status: 400 });
  const days: 1 | 2 = request.nextUrl.searchParams.get("days") === "2" ? 2 : 1;

  // OVERSEAS_LOCALITY_NAMES(discoverData.ts) — 이미 검증된 카탈로그의
  // 부산물이라 새로 만든 판정 로직이 아니다. 못 찾으면 국내로 취급한다
  // (기존 코스 만들기 화면의 기본 스코프와 동일).
  const scope: "domestic" | "overseas" = OVERSEAS_LOCALITY_NAMES.has(region) ? "overseas" : "domestic";
  const appUrl = `https://www.tradule.co.kr/course?region=${encodeURIComponent(region)}`;

  const cacheId = briefCacheId(scope, region, days);
  const cached = await readBriefCache(cacheId).catch((err) => {
    console.error("[content/course-brief] cache read failed:", err);
    return null;
  });
  if (cached) return NextResponse.json(cached);

  const brief = await buildBrief(scope, region, days, appUrl);

  // 캐시 쓰기 실패는 응답을 막을 이유가 아니다 — 다음 요청이 다시 라이브로
  // 생성하면 그만이다.
  writeBriefCache(cacheId, brief).catch((err) => {
    console.error("[content/course-brief] cache write failed:", err);
  });

  return NextResponse.json(brief);
});
