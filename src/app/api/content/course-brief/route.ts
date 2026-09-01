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
 * 조회(place_candidate_cache 재사용, 30일 캐시)로 보강한다.
 *
 * 그런데 그 라이브 조회 자체가 새 병목이 됐다(작업지시서 2026-09-01
 * "응답 시간(긴급)") — 스팟 여러 개를 기다리다 Vercel 함수 타임아웃에
 * 걸리면 응답도, 캐시 쓰기도 없이 죽어서 다음 호출도 똑같이 반복된다.
 * 그래서 buildBrief를 2단계로 나눴다: ① 코스 구조(순서·거리·이동수단 +
 * 카탈로그 매칭까지, 전부 로컬/동기)를 먼저 캐시에 써두고 → ② 그 위에
 * 시간 예산(ENRICH_BUDGET_MS)을 두고 라이브 평점 보강을 시도한 뒤 다시
 * 캐시에 반영한다. ①이 이미 캐시에 있으므로 ②가 아무리 늦어지거나
 * 실패해도 다음 호출은 최소한 즉시 응답한다("평점 몇 개가 비는 건
 * 감당되지만, 무응답은 안 된다"). 개별 타임아웃 값들은 각 함수 주석 참고.
 */

export const dynamic = "force-dynamic";
// Vercel 함수 기본 타임아웃(플랜에 따라 10~15초)보다 여유를 두면서도
// 무한정 매달리지 않도록 명시한다 — 코스 생성(LLM+DP, 우리가 직접
// 제어 못 함) + 평점 보강 예산(ENRICH_BUDGET_MS, 아래) + 여유분.
export const maxDuration = 30;

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

function round1(km: number): number {
  return Math.round(km * 10) / 10;
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

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[\s·・,，.\-–—!！?？'"|｜/()（）[\]【】「」]/g, "");
}

// Kakao/Google이 지역명을 상호 앞에 그대로 붙여 돌려주는 경우가 많아
// ("경주 황리단길") 카탈로그·중복 판정에 쓰는 이름 비교가 전부 어긋났다
// (작업지시서 2026-09-01 "중복 스팟" §1 — "황리단길"과 "경주 황리단길"이
// 다른 곳으로 판정됨). region 쿼리 파라미터를 선행 토큰으로 정확히
// 갖고 있을 때만 떼어낸다 — 이름 전체가 지역명뿐이면(예: region 자체가
// 상호로 검색된 경우) 빈 문자열이 되는 걸 막기 위해 뗀 나머지가 있을
// 때만 적용한다. 응답에 노출되는 spot.name 자체는 건드리지 않는다 —
// 매칭 비교에만 쓴다.
function stripRegionPrefix(name: string, region: string): string {
  const trimmedRegion = region.trim();
  const trimmedName = name.trim();
  if (!trimmedRegion || !trimmedName.startsWith(trimmedRegion)) return name;
  const rest = trimmedName.slice(trimmedRegion.length).trim();
  return rest || name;
}

// 리뷰 수가 너무 적으면(예: 2건) rating이 통계적으로 의미가 없어 블로그
// 문구에 인용하기 부적절하다(작업지시서 2026-09-01 "평점품질" §1). 출처가
// courseRecommendV2 원본이든 카탈로그 조인이든 라이브 조회든 상관없이,
// 최종적으로 스팟에 매겨지기 직전에 한 곳에서 일괄 적용한다.
const MIN_TRUSTED_REVIEW_COUNT = 30;
function qualityGate(rating: number | null, reviewCount: number | null): { rating: number | null; reviewCount: number | null } {
  if (rating != null && reviewCount != null && reviewCount < MIN_TRUSTED_REVIEW_COUNT) {
    return { rating: null, reviewCount: null };
  }
  return { rating, reviewCount };
}

// 국내 평점 카탈로그 조인(작업지시서 2026-09-01 §2 — 국내는 Kakao 결과라
// rating이 애초에 없다). discoverData.ts의 큐레이션 카탈로그(allSpots)는
// scripts/match-spot-place-ids.ts로 좌표까지 확인해 채운 실측 rating을
// 이미 들고 있으므로, 여기서 새로 Google을 조회하지 않고 그 값을 조인만
// 한다. 매칭 없으면 null을 유지한다(추정값 금지).
//
// 매칭 기준은 오탐(다른 곳의 rating을 잘못 붙이는 것)을 우선 피하도록
// 보수적으로 잡았다: 1km 밖은 아예 후보에서 제외하고, 그 안에서도
// (지역명 접두사를 뗀) 이름이 courseRecommend.ts의 sameShop()(같은 브랜드
// 판정)으로 맞거나 완전히 같을 때만, 혹은 좌표가 60m 이내로 사실상 같은
// 자리일 때만 인정한다. 여러 후보가 걸리면 가장 가까운 쪽을 쓴다.
const CATALOG_EXACT_MAX_KM = 1;
const CATALOG_COORD_ONLY_MAX_KM = 0.06;
function catalogRatingFor(scope: "domestic" | "overseas", region: string, stop: FinalStop): { rating: number; reviewCount: number | null } | null {
  const strippedName = stripRegionPrefix(stop.name, region);
  let best: { rating: number; reviewCount: number | null } | null = null;
  let bestDistKm = Infinity;
  for (const spot of allSpots(scope)) {
    if (spot.rating == null) continue;
    const distKm = haversineKm({ lat: spot.lat, lng: spot.lng }, { lat: stop.lat, lng: stop.lng });
    if (distKm > CATALOG_EXACT_MAX_KM) continue;
    const nameMatches = normalizeForMatch(spot.name) === normalizeForMatch(strippedName) || sameShop(spot.name, strippedName);
    const coordMatches = distKm <= CATALOG_COORD_ONLY_MAX_KM;
    if (!nameMatches && !coordMatches) continue;
    if (distKm < bestDistKm) {
      bestDistKm = distKm;
      best = { rating: spot.rating, reviewCount: spot.reviewCount ?? null };
    }
  }
  return best;
}

// 중복 스팟 제거(작업지시서 2026-09-01 "중복 스팟" §1) — days=2에서 1일차는
// 카탈로그, 2일차는 라이브 검색처럼 서로 다른 소스로 같은 물리적 장소가
// 두 번 뽑히는 사례("경주 황리단길" vs "황리단길", 좌표 차이 ~210m)가
// 나왔다. courseRecommendV2 자체의 중복 방지(같은 호출 안에서의
// resolveDuplicatePicks 등)는 날짜를 넘나드는 중복까지는 못 잡는다 —
// 1일차 결과를 안 뒤에 2일차를 따로 호출하는 구조라 서로의 존재를
// 이름으로만 막기 때문(excludeNames는 정확히 같은 문자열일 때만 걸림).
const DEDUPE_MAX_KM = 0.3;
function isDuplicateStop(a: FinalStop, b: FinalStop, region: string): boolean {
  if (a.placeId && b.placeId && a.placeId === b.placeId) return true;
  const distKm = haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
  if (distKm > DEDUPE_MAX_KM) return false;
  const na = normalizeForMatch(stripRegionPrefix(a.name, region));
  const nb = normalizeForMatch(stripRegionPrefix(b.name, region));
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}
/** 2일차 스톱 중 1일차와 겹치는 곳을 걸러낸다 — 1일차(순서가 앞선 쪽)를 남긴다. */
function dedupeCrossDay(day1: FinalStop[], day2: FinalStop[], region: string): FinalStop[] {
  return day2.filter((b) => !day1.some((a) => isDuplicateStop(a, b, region)));
}

// 카탈로그에도 없는 국내(Kakao) 결과의 마지막 보강 — place_candidate_cache를
// 그대로 재사용해 (지역, 이름) 단위로 Google Text Search 결과를 캐시한다.
// TTL은 spot_place_metrics가 이미 지키는 Google ToS 콘텐츠 보관 한도(30일)와
// 맞췄다. "찾았지만 없음"(진짜 매칭 실패)은 캐시하지만, 타임아웃/API키
// 부재처럼 이 장소 자체에 대한 판단이 아닌 경우는 캐시하지 않는다 —
// 그런 걸 캐시해버리면 나중에 조건이 나아져도(키 설정, 서버 응답 빨라짐)
// 30일 동안 영영 재시도가 안 된다.
const RATING_ENRICH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// 같은 물리적 장소로 볼 수 있는 한계 — Kakao/Google 좌표는 같은 곳이면
// 보통 수십~수백m 안쪽으로 겹치므로, 지역명까지 넣은 검색어의 상위 결과
// 중 이 거리 안에서 이름까지 맞는 것만 신뢰한다(다른 지역 동명 업체
// 오매칭 방지).
const LIVE_MATCH_MAX_KM = 3;
// 스팟 하나당 Google 호출 1건에 거는 상한 — 이게 없으면 fetch 하나가
// 응답 없이 매달릴 때 Promise.all 전체가, 나아가 이 라우트 전체가
// 같이 멈춘다(작업지시서 2026-09-01 "응답 시간" §1의 핵심 원인).
const PER_CALL_TIMEOUT_MS = 3000;

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

/**
 * 캐시 미스일 때만 실제로 Google Places Text Search 1건을 태운다. 호출
 * 하나에 PER_CALL_TIMEOUT_MS 상한을 걸고, 그 시간 안에 못 끝내면(타임아웃)
 * 결과를 캐시하지 않고 null로 돌려준다 — "이 장소는 평점이 없다"는
 * 결론이 아니라 "이번엔 시간이 부족했다"는 뜻이라 다음 요청이 다시
 * 시도할 수 있어야 한다.
 */
async function liveDomesticRatingFor(region: string, stop: { name: string; lat: number; lng: number }): Promise<RatingEnrichPayload> {
  const strippedName = stripRegionPrefix(stop.name, region);
  const key = ratingEnrichCacheKey(region, strippedName);
  const cached = await readRatingEnrichCache(key);
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { rating: null, reviewCount: null }; // 설정 문제일 뿐 이 장소에 대한 결론이 아니므로 캐시하지 않는다

  let result: RatingEnrichPayload = { rating: null, reviewCount: null };
  let cacheable = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);
  try {
    const candidates = await googleTop(`${region} ${strippedName}`, apiKey, undefined, controller.signal);
    const match = candidates.find((c) => {
      if (c.rating == null || !c.location) return false;
      const distKm = haversineKm({ lat: c.location.latitude, lng: c.location.longitude }, { lat: stop.lat, lng: stop.lng });
      if (distKm > LIVE_MATCH_MAX_KM) return false;
      const name = c.displayName?.text ?? "";
      return normalizeForMatch(name) === normalizeForMatch(strippedName) || sameShop(name, strippedName);
    });
    if (match) {
      result = { rating: match.rating ?? null, reviewCount: match.userRatingCount ?? null };
    }
  } catch (err) {
    cacheable = false; // 타임아웃/네트워크 오류 — 실제 "매칭 실패"가 아니므로 캐시에 남기지 않는다
    console.error("[content/course-brief] live google rating lookup failed:", err);
  } finally {
    clearTimeout(timer);
  }
  if (cacheable) await writeRatingEnrichCache(key, result);
  return result;
}

/** 배열을 최대 limit개씩 동시에 처리한다 — Promise.all의 무제한 동시성 대신 쓴다(작업지시서 §2-3, 동시성 3~5 권장). */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

const LIVE_ENRICH_CONCURRENCY = 4;

/**
 * 라이브 평점 보강 — 이미 rating이 채워진 스팟(courseRecommendV2 원본 또는
 * 카탈로그 매칭)은 건드리지 않고, 국내 스코프에서 아직 비어 있는 스팟만
 * 대상으로 한다(해외는 이미 Google 결과라 이 단계가 필요 없다). 전체
 * 호출에 deadline(공유 시간 예산)을 두고, 그걸 넘기면 남은 스팟은 그냥
 * null로 남긴 채 반환한다 — "평점 몇 개가 비는 건 감당되지만, 무응답은
 * 안 된다"(작업지시서 2026-09-01 §2-1).
 */
async function liveEnrichSpots(spots: CourseBriefSpot[], scope: "domestic" | "overseas", region: string, deadline: number): Promise<CourseBriefSpot[]> {
  if (scope !== "domestic") return spots;
  const pendingIndexes = spots.reduce<number[]>((acc, s, i) => {
    if (s.rating == null) acc.push(i);
    return acc;
  }, []);
  if (pendingIndexes.length === 0) return spots;

  const next = [...spots];
  await mapWithConcurrency(pendingIndexes, LIVE_ENRICH_CONCURRENCY, async (i) => {
    if (Date.now() > deadline) return; // 예산 초과 — 이 스팟은 이번엔 건너뛰고 null 유지, 다음 요청이 재시도
    const spot = spots[i];
    const live = await liveDomesticRatingFor(region, spot);
    const gated = qualityGate(live.rating, live.reviewCount);
    next[i] = { ...spot, rating: gated.rating, reviewCount: gated.reviewCount };
  });
  return next;
}

/**
 * 하루치 스톱 배열을 API 응답의 spots 조각(순서·구간 이동시간·이동수단
 * 포함)으로 변환한다. order는 baseOrder부터 이어서 매긴다(2일치를
 * 이어붙일 때 order가 1..N으로 연속되도록) — 스펙엔 날짜 구분 필드가
 * 없어(계약 그대로 유지) 이렇게 이어붙이는 것 외엔 표현할 방법이 없다.
 * 그래서 "하루" 단위의 총 이동거리·구간 이동시간만 정확히 계산하고,
 * 날짜가 바뀌는 경계(예: 1일차 마지막 → 2일차 첫 곳)는 실제로 연속된
 * 동선이 아니므로 toNextMinutes를 null로 두고 totalDistanceKm 합산에서도
 * 제외한다.
 *
 * 여기서는 로컬/동기 작업(구간 계산 + 카탈로그 조인)까지만 한다 — 외부
 * I/O가 들어가는 라이브 평점 보강은 별도 단계(liveEnrichSpots)로 분리해,
 * 이 함수의 결과만으로도 완결된 코스 구조를 즉시 캐시에 쓸 수 있게 한다.
 */
function assembleDaySpots(stops: FinalStop[], baseOrder: number, scope: "domestic" | "overseas", region: string): { spots: CourseBriefSpot[]; distanceKm: number } {
  let distanceKm = 0;
  const spots: CourseBriefSpot[] = stops.map((stop, i) => {
    let toNextMinutes: number | null = null;
    let toNextMode: TravelMode = "car";
    if (i < stops.length - 1) {
      const km = haversineKm({ lat: stop.lat, lng: stop.lng }, { lat: stops[i + 1].lat, lng: stops[i + 1].lng });
      distanceKm += km;
      toNextMode = modeForDistance(km, scope);
      toNextMinutes = minutesForKm(km, toNextMode);
    }

    let { rating, reviewCount } = qualityGate(stop.rating ?? null, stop.reviewCount ?? null);
    if (rating == null) {
      const catalogMatch = catalogRatingFor(scope, region, stop);
      if (catalogMatch) {
        ({ rating, reviewCount } = qualityGate(catalogMatch.rating, catalogMatch.reviewCount));
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
  });
  return { spots, distanceKm };
}

// 라이브 보강 전체(국내 스팟 여러 개, 최대 하루 6곳 안팎 × 최대 2일)에
// 거는 공유 시간 예산 — 초과분은 null로 남기고 즉시 반환한다. 6초는
// 지시서 예시값을 그대로 따랐다: PER_CALL_TIMEOUT_MS(3초) × 동시성
// 여유를 감안해도 대부분의 스팟이 이 안에 끝나고, 못 끝낸 나머지만
// 다음 캐시 갱신 때 다시 시도된다.
const ENRICH_BUDGET_MS = 6000;

async function buildBrief(scope: "domestic" | "overseas", region: string, days: 1 | 2, appUrl: string, cacheId: string): Promise<CourseBrief> {
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

  let day2Stops: FinalStop[] = [];
  if (days === 2 && day1Stops.length > 0) {
    // fetchMultiDayCourse(src/lib/api.ts)와 같은 원리로 1일차의 장소
    // id/이름/좌표 중심/음식종류를 2일차 호출에 넘겨 같은 곳이 반복되지
    // 않게 한다. 이 API엔 숙소·도착/출발 앵커 개념이 없으므로(스펙에
    // 그런 입력이 없다) 시작·종료 위치 고정 없이 매일 새로 짠다.
    const seenIds = new Set(day1Stops.map((s) => s.id));
    const seenNames = day1Stops.map((s) => s.name);
    const seenCuisines = [...new Set(day1Stops.map((s) => cuisineKeyword(s.name)).filter((c): c is string => Boolean(c)))];
    const centroid = { lat: day1Stops.reduce((sum, s) => sum + s.lat, 0) / day1Stops.length, lng: day1Stops.reduce((sum, s) => sum + s.lng, 0) / day1Stops.length };

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
    // excludeIds/excludeNames는 정확히 같은 id/문자열일 때만 걸러 날짜를
    // 넘나드는 "이름만 다른 같은 곳"까지는 못 잡는다 — 여기서 한 번 더 거른다.
    day2Stops = dedupeCrossDay(day1Stops, stopsOf(day2), region);
  }

  const { spots: day1Spots, distanceKm: day1Distance } = assembleDaySpots(day1Stops, 1, scope, region);
  let brief: CourseBrief;
  if (days === 1 || day1Stops.length === 0) {
    brief = { region, days: 1, totalDistanceKm: round1(day1Distance), spots: day1Spots, imageUrl: null, appUrl };
  } else {
    const { spots: day2Spots, distanceKm: day2Distance } = assembleDaySpots(day2Stops, day1Spots.length + 1, scope, region);
    brief = { region, days: 2, totalDistanceKm: round1(day1Distance + day2Distance), spots: [...day1Spots, ...day2Spots], imageUrl: null, appUrl };
  }

  // 여기까지가 "구조" 단계 — 순서·거리·이동수단·카탈로그 평점까지 전부
  // 확정됐고 외부 I/O가 더 없다. 먼저 캐시에 반영해둔다: 아래 라이브 보강이
  // 타임아웃/에러로 끊겨도 다음 호출은 최소한 이 결과를 즉시 캐시 히트로
  // 받는다(작업지시서 2026-09-01 "응답 시간" §2-2).
  await writeBriefCache(cacheId, brief).catch((err) => {
    console.error("[content/course-brief] structure cache write failed:", err);
  });

  const deadline = Date.now() + ENRICH_BUDGET_MS;
  const enrichedSpots = await liveEnrichSpots(brief.spots, scope, region, deadline);
  brief = { ...brief, spots: enrichedSpots };

  await writeBriefCache(cacheId, brief).catch((err) => {
    console.error("[content/course-brief] final cache write failed:", err);
  });

  return brief;
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

  // buildBrief가 캐시 쓰기까지 내부에서 처리한다(구조 확정 직후 1회,
  // 라이브 보강 완료/예산 소진 후 1회) — 위 "구조 단계 우선 캐시" 설계
  // 참고.
  const brief = await buildBrief(scope, region, days, appUrl, cacheId);

  return NextResponse.json(brief);
});
