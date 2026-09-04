import { put } from "@vercel/blob";
import { pool } from "@/lib/server/db";
import { generateCourseV2, type FinalStop, type GenerateResultV2 } from "@/lib/server/courseRecommendV2";
import { haversineKm } from "@/lib/server/courseRoute";
import { MODE_SPEED_KMH, cuisineKeyword, googleTop, sameShop, type CourseTheme, type TravelMode, type TravelRadius } from "@/lib/server/courseRecommend";
import { liveCategoryBucket } from "@/lib/liveCategoryBucket";
import { allSpots, OVERSEAS_LOCALITY_NAMES } from "@/lib/discoverData";

/**
 * 트레쥴 콘텐츠 API(`/api/content/course-brief`)의 실제 조립 로직 —
 * 사전 워밍 크론(`/api/cron/warm-course-brief`)도 같은 로직을 그대로
 * 재사용해야 해서 여기 별도 모듈로 뺐다(작업지시서 2026-09-01 "PR #223
 * 검증 결과 + 후속" §3 — 워밍 크론이 필수가 됨). App Router의 route.ts는
 * GET/POST 등 정해진 이름만 export하는 관례라 buildBrief 같은 헬퍼를
 * route.ts에서 바로 export해 재사용하는 대신, 이 lib 모듈에 로직을 두고
 * route.ts는 얇은 어댑터로만 남긴다.
 *
 * 스펙은 AutoPipeline 쪽 지시서와 동일한 계약이라 필드명·구조를 임의로
 * 바꾸면 안 된다(작업지시서 2026-08-27 "트레쥴 콘텐츠 API"). 새 추천
 * 로직을 만들지 않고 기존 courseRecommendV2/courseRoute를 그대로
 * 재사용한다.
 */

export type CourseBriefScope = "domestic" | "overseas";

export interface CourseBriefSpot {
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

export interface CourseBrief {
  region: string;
  days: 1 | 2;
  totalDistanceKm: number;
  spots: CourseBriefSpot[];
  imageUrl: string | null;
  appUrl: string;
}

const DEFAULT_THEME: CourseTheme = "balanced";
const DEFAULT_RADIUS: TravelRadius = 60;

export function resolveScope(region: string): CourseBriefScope {
  // OVERSEAS_LOCALITY_NAMES(discoverData.ts) — 이미 검증된 카탈로그의
  // 부산물이라 새로 만든 판정 로직이 아니다. 못 찾으면 국내로 취급한다
  // (기존 코스 만들기 화면의 기본 스코프와 동일).
  return OVERSEAS_LOCALITY_NAMES.has(region) ? "overseas" : "domestic";
}

export function appUrlFor(region: string): string {
  return `https://www.tradule.co.kr/course?region=${encodeURIComponent(region)}`;
}

// 이 응답 캐시는 course_cache가 아니라 place_candidate_cache를 쓴다
// (2026-08-27 지시서는 course_cache를 지정했었지만, 2026-09-01 "워밍
// 크론 필수화" 이후로는 맞지 않게 됐다 — course_cache는 courseRecommendV2
// 자신의 코스 재생성/리롤 상태용으로, 그쪽 코드가 5% 확률로 "1시간
// 지난 행"을 청소하는 잡을 이미 돌리고 있다. 워밍 크론은 하루 1회,
// 응답은 그 다음 크론이 돌 때까지(최대 ~24시간) 캐시가 살아 있어야
// 하는데, course_cache에 그대로 얹으면 TTL을 아무리 길게 잡아도 저
// 청소 잡이 1시간마다 물리적으로 행을 지워버려 워밍 효과가 사라진다.
// place_candidate_cache는 cache_key가 TEXT라 결정론적 UUID로 접어 넣는
// 우회도 필요 없어지고(코드도 단순해짐), 청소 주기도 30일이라 아래 TTL과
// 충돌하지 않는다 — 국내 평점 라이브 조회 캐시(아래 RATING_ENRICH_*)도
// 이미 같은 테이블을 이렇게 쓰고 있다.
const BRIEF_CACHE_TTL_MS = 26 * 60 * 60 * 1000; // 하루 1회 워밍 + 다음 크론까지 버틸 여유(1일 + 2시간)

export function briefCacheKey(scope: CourseBriefScope, region: string, days: number): string {
  return `content-brief:${scope}:${normalizeForMatch(region)}:${days}`;
}

export async function readBriefCache(key: string): Promise<CourseBrief | null> {
  const result = await pool.query<{ payload: CourseBrief; created_at: string }>(
    `select payload, created_at from place_candidate_cache where cache_key = $1`,
    [key],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.created_at).getTime() > BRIEF_CACHE_TTL_MS) return null;
  return row.payload;
}

async function writeBriefCache(key: string, brief: CourseBrief): Promise<void> {
  await pool.query(
    `insert into place_candidate_cache (cache_key, payload) values ($1, $2)
     on conflict (cache_key) do update set payload = excluded.payload, created_at = now()`,
    [key, JSON.stringify(brief)],
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
function modeForDistance(km: number, scope: CourseBriefScope): TravelMode {
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
function catalogRatingFor(scope: CourseBriefScope, region: string, stop: FinalStop): { rating: number; reviewCount: number | null } | null {
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

/** 이 스톱이 최종적으로 rating을 갖게 될 가능성이 높은지(courseRecommendV2 원본 또는 카탈로그 매칭) — 중복 제거 시 "평점 있는 쪽을 남긴다" 판단에만 쓰는 가벼운 힌트다. */
function hasRatingHint(scope: CourseBriefScope, region: string, stop: FinalStop): boolean {
  if (stop.rating != null) return true;
  return catalogRatingFor(scope, region, stop) != null;
}

// 중복 스팟 제거(작업지시서 2026-09-01 "중복 스팟" §1, 이어서 "PR #223
// 검증 결과" §2) — 날짜를 넘나드는 중복(1일차 vs 2일차)뿐 아니라 같은
// 날짜 안에서도 courseRecommendV2 자체의 중복 방지가 못 잡는 사례
// ("경주 황리단길" / "황리단길")가 나와, 날짜 구분 없이 적용 가능한
// 두 함수(dedupeWithinList, dedupeCrossDay)로 나눴다.
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
/** 같은 날짜 안의 중복을 걸러낸다 — 뒤에 나온 쪽이 rating을 가질 가능성이 있으면(hasRatingHint) 그쪽으로 교체하고, 아니면 먼저(순서가 앞선) 것을 남긴다. */
function dedupeWithinList(stops: FinalStop[], scope: CourseBriefScope, region: string): FinalStop[] {
  const kept: FinalStop[] = [];
  for (const stop of stops) {
    const dupIndex = kept.findIndex((k) => isDuplicateStop(k, stop, region));
    if (dupIndex === -1) {
      kept.push(stop);
      continue;
    }
    if (!hasRatingHint(scope, region, kept[dupIndex]) && hasRatingHint(scope, region, stop)) {
      kept[dupIndex] = stop;
    }
  }
  return kept;
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
    console.error("[courseBrief] rating-enrich cache read failed:", err);
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
    console.error("[courseBrief] rating-enrich cache write failed:", err);
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
    console.error("[courseBrief] live google rating lookup failed:", err);
  } finally {
    clearTimeout(timer);
  }
  if (cacheable) await writeRatingEnrichCache(key, result);
  return result;
}

/** 배열을 최대 limit개씩 동시에 처리한다 — Promise.all의 무제한 동시성 대신 쓴다(작업지시서 §2-3, 동시성 3~5 권장). 워밍 크론(warm-course-brief)도 지역 배치를 이 함수로 병렬 처리한다. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
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
 * 안 된다"(작업지시서 2026-09-01 §2-1). 이 예산은 호출부(사용자 요청 vs
 * 워밍 크론)마다 다르게 준다 — buildBrief의 enrichBudgetMs 참고.
 */
async function liveEnrichSpots(spots: CourseBriefSpot[], scope: CourseBriefScope, region: string, deadline: number): Promise<CourseBriefSpot[]> {
  if (scope !== "domestic") return spots;
  const pendingIndexes = spots.reduce<number[]>((acc, s, i) => {
    if (s.rating == null) acc.push(i);
    return acc;
  }, []);
  if (pendingIndexes.length === 0) return spots;

  const next = [...spots];
  await mapWithConcurrency(pendingIndexes, LIVE_ENRICH_CONCURRENCY, async (i) => {
    if (Date.now() > deadline) return; // 예산 초과 — 이 스팟은 이번엔 건너뛰고 null 유지, 다음 호출이 재시도
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
function assembleDaySpots(stops: FinalStop[], baseOrder: number, scope: CourseBriefScope, region: string): { spots: CourseBriefSpot[]; distanceKm: number } {
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

// 코스 동선이 그려진 정적 지도(작업지시서 2026-09-05 "트레쥴 다음 작업"
// §2) — 블로그 글에 코스와 무관한 Pexels 스톡 사진 대신 이 코스만의
// 지도를 넣는다. Naver 지도 오픈API(비로그인, Client ID/Secret만 필요)
// 를 쓴다 — NAVER_CLIENT_ID/SECRET이 아직 설정 안 됐거나(지시서 자체가
// "developers.naver.com 앱에 지도 상품이 있는지 확인 필요"라고 명시했다
// — 이 세션에선 그 확인도, 실제 호출도 검증하지 못했다) Blob 저장소가
// 준비 안 됐으면 조용히 null로 남긴다 — course-brief는 애초에 imageUrl을
// 선택 필드로 정의했고(작업지시서 2026-08-27 §1), 지도가 없다고 API
// 응답 자체가 막히면 안 된다.
//
// 라이브 평점 보강과 같은 이유로 이것도 "구조" 캐시 이후, 시간 예산 안의
// best-effort 단계다 — 외부 호출(Naver + Blob 업로드) 하나가 course-brief
// 전체를 다시 무응답으로 되돌리면 안 된다(2026-09-01 "응답 시간" 사고를
// 반복하지 않는다).
const MAP_CALL_TIMEOUT_MS = 5000;
const MAP_WIDTH = 800;
const MAP_HEIGHT = 500;
async function generateCourseMapImage(cacheKey: string, spots: CourseBriefSpot[]): Promise<string | null> {
  if (spots.length === 0) return null;
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return null;

  const url = new URL("https://openapi.naver.com/v1/map/staticmap.bin");
  url.searchParams.set("w", String(MAP_WIDTH));
  url.searchParams.set("h", String(MAP_HEIGHT));
  for (const [i, spot] of spots.entries()) {
    url.searchParams.append("markers", `type:d|size:mid|pos:${spot.lng} ${spot.lat}|label:${i + 1}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAP_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
    });
    if (!res.ok) {
      console.error(`[courseBrief] naver staticmap ${res.status}`);
      return null;
    }
    const bytes = await res.arrayBuffer();
    // 캐시 키(course_cache와 겹치지 않는 place_candidate_cache 네임스페이스와
    // 같은 관례) 기준 고정 경로 — addRandomSuffix:false로 재생성될 때마다
    // 같은 자리에 덮어써서, 지역이 다시 워밍/조회될 때마다 blob이 쌓이지
    // 않게 한다.
    const pathname = `course-maps/${cacheKey.replace(/^content-brief:/, "").replace(/:/g, "/")}.png`;
    const blob = await put(pathname, bytes, { access: "private", contentType: "image/png", addRandomSuffix: false });
    void blob; // put()의 반환 url은 private blob이라 브라우저에서 401 — 우리 프록시 경로를 대신 반환한다.
    // AutoPipeline 등 외부 소비자가 그대로 fetch/임베드해야 하므로
    // appUrlFor()와 마찬가지로 절대 URL로 반환한다(상대 경로는 이
    // 도메인 밖에서 못 씀).
    return `https://www.tradule.co.kr/api/blob/${pathname.split("/").map(encodeURIComponent).join("/")}`;
  } catch (err) {
    console.error("[courseBrief] course map generation failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 사용자 요청 경로의 기본 예산 — 6초는 지시서 예시값을 그대로 따랐다.
// 워밍 크론은 사용자 대기가 없으므로 더 넉넉한 값(30초, 크론 라우트에서
// 지정)을 따로 준다.
export const DEFAULT_ENRICH_BUDGET_MS = 6000;

export async function buildBrief(scope: CourseBriefScope, region: string, days: 1 | 2, cacheKey: string, enrichBudgetMs: number = DEFAULT_ENRICH_BUDGET_MS): Promise<CourseBrief> {
  const appUrl = appUrlFor(region);

  // 실패해도 절대 던지지 않는다(스펙 §1 "에러를 던지지 말 것") — 빈
  // spots로 조용히 폴백해 AutoPipeline이 그 지역을 건너뛰게 한다.
  let day1: GenerateResultV2 | { course: []; source: "mock"; theme: CourseTheme };
  try {
    day1 = await generateCourseV2(scope, region, DEFAULT_THEME, DEFAULT_RADIUS, {});
  } catch (err) {
    console.error("[courseBrief] day1 generateCourseV2 threw:", err);
    day1 = { course: [], source: "mock", theme: DEFAULT_THEME };
  }
  // 같은 날짜 안의 중복(예: "경주 황리단길"/"황리단길")도 여기서 한 번 거른다.
  const day1Stops = dedupeWithinList(stopsOf(day1), scope, region);

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
      console.error("[courseBrief] day2 generateCourseV2 threw:", err);
      day2 = { course: [], source: "mock", theme: DEFAULT_THEME };
    }
    // excludeIds/excludeNames는 정확히 같은 id/문자열일 때만 걸러 날짜를
    // 넘나드는 "이름만 다른 같은 곳"까지는 못 잡는다 — 여기서 한 번 더 거른다.
    const day2Deduped = dedupeWithinList(stopsOf(day2), scope, region);
    day2Stops = dedupeCrossDay(day1Stops, day2Deduped, region);
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
  await writeBriefCache(cacheKey, brief).catch((err) => {
    console.error("[courseBrief] structure cache write failed:", err);
  });

  const deadline = Date.now() + enrichBudgetMs;
  const enrichedSpots = await liveEnrichSpots(brief.spots, scope, region, deadline);
  const imageUrl = await generateCourseMapImage(cacheKey, enrichedSpots);
  brief = { ...brief, spots: enrichedSpots, imageUrl };

  await writeBriefCache(cacheKey, brief).catch((err) => {
    console.error("[courseBrief] final cache write failed:", err);
  });

  return brief;
}

/** GET /api/content/course-brief와 워밍 크론이 공통으로 쓰는 진입점 — 캐시 확인 → 미스 시 buildBrief. */
export async function getCourseBrief(region: string, days: 1 | 2, enrichBudgetMs: number = DEFAULT_ENRICH_BUDGET_MS): Promise<CourseBrief> {
  const scope = resolveScope(region);
  const cacheKey = briefCacheKey(scope, region, days);
  const cached = await readBriefCache(cacheKey).catch((err) => {
    console.error("[courseBrief] cache read failed:", err);
    return null;
  });
  if (cached) return cached;
  return buildBrief(scope, region, days, cacheKey, enrichBudgetMs);
}

/**
 * 워밍 크론이 "이번 실행에 어느 지역을 처리할지" 고를 때 쓴다 — 캐시가
 * 아예 없는 지역(가장 급함) → 캐시가 가장 오래된 지역 순으로 최대
 * limit개를 고른다. 작업지시서 2026-09-02 "워밍 재설계" §A-3: 58개
 * 지역을 한 번에 다 채우려던 이전 설계는 Vercel 서버리스 함수 시간
 * 안에 완주할 수 없어(58 × 지역당 30초 예산 = 최대 29분) 캐시가 전혀
 * 쌓이지 않았다 — 매 실행마다 작은 배치만 처리해 반드시 완주하는
 * 쪽으로 바꾼다. TTL(BRIEF_CACHE_TTL_MS, 26시간)이 지난 캐시도 "새로
 * 만든 것보다 오래됐다"는 점에서 자연히 없는 것과 같은 취급을 받는다
 * — 별도 로직 없이 정렬 순서만으로 해결된다.
 */
export async function pickStaleRegions(regions: string[], limit: number): Promise<string[]> {
  const keys = regions.map((region) => briefCacheKey(resolveScope(region), region, 1));
  const result = await pool.query<{ cache_key: string; created_at: string }>(
    `select cache_key, created_at from place_candidate_cache where cache_key = any($1)`,
    [keys],
  );
  const createdAtByKey = new Map(result.rows.map((row) => [row.cache_key, new Date(row.created_at).getTime()]));
  return regions
    .map((region, i) => ({ region, age: createdAtByKey.get(keys[i]) ?? -Infinity })) // 캐시 없음 = 가장 오래된 것으로 취급(맨 앞으로)
    .sort((a, b) => a.age - b.age)
    .slice(0, limit)
    .map((x) => x.region);
}
