import { put } from "@vercel/blob";
import { pool } from "@/lib/server/db";
import { generateCourseV2, type FinalStop, type GenerateResultV2 } from "@/lib/server/courseRecommendV2";
import { haversineKm } from "@/lib/server/courseRoute";
import { MODE_SPEED_KMH, cuisineKeyword, googleTop, isLargeFacility, sameShop, stripBranchSuffix, type CourseTheme, type TravelMode, type TravelRadius } from "@/lib/server/courseRecommend";
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
  // 이 스팟이 몇 일차인지 — 작업지시서 2026-09-06 "승격 후 실측" §3:
  // order가 날짜 구분 없는 평면 배열(1..N)이라 AutoPipeline이 블로그
  // 일차별 타임라인 표를 만들 수 없었다. 순수 추가 필드라 기존 계약을
  // 깨지 않는다.
  day: 1 | 2 | 3;
  toNextMinutes: number | null;
  toNextMode: TravelMode;
}

export interface CourseBrief {
  region: string;
  days: 1 | 2 | 3;
  totalDistanceKm: number;
  spots: CourseBriefSpot[];
  imageUrl: string | null;
  appUrl: string;
  // spot.rating/reviewCount의 출처 — 작업지시서 2026-09-05 "AutoPipeline
  // 통합" §B-4가 표기 의무 확인을 요청해 추가했다. courseRecommendV2가
  // 직접 주는 값(해외, googleToPlace)도, catalogRatingFor의 카탈로그
  // 매칭값(scripts/match-spot-place-ids.ts로 Google Place Details를
  // 확정한 값)도, liveDomesticRatingFor의 라이브 조회값(Google Places
  // Text Search)도 전부 Google이 출처다 — Kakao는 rating 필드 자체를
  // 안 준다(kakaoToPlace 참고). 그래서 조건 분기 없이 항상 상수.
  ratingSource: "google";
}

const DEFAULT_THEME: CourseTheme = "balanced";
const DEFAULT_RADIUS: TravelRadius = 60;

export function resolveScope(region: string): CourseBriefScope {
  // OVERSEAS_LOCALITY_NAMES(discoverData.ts) — 이미 검증된 카탈로그의
  // 부산물이라 새로 만든 판정 로직이 아니다. 못 찾으면 국내로 취급한다
  // (기존 코스 만들기 화면의 기본 스코프와 동일).
  return OVERSEAS_LOCALITY_NAMES.has(region) ? "overseas" : "domestic";
}

// 세 라우트(course-brief/course-map/course-open)가 공통으로 쓰는 days
// 파싱 — 작업지시서 2026-09-06 "승격 후 실측" §7-5: 승격 전 프로덕션이
// days=3 요청을 조용히 days=1로 깎아 응답했다("지원하지 않는 값은 조용히
// 축소하지 말고 400으로 거절"). 값이 없으면(생략) 1을 기본값으로 쓰고,
// 1|2|3이 아닌 값(예: "4", "abc")은 null을 돌려줘 호출부가 400을 내게
// 한다.
export function parseDays(value: string | null): 1 | 2 | 3 | null {
  if (value == null) return 1;
  if (value === "1") return 1;
  if (value === "2") return 2;
  if (value === "3") return 3;
  return null;
}

/** "코스 만들기" 화면 — course-open이 빈 코스(스팟 0개)일 때 대체 목적지로 쓴다. appUrlFor와 분리해둬야 그쪽이 course-open URL로 바뀌어도 순환 리다이렉트가 안 생긴다. */
export function courseBuilderUrlFor(region: string): string {
  return `https://www.tradule.co.kr/course?region=${encodeURIComponent(region)}`;
}

// 작업지시서 2026-09-06 "승격 후 실측" §4 — 기존엔 지역·일수 정보가 없는
// "/course" 루트를 줘서 "이 코스 그대로 열기"라는 §B-2 요청과 맞지
// 않았다. course-open이 바로 그 역할(코스를 실제 계획으로 저장하고
// 공유 페이지로 보냄)을 하므로, appUrl 자체를 그 엔드포인트로 바꾼다
// (방법 A — course-open 자체 URL로 교체. course-open은 idempotent해서
// 여러 번 클릭해도 같은 계획으로 수렴한다).
export function appUrlFor(region: string, days: 1 | 2 | 3): string {
  return `https://www.tradule.co.kr/api/content/course-open?region=${encodeURIComponent(region)}&days=${days}`;
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

// 배분/생성 로직을 바꿀 때마다 올린다 — 작업지시서 2026-09-07 "PR #234
// 프로덕션 검증 결과" §1: 캐시 키가 지역·일수만 반영해서, 알고리즘을
// 바꿔도(예: 이 배포의 지리 재배분 도입) 이미 캐시된 지역엔 옛 결과가
// TTL(26시간)이 지나기 전까지 계속 나갔다 — 워밍 크론이 미리 채워둔
// 인기 지역일수록 오히려 개선이 반영 안 되는 역설이었다("오사카 30m
// 근접쌍"이 실제로는 이 배포 이전 워밍 캐시였음이 실측으로 확인됨).
// 버전을 올리면 옛 캐시는 자연히 미스가 돼 다음 요청/워밍 때 새로
// 만들어진다 — 일괄 DELETE보다 안전하다(새 버전에 문제가 있으면 상수만
// 되돌려도 옛 캐시가 즉시 다시 유효해진다).
// course-open(itineraries 행)의 멱등 키에도 재사용한다 — 작업지시서
// 2026-09-08 "블로그에서 넘어온 코스가 비어 있습니다" §2: 알고리즘이
// 바뀌어도 콘텐츠 CTA로 이미 저장된 예전 계획이 계속 열렸다(itineraries."contentKey"에
// 이 버전이 안 들어가 있었음). export해서 course-open/route.ts가
// 직접 참조한다.
export const COURSE_ALGO_VERSION = 6; // 이번 배포(시설 날 단독화 + 청크 상한 7곳 허용)로 다시 올림 — 작업지시서 2026-09-08 "PR #239 프로덕션 검증" §4 "COURSE_ALGO_VERSION 5 → 6".

export function briefCacheKey(scope: CourseBriefScope, region: string, days: number): string {
  return `content-brief:${scope}:${normalizeForMatch(region)}:${days}:v${COURSE_ALGO_VERSION}`;
}

// 필드를 새로 추가할 때(ratingSource — 작업지시서 2026-09-05, day —
// 2026-09-06 "승격 후 실측" §3) TTL이 지나기 전까지는 그 필드 없이
// 저장된 오래된 payload가 그대로 반환될 수 있다 — 실제로 2026-09-06
// 검증 문서 §1에서 프리뷰의 경주(캐시 히트) 응답이 ratingSource=undefined로
// 관측됐다(도메스틱이라 카카오라서가 아니라, ratingSource 필드가 생기기
// 전에 캐시된 옛 payload였을 뿐). 새 필드를 추가할 때마다 이 목록에
// 검증을 더한다 — 필수 필드가 없는 캐시는 캐시 미스로 취급해 새로 만든다.
function isFreshBriefPayload(payload: CourseBrief): boolean {
  if (typeof payload.ratingSource !== "string") return false;
  if (!Array.isArray(payload.spots)) return false;
  return payload.spots.every((s) => typeof (s as { day?: unknown }).day === "number");
}

export async function readBriefCache(key: string): Promise<CourseBrief | null> {
  const result = await pool.query<{ payload: CourseBrief; created_at: string }>(
    `select payload, created_at from place_candidate_cache where cache_key = $1`,
    [key],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.created_at).getTime() > BRIEF_CACHE_TTL_MS) return null;
  if (!isFreshBriefPayload(row.payload)) return null;
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
/** 이후 날짜 스톱 중 이전 날짜들과 겹치는 곳을 걸러낸다 — 이전 날짜(순서가 앞선 쪽)를 남긴다. 3일차는 1·2일차 전체를 합쳐 비교한다. */
function dedupeCrossDay(priorDays: FinalStop[][], candidate: FinalStop[], region: string): FinalStop[] {
  const priorStops = priorDays.flat();
  return candidate.filter((b) => !priorStops.some((a) => isDuplicateStop(a, b, region)));
}

// ---------------------------------------------------------------- 다일정 지리 배분
//
// 작업지시서 2026-09-06 "일자 배분이 지리적으로 나뉘지 않습니다"의 진단:
// 날짜별로 generateCourseV2를 독립 호출(avoidCentroid로 약한 페널티만
// 줌)하다 보니, 실측(오사카 3일 코스)에서 하루 안에 도시 반대편(키타↔
// 미나미)을 세 번 왕복하거나 같은 구역(예: 도톤보리/신세카이)이 여러
// 날에 흩어지는 문제가 나왔다 — order를 균등 3분할한 결과가 곧 날짜
// 배정이 되는 구조라, order 자체가 지리 순서를 반영하지 않으면 이렇게
// 된다. 스팟 "선정"(어떤 곳을 고를지 — generateDay/generateCourseV2 몫,
// 그대로 둔다)과 "배정"(그 스팟들을 어느 날·어느 순서로 방문할지)을
// 분리해, 배정만 좌표 기준으로 사후에 다시 정한다.

/** 클러스터링/동선 정렬 헬퍼가 필요로 하는 최소 형태 — FinalStop 전체가 아니라 이 형태로 짜야 순수 함수로 단위 테스트하기 쉽다. */
interface GeoPoint {
  lat: number;
  lng: number;
}

function centroidOf<T extends GeoPoint>(points: T[]): GeoPoint {
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
}

/**
 * centroidOf(좌표 평균)와 달리 실제 점들 중 나머지 전체와의 거리 합이
 * 가장 작은 하나를 돌려준다 — 작업지시서 2026-09-08 "PR #238 프로덕션
 * 검증" §3-2: 평균은 "허공"(실제로 아무것도 없는 좌표)에 찍힐 수 있고,
 * 그 허공이 이상치(예: 다자이후, 도심에서 15km 밖) 때문에 진짜 이웃
 * 스팟보다 오히려 더 가깝게 계산돼 소속 판정을 그르쳤다. medoid는
 * 항상 "실제로 존재하는 자리"라 이상치 하나가 있어도 나머지 다수가
 * 모여 있는 진짜 중심(예: 하카타)에 그대로 남는다.
 */
export function medoidOf<T extends GeoPoint>(points: T[]): T {
  if (points.length === 1) return points[0];
  let best = points[0];
  let bestSum = Infinity;
  for (const candidate of points) {
    let sum = 0;
    for (const other of points) sum += haversineKm(candidate, other);
    if (sum < bestSum) {
      bestSum = sum;
      best = candidate;
    }
  }
  return best;
}

/** n개를 groups개로 최대한 고르게(각 그룹 floor(n/groups) 또는 그보다 1개 많게) 순서 그대로 나눈다 — 클러스터링이 극단적으로 쏠린 경우의 안전한 대체 수단. groups <= n일 때만 모든 그룹이 비지 않는다(호출부가 보장). */
function evenSplit<T>(items: T[], groups: number): T[][] {
  const base = Math.floor(items.length / groups);
  const remainder = items.length % groups;
  const result: T[][] = [];
  let idx = 0;
  for (let i = 0; i < groups; i++) {
    const size = base + (i < remainder ? 1 : 0);
    result.push(items.slice(idx, idx + size));
    idx += size;
  }
  return result;
}

/**
 * k-메도이드 군집화(Lloyd's algorithm의 PAM 변형)로 좌표만 보고
 * stops를 k개 그룹으로 나눈다. 초기 중심은 farthest-point sampling
 * (서로 가장 멀리 떨어진 점부터 고름)으로 결정론적으로 고른다 —
 * k-means++ 같은 무작위 시드를 쓰면 같은 입력이 매번 다른 결과를 내
 * 캐시 재현성·테스트 안정성이 깨진다.
 *
 * 반복마다 그룹 중심을 좌표 평균(k-means)이 아니라 medoidOf(k-medoids)
 * 로 재계산한다 — 작업지시서 2026-09-08 "PR #238 프로덕션 검증" §3-2:
 * 평균은 이상치(예: 다자이후) 때문에 "허공"에 찍힐 수 있고, 그 허공이
 * 진짜 이웃 스팟(모모치 해변)보다 가깝게 계산돼 소속 판정을 그르쳤다.
 *
 * weightOf(기본값 1)로 각 항목의 "무게"를 매길 수 있다 — 이 함수를
 * 개별 스팟이 아니라 소구역(청크, 500m 이내로 이어진 스팟 묶음) 단위로
 * 돌릴 때, 청크 개수가 아니라 청크가 담은 실제 스팟 수를 기준으로
 * 그룹 크기를 맞추기 위함이다(reallocateStopsByDay 참고).
 *
 * k-메도이드만으로는 지리적으로 한쪽에 쏠린 도시에서 극단적으로
 * 불균등한 그룹(예: 12/5/2)이 나올 수 있어, 이후 균형 잡기 패스로
 * 그룹 가중치 합을 목표치(±1)에 맞춘다.
 */
export function clusterByLocation<T extends GeoPoint>(stops: T[], k: number, weightOf: (item: T) => number = () => 1): T[][] {
  const n = stops.length;
  const groups = Math.max(1, Math.min(k, n));
  if (groups <= 1 || n === 0) return [stops];

  const centers: GeoPoint[] = [{ lat: stops[0].lat, lng: stops[0].lng }];
  while (centers.length < groups) {
    let farthest = { index: 0, dist: -1 };
    stops.forEach((s, i) => {
      const minDist = Math.min(...centers.map((c) => haversineKm(s, c)));
      if (minDist > farthest.dist) farthest = { index: i, dist: minDist };
    });
    centers.push({ lat: stops[farthest.index].lat, lng: stops[farthest.index].lng });
  }

  let assignment = stops.map((s) => {
    let best = 0;
    let bestDist = Infinity;
    centers.forEach((c, ci) => {
      const d = haversineKm(s, c);
      if (d < bestDist) {
        bestDist = d;
        best = ci;
      }
    });
    return best;
  });
  const MAX_ITERATIONS = 20;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    for (let ci = 0; ci < groups; ci++) {
      const members = stops.filter((_, i) => assignment[i] === ci);
      if (members.length > 0) centers[ci] = medoidOf(members);
    }
    let changed = false;
    const next = stops.map((s, i) => {
      let best = 0;
      let bestDist = Infinity;
      centers.forEach((c, ci) => {
        const d = haversineKm(s, c);
        if (d < bestDist) {
          bestDist = d;
          best = ci;
        }
      });
      if (best !== assignment[i]) changed = true;
      return best;
    });
    assignment = next;
    if (!changed) break;
  }

  // 균형 잡기 — 그룹 "가중치 합"을 target(≈ 전체 가중치/groups)에
  // 가깝게 맞춘다(weightOf 기본값 1이면 기존과 동일하게 "개수" 기준).
  // 가장 무거운 그룹에서, 가장 가벼운 그룹의 중심에 제일 가까운
  // 멤버(청크 단위로 쓰일 땐 청크 하나 전체)를 옮기는 걸 반복한다.
  // n·groups 회로 상한을 둬 무한루프를 막는다(작은 입력이라 실제로는
  // 훨씬 일찍 끝난다).
  const totalWeight = stops.reduce((sum, s) => sum + weightOf(s), 0);
  const target = Math.floor(totalWeight / groups);
  for (let move = 0; move < n * groups; move++) {
    const sizes = Array.from({ length: groups }, (_, ci) =>
      stops.reduce((sum, s, i) => (assignment[i] === ci ? sum + weightOf(s) : sum), 0),
    );
    const overIdx = sizes.findIndex((s) => s > target + 1);
    const underIdx = sizes.findIndex((s) => s < target);
    if (overIdx === -1 || underIdx === -1) break;
    let bestI = -1;
    let bestDist = Infinity;
    stops.forEach((s, i) => {
      if (assignment[i] !== overIdx) return;
      const d = haversineKm(s, centers[underIdx]);
      if (d < bestDist) {
        bestDist = d;
        bestI = i;
      }
    });
    if (bestI === -1) break;
    assignment[bestI] = underIdx;
  }

  const result = Array.from({ length: groups }, (_, ci) => stops.filter((_, i) => assignment[i] === ci));
  // 극단적으로 쏠린 지리 분포 등으로 빈 그룹이 남으면(드묾) 안전하게
  // 균등 분할로 대체한다 — 빈 날짜가 있는 코스보다 낫다.
  return result.some((g) => g.length === 0) ? evenSplit(stops, groups) : result;
}

const CHUNK_LINK_MAX_KM = 0.5; // 작업지시서 2026-09-08 "PR #238 프로덕션 검증" §3-1 "500m 이내로 이어지는 스팟들을 하나의 묶음으로"

/**
 * 500m 이내로 사슬처럼 이어지는 스팟들을 하나의 소구역(청크)으로
 * 묶는다 — A-B 500m, B-C 500m이면 A·B·C가 한 묶음(전이적 연결,
 * union-find). 작업지시서 §3-1: 개별 스팟을 배정한 뒤 소속을 재검사
 * 하는 방식(reassignByCentroid)은 "옮길 자리가 없으면" 무력하다(실측:
 * 도톤보리가 옮겨지지 않고 그대로 남음 — 3~8곳 가드 도입 이후 옆
 * 날짜에 빈자리가 없었을 뿐). 애초에 배정 단계에서 소구역을 쪼개지
 * 않으면 이 문제 자체가 구조적으로 생기지 않는다.
 */
export function chunkByProximity<T extends GeoPoint>(stops: T[], maxLinkKm: number): T[][] {
  const parent = stops.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      if (haversineKm(stops[i], stops[j]) <= maxLinkKm) union(i, j);
    }
  }
  const chunks = new Map<number, T[]>();
  stops.forEach((s, i) => {
    const root = find(i);
    if (!chunks.has(root)) chunks.set(root, []);
    chunks.get(root)!.push(s);
  });
  return [...chunks.values()];
}

/** 청크(소구역)를 clusterByLocation에 그대로 먹일 수 있는 하나의 GeoPoint로 감싼다 — 대표 좌표는 medoid(실제 스팟)를 쓴다. members는 이후 그룹을 다시 스팟 배열로 펼칠 때 쓴다. */
interface ChunkPoint<T> extends GeoPoint {
  members: T[];
}

function toChunkPoint<T extends GeoPoint>(chunk: T[]): ChunkPoint<T> {
  const rep = medoidOf(chunk);
  return { lat: rep.lat, lng: rep.lng, members: chunk };
}

/**
 * clusterByLocation의 균형 잡기는 "그룹 가중치를 target±1에 맞춘다"는
 * 느슨한 목표라(개별 스팟 단위일 땐 ±1 정도는 자연스럽다), 청크(소구역)
 * 단위로 돌리면 목표를 살짝 넘는 것("target+1까지 허용")과 하드
 * 상한(DAY_SIZE_MAX)이 어긋날 수 있다 — 실측(자체 단위 테스트)에서
 * 18곳/3일(target=6)에 +1 허용이 그대로 적용돼 7·9곳짜리 날이 나왔다.
 * 이 함수가 그 뒤에 한 번 더, 하드 상한을 절대 넘지 않도록 정리한다:
 * 초과한 날에서 그 날 중심(medoid)에서 가장 먼 청크를 통째로(쪼개지
 * 않고) 자리 있는 가장 가까운 날로 옮긴다. 자리가 전혀 없으면(청크
 * 하나가 상한보다 큰 경우 등) 어쩔 수 없이 그대로 둔다 — 소구역을
 * 쪼개는 것보다는 상한을 살짝 넘기는 쪽이 낫다.
 */
function enforceChunkCap<T extends GeoPoint>(chunkGroups: ChunkPoint<T>[][], maxWeight: number): ChunkPoint<T>[][] {
  const groups = chunkGroups.map((g) => [...g]);
  const weightOf = (g: ChunkPoint<T>[]): number => g.reduce((sum, c) => sum + c.members.length, 0);
  const groupMedoid = (g: ChunkPoint<T>[]): T => medoidOf(g.flatMap((c) => c.members));

  const MAX_GUARD_ITERATIONS = 100;
  for (let iter = 0; iter < MAX_GUARD_ITERATIONS; iter++) {
    const overIdx = groups.findIndex((g) => weightOf(g) > maxWeight);
    if (overIdx === -1) break;
    const overGroup = groups[overIdx];
    if (overGroup.length <= 1) break; // 청크가 하나뿐이면(그 자체가 상한보다 큼) 더 못 뺀다 — 쪼개지 않는다.

    const dayMedoid = groupMedoid(overGroup);
    let farIndex = 0;
    let farDist = -1;
    overGroup.forEach((c, i) => {
      const d = haversineKm(c, dayMedoid);
      if (d > farDist) {
        farDist = d;
        farIndex = i;
      }
    });
    const [moved] = overGroup.splice(farIndex, 1);

    const ranked = groups
      .map((g, gi) => ({ gi, dist: gi === overIdx ? Infinity : haversineKm(moved, groupMedoid(g)) }))
      .filter(({ gi }) => gi !== overIdx)
      .sort((a, b) => a.dist - b.dist);
    const withRoom = ranked.find(({ gi }) => weightOf(groups[gi]) + moved.members.length <= maxWeight);
    const target = withRoom ?? ranked[0];
    groups[target.gi].push(moved);
  }
  return groups;
}

/** 그룹 안에서 최근접 이웃 순으로 이어 붙인다 — 왕복(지그재그) 없이 한 방향으로 훑도록 한다. 시작점은 입력 순서의 첫 번째(결정론적). */
export function orderByNearestNeighbor<T extends GeoPoint>(stops: T[]): T[] {
  if (stops.length <= 2) return stops;
  const remaining = [...stops];
  const ordered: T[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestDist = Infinity;
    remaining.forEach((s, i) => {
      const d = haversineKm(current, s);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    });
    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }
  return ordered;
}

const PROXIMITY_DEDUPE_HARD_KM = 0.1; // 카테고리 무관하게 사실상 같은 자리로 본다(실측: 하루카스300↔아베노하루카스 30m).
const PROXIMITY_DEDUPE_SOFT_KM = 0.3; // 이 안이면서 카테고리(liveCategoryBucket)까지 같을 때만 같은 자리로 본다(실측: 쓰텐카쿠 전망대↔신세카이 105m, 둘 다 관광지).

/**
 * 이름은 달라도 좌표상 사실상 같은 장소를 걸러낸다 — 작업지시서
 * 2026-09-06 "일자 배분" §4-2: dedupeWithinList/dedupeCrossDay는 이름
 * 겹침이 있어야만 중복으로 보는데, "하루카스 300"(전망대)과 "아베노
 * 하루카스"(건물)처럼 이름이 전혀 안 겹치는 같은 장소는 못 잡았다.
 * 카테고리가 다르면(예: 전망대 vs 식당) 300m 안이어도 중복으로 보지
 * 않는다 — 실제로 다른 방문 목적이니 둘 다 남기고, 대신 지리
 * 클러스터링(clusterByLocation)이 자연히 같은 날로 묶어준다. 100m
 * 안쪽은 카테고리 무관하게 사실상 같은 자리로 본다. 남길 쪽은 리뷰
 * 수가 더 많은 쪽(더 신뢰할 수 있는 데이터).
 */
export function dedupeByProximity<T extends GeoPoint & { category: string; reviewCount?: number | null }>(stops: T[]): T[] {
  const kept: T[] = [];
  for (const stop of stops) {
    const dupIndex = kept.findIndex((k) => {
      const distKm = haversineKm(k, stop);
      if (distKm <= PROXIMITY_DEDUPE_HARD_KM) return true;
      if (distKm > PROXIMITY_DEDUPE_SOFT_KM) return false;
      return liveCategoryBucket(k.category) === liveCategoryBucket(stop.category);
    });
    if (dupIndex === -1) {
      kept.push(stop);
      continue;
    }
    if ((stop.reviewCount ?? 0) > (kept[dupIndex].reviewCount ?? 0)) kept[dupIndex] = stop;
  }
  return kept;
}

// 상호명 앞에 붙는 일반적인 수식어 — 작업지시서 2026-09-07 "PR #237
// 프로덕션 검증" §3: 같은 체인의 다른 지점이 "원조 ○○ 텐진본점"처럼
// 접두 수식어까지 붙어 있으면, courseRecommend.ts의 brandKey(접미
// 지점 표기를 뗀 뒤 "앞 2어절"을 키로 삼음)가 그 수식어를 어절로
// 세는 바람에 같은 브랜드끼리 다른 키가 나온다(예: "모츠나베
// 라쿠텐치 이마이즈미 총본점"→"모츠나베라쿠텐치" vs "원조 모츠나베
// 라쿠텐치 텐진본점"→"원조모츠나베" — 브랜드는 같은데 키가 다름).
// 접미 지점 표기와 같은 방식으로 접두 수식어도 떼고 비교한다.
const BRAND_PREFIX_RE = /^(원조|정통|명물|본가)\s*/u;

/**
 * courseRecommend.ts의 brandKey와 같은 원리(접미 지점 표기를 뗀 뒤
 * "앞 2어절"만 브랜드로 본다)를 쓰되, 그 2어절을 정렬해서 합친다 —
 * 작업지시서 2026-09-08 "PR #238 프로덕션 검증" §4: "모토무라 규카츠"
 * (day1)와 "규카츠 모토무라 후쿠오카 파르코점"(day1)이 어순만 달라
 * 접미 표기 제거 방식만으로는 못 잡혔다("모토무라규카츠" vs
 * "규카츠모토무라" — 다른 문자열). 정렬하면 둘 다 "규카츠모토무라"로
 * 같아진다.
 *
 * 로직을 courseRecommend.ts의 brandKey에 얹지 않고 여기 로컬로 따로
 * 둔다 — brandKey는 sameShop을 거쳐 실시간 코스 생성(라이브 트래픽)
 * 경로에도 쓰이는데, 정렬을 더하면 그쪽 동작까지 바뀌는 위험을 감수하게
 * 된다. 여기는 "코스 전체 브랜드 하나만" 판정 전용이라 별도로 둬도
 * 됨(stripBranchSuffix만 재사용).
 */
function courseWideBrandKey(name: string): string {
  const withoutPrefix = name.trim().replace(BRAND_PREFIX_RE, "");
  const words = stripBranchSuffix(withoutPrefix)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 2).sort().join("");
}

/**
 * 같은 체인의 다른 지점이 코스 하나에 여러 곳 들어가는 걸 막는다 —
 * 작업지시서 §3: 후쿠오카 3일 코스에 "모츠나베 라쿠텐치"가 이마이즈미
 * 총본점(1일차)·텐진본점(1일차)·니시나카스점(2일차) 세 지점으로
 * 들어간 사례. 니시나카스점은 텐진본점과 364m 떨어져 있어
 * dedupeByProximity(100~300m, 카테고리 일치 조건)도 못 잡았다 — 거리
 * 조건 자체가 없는 별도 판정이 필요하다. 거리와 무관하게 코스 전체
 * (여러 날에 걸쳐서도)에서 같은 브랜드 키는 하나만 남기고, 평점×
 * 리뷰수가 더 높은 지점을 남긴다.
 */
export function dedupeByBrand<T extends { name: string; rating?: number | null; reviewCount?: number | null }>(stops: T[]): T[] {
  const kept: T[] = [];
  const indexByBrandKey = new Map<string, number>();
  const score = (s: T) => (s.rating ?? 0) * (s.reviewCount ?? 0);
  for (const stop of stops) {
    const key = courseWideBrandKey(stop.name);
    const existingIndex = key ? indexByBrandKey.get(key) : undefined;
    if (existingIndex == null) {
      if (key) indexByBrandKey.set(key, kept.length);
      kept.push(stop);
      continue;
    }
    if (score(stop) > score(kept[existingIndex])) kept[existingIndex] = stop;
  }
  return kept;
}

// 하루 스팟 수 제약(종일시설 없는 날 기준) — 234→235→236→237을 거치며
// 거리/비율 지표만 최적화하면 이 제약이 조용히 깨질 수 있다는 게
// 반복 확인됐다(§236: capAllDayFacilityDays의 초과분이 한 날로만 쏠려
// 15곳; §237: rebalanceByDistance가 크기 제한 없이 거리만 줄이려다
// 한 날을 다시 15곳까지 불렸다) — 그래서 capAllDayFacilityDays의
// 초과분 분산과 rebalanceByDistance의 이동 둘 다 이 상한/하한을 하드
// 가드로 건다(목표가 아니라 제약으로 다룬다).
//
// 상한은 원래 8이었는데, 작업지시서 2026-09-08 "PR #238 프로덕션
// 검증" §2: days=3에서 (시설 3곳 + 일반 2일 × 8곳 =) 19곳까지 여유가
// 생겨 오히려 자리가 "딱 맞아" 떨어지는 스팟을 옮길 공간이 없었다
// (도톤보리가 난바 그룹으로 못 옮겨진 원인 — 7+8=15로 빈자리가 0).
// "하루 8곳"은 실제 여행자 기준으로도 과하다는 지적을 받아들여 6으로
// 낮췄다 — 3(시설)+6+6=15로 소구역 묶음(chunkByProximity)이 옮길
// 여유 칸이 생긴다.
const DAY_SIZE_MAX = 6;
const DAY_SIZE_MIN = 3;

// §3-1(소구역 묶음)은 "청크는 절대 안 쪼갠다"가 핵심인데, enforceChunkCap이
// DAY_SIZE_MAX(6)를 그대로 하드 상한으로 쓰면 꽉 찬 날에 들어가야 할
// 청크를 억지로 다른(지리적으로 안 맞는) 날로 떠민다 — 작업지시서
// 2026-09-08 "PR #239 프로덕션 검증" §3 실측: 난바 날이 6곳으로 꽉 차서
// `구로몬 시장`이 엉뚱한 우메다 날로 밀림. "청크를 쪼개는 것보다 한
// 곳 더 많은 게 낫다"는 지시서 원칙대로, 청크를 통째로 배정하는
// enforceChunkCap 단계에서만 상한을 7까지 허용한다. rebalanceByDistance/
// reassignByCentroid처럼 스팟을 하나씩 옮기는 단계는 청크를 쪼갤 위험이
// 없으므로 그대로 DAY_SIZE_MAX(6)를 쓴다 — 그래서 최종 결과가 7을 넘는
// 일은 없다(이 상수로 만들어진 7곳짜리 날에서 더 늘어날 방법이 없다).
const CHUNK_ASSIGN_MAX = DAY_SIZE_MAX + 1;

// 시설이 있는 날은 시설 "단독" 1곳만 둔다 — 작업지시서 2026-09-08
// "PR #239 프로덕션 검증" §2. 예전엔 동반 스팟을 1~2곳 붙였다
// (작업지시서 2026-09-06 §4-3: 시설 단독 날짜의 이동거리 0km가 편차
// 계산을 왜곡한다는 문제 때문) — 하지만 rebalanceByDistance/
// reassignByCentroid가 이미 종일시설 날짜를 편차 계산·재배정 후보
// 양쪽에서 전부 제외하도록 고쳐져(두 함수 참고) 그 문제는 해소됐다.
// 반대로 동반 스팟을 붙이면 그 스팟이 속한 소구역(청크)을 스팟 단위로
// 갈라내야 해서(청크 중 시설과 가장 가까운 것만 골라 나머지를 버림)
// §3-1의 "청크는 절대 안 쪼갠다"를 어기게 된다(실측: 난바 청크에서
// COLONY·규카츠 모토무라 난바 분점이 뽑혀 나와 도톤보리·신사이바시스지와
// 239~421m로 겹침). 시설 하나만으로 하루가 다 차는 게 여행 실감에도
// 맞다("USJ와 마린월드는 그것만으로 하루가 찹니다").
const FACILITY_DAY_SIZE = 1;

/**
 * 유니버설 스튜디오 같은 종일 시설(isLargeFacility, courseRecommend.ts —
 * 대형 테마파크·워터파크·아쿠아리움·동물원)이 배정된 날은 시설만 남기고
 * 다른 스팟은 전부 뺀다(FACILITY_DAY_SIZE 참고).
 *
 * reallocateStopsByDay가 이제 시설 몫 날짜를 소구역(청크) 배정 전에
 * 아예 따로 떼어 놓아(아래 참고) 이 함수가 실제로 손댈 동반 스팟이
 * 생기지 않는다 — 이 함수는 그 구성이 깨지지 않았는지 확인하는
 * 안전망으로 남는다. 안전망이 실제로 발동하는 드문 경우, 빠진 스팟은
 * 청크 정보 없이(이 함수는 개별 스팟만 보고 청크 경계를 모른다) 자리
 * 있는 가장 가까운 다른 날로 보낸다 — 전부 찼으면 그래도 가장 가까운
 * 곳으로(자리 없다고 스팟을 버릴 수는 없다). groups가 1개뿐이면 옮길
 * 다른 날이 없어 그대로 둔다.
 */
export function capAllDayFacilityDays<T extends GeoPoint>(groups: T[][], isFacility: (s: T) => boolean): T[][] {
  if (groups.length <= 1) return groups;
  const next = groups.map((g) => [...g]);
  groups.forEach((group, dayIndex) => {
    const facilities = group.filter(isFacility);
    if (facilities.length === 0) return;
    const others = group.filter((s) => !isFacility(s));
    if (others.length === 0) return;

    next[dayIndex] = facilities;

    others.forEach((stop) => {
      const rankedByDistance = next
        .map((g, gi) => ({ gi, g }))
        .filter(({ gi }) => gi !== dayIndex)
        .sort((a, b) => haversineKm(stop, medoidOf(a.g.length > 0 ? a.g : group)) - haversineKm(stop, medoidOf(b.g.length > 0 ? b.g : group)));
      const target = rankedByDistance.find(({ g }) => g.length < DAY_SIZE_MAX) ?? rankedByDistance[0];
      const bestDay = target ? target.gi : (dayIndex + 1) % next.length;
      next[bestDay] = [...next[bestDay], stop];
    });
  });
  return next;
}

/** 그룹 하나를 최근접 이웃 순으로 이었을 때의 총 구간 거리(km). 균형 재검사가 "이동거리" 기준으로 판단해야 해서(§5 검증 기준 자체가 거리) 개수가 아니라 이 값을 쓴다. */
function totalDistanceOf<T extends GeoPoint>(group: T[]): number {
  const ordered = orderByNearestNeighbor(group);
  let sum = 0;
  for (let i = 0; i < ordered.length - 1; i++) sum += haversineKm(ordered[i], ordered[i + 1]);
  return sum;
}

const REBALANCE_MAX_ITERATIONS = 20; // 매 반복이 개선을 확인한 뒤에만 적용되므로(아래) 넉넉히 잡아도 안전하다 — 개선이 없으면 그 전에 멈춘다.
// 자기 날짜 중심(centroid)에서 이 이상 떨어진 단독 스팟은 재균형 후보
// (옮길 스팟)에서 제외한다 — 작업지시서 2026-09-07 "PR #235 프로덕션
// 검증" §1: 다자이후(하카타에서 15km)처럼 "어느 날에 붙여도 비싼" 이상치는
// 옮겨도 그 거리가 그대로 목적지로 따라간다. 옮기지 않고 원래 클러스터가
// (차선책으로) 판단한 자리에 그대로 둔다.
const OUTLIER_MIN_KM = 10;

/** group에서 자기 날짜 중심 기준 OUTLIER_MIN_KM 이상 떨어진 스팟들의 인덱스 — 재균형 후보(옮길 스팟)에서 제외할 대상. */
function outlierIndexesOf<T extends GeoPoint>(group: T[]): Set<number> {
  if (group.length <= 1) return new Set();
  const centroid = centroidOf(group);
  const outliers = new Set<number>();
  group.forEach((s, i) => {
    if (haversineKm(s, centroid) >= OUTLIER_MIN_KM) outliers.add(i);
  });
  return outliers;
}

/**
 * capAllDayFacilityDays가 스팟을 옮기면서 깨뜨린 균형을 이동거리 기준으로
 * 다시 맞춘다 — 작업지시서 2026-09-07 "PR #234 프로덕션 검증 결과" §2가
 * 지적한 문제(clusterByLocation의 균형 잡기는 "스팟 개수"만 보는데, 그
 * 뒤 종일시설 캡이 초과분을 다른 날로 밀어내면 그 균형이 다시 깨지고
 * 아무도 재검사하지 않음)에서 출발했다.
 *
 * ⚠️ 이전 구현("가장 긴 날에서 그 날 중심에서 가장 먼 스팟 1곳을 가장
 * 짧은 날로, 무조건 옮김")은 실측(후쿠오카)에서 편차를 2.33배→11.82배로
 * 악화시켰다(작업지시서 2026-09-07 "PR #235 프로덕션 검증" §1) — 그
 * "가장 먼 스팟"이 다자이후 같은 이상치였고, 이동 거리는 스팟에 딸려
 * 다니므로 옮긴 자리에서 그 긴 거리가 그대로 재현됐다.
 *
 * ⚠️ 그다음 버전(최장/최단 "비율"이 가장 많이 줄어드는 조합을 그대로
 * 채택)도 자체 검증에서 함정이 드러났다: 두 날을 "똑같이 나쁘게" 만드는
 * 이동이, 비율만 놓고 보면 한쪽만 멀쩡하고 한쪽만 나쁜 이동보다 숫자상
 * 더 낮게(더 좋게) 나올 수 있다(예: 9.3km/9.4km ≈ 1.01배가 0.8km/0.5km
 * ≈ 1.6배보다 "비율은" 낮다 — 하지만 후자가 명백히 더 나은 결과다).
 * 그래서 목표를 "비율 최소화"가 아니라 "가장 긴 날의 절대 이동거리(최댓값)
 * 최소화"로 바꿨다 — §5 검증 기준 자체가 "가장 긴 날이 너무 길다"는
 * 문제(후쿠오카 day2 15.36km, 재배분 후 day1 25.06km)였지, 비율 자체가
 * 목적은 아니었다. 최댓값을 실제로 줄이는 이동만 채택하므로 "둘 다
 * 나쁘게 만들어 비율만 맞추는" 이동은 최댓값이 그대로거나 오히려 커져
 * 자연히 걸러진다.
 *
 * "옮기고 본다"가 아니라 "시뮬레이션해서 나아질 때만 옮긴다"이므로,
 * 결과가 시작보다 나빠지는 일은 구조적으로 불가능하다. 매 반복마다:
 * (옮길 날의 이상치 아닌 스팟) × (받을 수 있는 날 — 종일시설 있는 날
 * 제외) 전 조합을 시뮬레이션해, 그 이동을 적용했을 때 전체 날짜 중
 * 최댓값이 가장 낮아지는 조합 하나만 고른다. 그 조합조차 지금 최댓값보다
 * 나아지지 않으면(=더 줄일 방법이 없으면) 그대로 두고 멈춘다.
 *
 * ⚠️ 종일시설 날짜를 재균형 대상에서 완전히 제외한다 — 작업지시서
 * 2026-09-07 "PR #236 프로덕션 검증" §2/§3: 종일시설 날짜의 이동거리
 * 0km는 "정상"인데(하루 종일 그 시설만 도는 게 맞다), 그걸 최댓값
 * 계산에 섞으면(이전에는 안 섞었지만 최소/최댓값을 같이 보던 초기
 * 설계에서는 실제로 이 문제가 있었다) 오지도 않을 "완벽한 균형"을
 * 쫓다가 코스를 망가뜨리게 된다. 그래서 종일시설이 있는 날은 (1) 옮길
 * 대상(fromDay)에서도, (2) 받는 대상(toDay)에서도, (3) 최댓값 계산
 * 자체에서도 전부 제외한다 — 시설이 있는 날의 구성(이제 시설 하나뿐,
 * FACILITY_DAY_SIZE)을 재균형이 절대 건드리지 않는다.
 */
export function rebalanceByDistance<T extends GeoPoint>(groups: T[][], isFacility: (s: T) => boolean): T[][] {
  if (groups.length <= 1) return groups;
  const current = groups.map((g) => [...g]);

  // 종일시설이 있는 날의 거리는 편차 계산에서 아예 뺀다 — 시설 날짜
  // 구성은 이 함수 내내 바뀌지 않으므로(위 두 가드) current로 매번
  // 판정해도 항상 최신값이다.
  function nonFacilityMax(distances: number[]): number {
    const relevant = distances.filter((_, i) => !current[i].some(isFacility));
    return relevant.length > 0 ? Math.max(...relevant) : 0;
  }

  for (let iter = 0; iter < REBALANCE_MAX_ITERATIONS; iter++) {
    const distances = current.map(totalDistanceOf);
    const currentMax = nonFacilityMax(distances);

    // best를 객체 프로퍼티로 감싼다 — 중첩 클로저 안에서 재대입되는 지역
    // 변수는 TypeScript의 흐름 분석이 타입을 제대로 못 좁혀 이후 참조가
    // never로 좁혀지는 경우가 있다(실제로 겪음).
    const state: { best: { fromDay: number; stopIndex: number; toDay: number; max: number } | null } = { best: null };
    current.forEach((fromGroup, fromDay) => {
      if (fromGroup.some(isFacility)) return; // 종일시설 날짜는 구성을 그대로 지킨다 — 옮길 대상에서 제외
      // DAY_SIZE_MIN 이하로는 줄이지 않는다 — "최댓값을 아주 조금이라도
      // 줄이면 채택"하는 그리디가, 이상치가 낀 날의 나머지 동반 스팟들
      // 까지 하나씩 다 빼내 그 날을 이상치 단독(거리 0)으로 만들어버리는
      // 걸 실제로 겪었다(비율이 3000배 이상으로 폭발 — min이 0에
      // 가까워져 비율 자체가 무의미해짐). 하루 스팟 수 제약(§3, 3~8곳)의
      // 하한이기도 하다.
      if (fromGroup.length <= DAY_SIZE_MIN) return;
      const outliers = outlierIndexesOf(fromGroup);
      fromGroup.forEach((stop, stopIndex) => {
        if (outliers.has(stopIndex)) return; // 이상치는 후보에서 제외 — 어디로 옮겨도 그 거리가 따라온다
        current.forEach((toGroup, toDay) => {
          if (toDay === fromDay) return;
          if (toGroup.some(isFacility)) return; // 종일시설 날짜는 받는 쪽에서 제외 — 안 그러면 캡을 되돌리게 된다
          // DAY_SIZE_MAX 이상인 날은 더 받지 않는다 — 이 가드가 없으면
          // "거리만 줄이면 채택"하는 그리디가 한 날에 스팟을 계속
          // 몰아넣어 다시 15곳까지 불릴 수 있다(자체 검증에서 실제로
          // 재현됨 — capAllDayFacilityDays가 막아준 과밀을 재균형이
          // 다른 날에서 그대로 재현했다). 이미 그 이상인 날(생성 단계의
          // 편차)에서 더 빼내는 건 막지 않는다 — fromDay 쪽엔 이 제한이
          // 없다.
          if (toGroup.length >= DAY_SIZE_MAX) return;
          const simFrom = fromGroup.filter((_, i) => i !== stopIndex);
          const simTo = [...toGroup, stop];
          const simDistances = current.map((g, i) => (i === fromDay ? totalDistanceOf(simFrom) : i === toDay ? totalDistanceOf(simTo) : distances[i]));
          const simMax = nonFacilityMax(simDistances);
          if (!state.best || simMax < state.best.max) state.best = { fromDay, stopIndex, toDay, max: simMax };
        });
      });
    });

    if (!state.best || state.best.max >= currentMax) break; // 최댓값을 더 줄이는 조합이 없다 — 이게 핵심 안전장치.

    const { fromDay, stopIndex, toDay } = state.best;
    const [moved] = current[fromDay].splice(stopIndex, 1);
    current[toDay] = [...current[toDay], moved];
  }
  return current;
}

const MEMBERSHIP_RECHECK_MAX_ITERATIONS = 5;

/**
 * days=3처럼 종일시설 날이 하나 끼는 코스에서 전체 스팟 수가 담을 수
 * 있는 그릇보다 많으면(작업지시서 2026-09-08 "PR #238 프로덕션 검증" §2:
 * 18곳 = 시설 날 3곳 + 나머지 2일 × 8곳 = "딱 맞음") 뒤 단계(캡·재균형·
 * 소속 재검사)가 옮길 자리(자유도)를 하나도 못 만든다. 그릇 크기를
 * 넘는 만큼 평점×리뷰수가 낮은 스팟부터 뺀다(§2 "스팟을 줄일 때는
 * 평점 × 리뷰수가 낮은 것부터 빼세요").
 *
 * 시설이 있는 날은 이제 시설 하나만 담는다(FACILITY_DAY_SIZE — 작업지시서
 * 2026-09-08 "PR #239 프로덕션 검증" §2 "시설 날은 시설만 두세요") —
 * 일반 스팟이 담길 그릇은 시설 날을 뺀 나머지 날 수 × DAY_SIZE_MAX뿐이다.
 * §238 때는 시설 날에도 동반 스팟 최대 2곳(당시 FACILITY_DAY_MAX=3)이
 * 들어갈 여지가 있어 공식에 "시설 날 수 × 3 − 시설 수"라는 보정항이
 * 있었는데, 이제 시설 날의 비-시설 몫이 항상 0이라 그 보정항이 사라진다
 * (§2 각주 "trimToCapacity 공식도 시설 날 수 × 1 + 일반 날 수 × 6으로
 * 맞춰주세요"와 동치 — 시설 날 수 × 1은 시설 자신이 그대로 채우므로
 * 일반 스팟 몫에는 기여가 없다).
 *
 * 시설이 여러 날에 나뉠 수도 있지만(드묾) 흔한 경우(시설 1개, 또는
 * 날짜 수보다 시설이 많아 어쩔 수 없이 한 날에 여럿이 몰리는 극단적
 * 경우)를 가정해 시설 날 수를 min(시설 수, 날짜 수)로 잡는다 — 후자의
 * 경우 일반 스팟 몫이 0(또는 그에 가깝게)까지 줄어들 수 있는데, 이는
 * reallocateStopsByDay가 실제로 그런 날짜 구성을 만들 때(시설이 날짜
 * 수만큼 혹은 그보다 많을 때)와 정확히 같은 가정이라 어긋나지 않는다.
 */
function maxNonFacilityCapacity(dayCount: number, facilityCount: number): number {
  const facilityDayCount = Math.min(facilityCount, dayCount);
  const normalDayCount = dayCount - facilityDayCount;
  return normalDayCount * DAY_SIZE_MAX;
}

/** 넘치는 스팟을 평점×리뷰수 오름차순(낮은 것부터)으로 제거해 capacity 이내로 줄인다. 평점/리뷰수가 없으면 0으로 취급해 가장 먼저 빠진다. */
function trimToCapacity<T extends { rating?: number; reviewCount?: number }>(stops: T[], capacity: number): T[] {
  const overflow = stops.length - capacity;
  if (overflow <= 0) return stops;
  const score = (s: T) => (s.rating ?? 0) * (s.reviewCount ?? 0);
  const drop = new Set(
    [...stops]
      .sort((a, b) => score(a) - score(b))
      .slice(0, overflow),
  );
  return stops.filter((s) => !drop.has(s));
}

/**
 * 모든 배분(클러스터링·캡·초과분 분산·재균형)이 끝난 뒤, 각 스팟을
 * 자기 날의 클러스터 중심보다 다른 날의 중심이 더 가까우면 그쪽으로
 * 옮긴다 — 작업지시서 2026-09-07 "PR #237 프로덕션 검증" §2: 캡과
 * 초과분 분산·재균형을 거치며 스팟이 여러 번 옮겨다니는데, 그 뒤에
 * "이 스팟이 지금 자리가 맞는지"를 한 번도 다시 안 봤다. 실측(도톤보리가
 * 우메다 날에 남아 난바 날의 스팟 4곳과 137~587m로 겹침, 후쿠오카 시
 * 박물관이 하카타·다자이후 날에 남아 후쿠오카 타워와 415m로 겹침)이
 * 이 문제였다.
 *
 * k-메도이드의 "배정" 단계를 캡 이후에 한 번 더 도는 것뿐이다 — 새
 * 알고리즘이 아니라 이미 있는 클러스터링 원리의 재적용. 날짜 "중심"은
 * 좌표 평균이 아니라 medoidOf(실제 스팟)로 잡는다 — 작업지시서
 * 2026-09-08 "PR #238 프로덕션 검증" §3-2: 평균은 이상치(다자이후 등)
 * 때문에 허공에 찍힐 수 있고, 그 허공이 진짜 이웃(모모치 해변)보다
 * 가깝게 계산되는 사고가 실측으로 확인됐다. 종일시설 자체(닻)는 절대
 * 옮기지 않는다 — 시설 날짜는 이제 시설 하나뿐이라(FACILITY_DAY_SIZE)
 * 옮길 동반 스팟 자체가 없다. 매 반복마다 "이동하면 나아지는 폭"이
 * 가장 큰 조합 하나만 적용하고, 그런 조합이 없으면 멈춘다(최대 5회) —
 * 3~6곳(시설 날짜는 정확히 1곳) 하드 가드를 항상 지킨다.
 */
export function reassignByCentroid<T extends GeoPoint>(groups: T[][], isFacility: (s: T) => boolean): T[][] {
  if (groups.length <= 1) return groups;
  const current = groups.map((g) => [...g]);

  for (let iter = 0; iter < MEMBERSHIP_RECHECK_MAX_ITERATIONS; iter++) {
    const centers = current.map((g) => medoidOf(g));

    const state: { best: { fromDay: number; stopIndex: number; toDay: number; improvement: number } | null } = { best: null };
    current.forEach((fromGroup, fromDay) => {
      const fromMin = fromGroup.some(isFacility) ? FACILITY_DAY_SIZE : DAY_SIZE_MIN;
      if (fromGroup.length <= fromMin) return;
      fromGroup.forEach((stop, stopIndex) => {
        if (isFacility(stop)) return; // 시설 자체는 그 날의 닻 — 절대 옮기지 않는다
        const ownDist = haversineKm(stop, centers[fromDay]);
        current.forEach((toGroup, toDay) => {
          if (toDay === fromDay) return;
          const toMax = toGroup.some(isFacility) ? FACILITY_DAY_SIZE : DAY_SIZE_MAX;
          if (toGroup.length >= toMax) return; // 받을 자리가 없다
          const improvement = ownDist - haversineKm(stop, centers[toDay]);
          if (improvement > 0 && (!state.best || improvement > state.best.improvement)) {
            state.best = { fromDay, stopIndex, toDay, improvement };
          }
        });
      });
    });

    if (!state.best) break; // 지금보다 더 가까운 날이 없다 — 소속이 안정됐다.

    const { fromDay, stopIndex, toDay } = state.best;
    const [moved] = current[fromDay].splice(stopIndex, 1);
    current[toDay] = [...current[toDay], moved];
  }
  return current;
}

/**
 * 날짜별로 독립 생성된 스팟들을 지리 기준으로 재배분한다 — 위 헬퍼들의
 * 조합. 스팟 "선정"(generateDay/generateCourseV2 몫)은 건드리지 않고,
 * 이미 뽑힌 스팟들을 날짜 경계 없이 모아 다시 나눈다. days===1이면
 * 재배분할 대상(비교할 다른 날)이 없으니 브랜드·근접 중복 제거만
 * 적용한다.
 *
 * 종일시설 몫 날짜는 소구역(청크) 배정 전에 아예 따로 떼어 놓는다 —
 * 작업지시서 2026-09-08 "PR #239 프로덕션 검증" §2: 예전엔(PR #238)
 * 시설을 이미 청크 배정이 끝난 날에 나중에 얹고 capAllDayFacilityDays가
 * 스팟 단위로 동반 1~2곳만 골라 남겼는데, 그 과정에서 소구역이 스팟
 * 단위로 갈라졌다(실측: 난바 청크에서 COLONY·규카츠 모토무라 난바
 * 분점이 뽑혀 나와 도톤보리·신사이바시스지와 239~421m로 겹침). 시설
 * 몫 날짜(facilityDayCount개)를 먼저 떼어 놓고 일반 스팟은 나머지
 * 날짜에만 청크 단위로 클러스터링하면, 시설의 날에는 애초에 아무
 * 청크도 배정되지 않아 이 문제 자체가 생기지 않는다.
 */
export function reallocateStopsByDay(dayStops: FinalStop[][]): FinalStop[][] {
  if (dayStops.length === 0) return [];
  const allStops = dedupeByProximity(dedupeByBrand(dayStops.flat()));
  if (dayStops.length === 1 || allStops.length < dayStops.length) {
    // 재배분엔 그룹당 최소 1개가 필요하다 — 중복 제거로 스팟이 날짜
    // 수보다 적어지면(드묾) 그냥 하루로 합친다. 빈 날짜가 있는 것보다 낫다.
    return [allStops];
  }

  const dayCount = dayStops.length;
  const facilities = allStops.filter(isLargeFacility);
  const nonFacility = trimToCapacity(
    allStops.filter((s) => !isLargeFacility(s)),
    maxNonFacilityCapacity(dayCount, facilities.length),
  );

  let groups: FinalStop[][];
  if (nonFacility.length === 0) {
    groups = evenSplit(facilities, dayCount);
  } else if (facilities.length === 0) {
    const chunkPoints = chunkByProximity(nonFacility, CHUNK_LINK_MAX_KM).map(toChunkPoint);
    const chunkGroups = clusterByLocation(chunkPoints, dayCount, (c) => c.members.length);
    const cappedChunkGroups = enforceChunkCap(chunkGroups, CHUNK_ASSIGN_MAX);
    groups = cappedChunkGroups.map((cs) => cs.flatMap((c) => c.members));
    while (groups.length < dayCount) groups.push([]);
  } else {
    // maxNonFacilityCapacity와 같은 식으로 시설 몫 날짜 수를 잡는다
    // (그쪽 주석 참고) — 두 곳에서 다르게 계산하면 trimToCapacity가
    // 허용한 개수와 여기서 실제로 마련하는 자리 수가 어긋날 수 있다.
    const facilityDayCount = Math.min(facilities.length, dayCount);
    const normalDayCount = dayCount - facilityDayCount;

    const chunkPoints = chunkByProximity(nonFacility, CHUNK_LINK_MAX_KM).map(toChunkPoint);
    const chunkGroups = clusterByLocation(chunkPoints, normalDayCount, (c) => c.members.length);
    const cappedChunkGroups = enforceChunkCap(chunkGroups, CHUNK_ASSIGN_MAX);
    const normalGroups = cappedChunkGroups.map((cs) => cs.flatMap((c) => c.members));
    // clusterByLocation이 min(k, 청크 수)개 그룹만 만들 수 있다 — 청크
    // 수가 일반 날짜 수보다 적으면(드묾) 남는 날짜는 일단 빈 채로
    // 시작한다. rebalanceByDistance/reassignByCentroid가 빈 날짜도
    // 받을 자리로 보므로 이후 단계에서 채워질 수 있다.
    while (normalGroups.length < normalDayCount) normalGroups.push([]);

    // 시설끼리 가까우면(드묾) 한 날에 묶이지만, 보통(시설 1개)은 그
    // 자체로 독립된 한 날이 된다 — clusterByLocation(facilities, k=facilities.length)면
    // farthest-point 시딩 특성상 항상 1개씩 나뉜다.
    const facilityGroups = clusterByLocation(facilities, facilityDayCount);
    while (facilityGroups.length < facilityDayCount) facilityGroups.push([]);

    groups = [...normalGroups, ...facilityGroups];
  }

  // 안전망 — 위 구성상 시설이 있는 날엔 이미 시설만 있어야 한다(둘
  // 이상의 시설이 한 날에 묶인 경우는 예외로 남지만, 그것도 동반
  // 일반 스팟은 없으므로 여기서 손댈 게 없다).
  const capped = capAllDayFacilityDays(groups, isLargeFacility);
  const balanced = rebalanceByDistance(capped, isLargeFacility);
  const reassigned = reassignByCentroid(balanced, isLargeFacility);
  return reassigned.map((group) => orderByNearestNeighbor(group));
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
function assembleDaySpots(stops: FinalStop[], baseOrder: number, scope: CourseBriefScope, region: string, day: 1 | 2 | 3): { spots: CourseBriefSpot[]; distanceKm: number } {
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
      day,
      toNextMinutes,
      toNextMode,
    };
  });
  return { spots, distanceKm };
}

// 코스 동선이 그려진 정적 지도(작업지시서 2026-09-05 "트레쥴 다음 작업"
// §2, 2026-09-06 "지도 제공자 변경") — 블로그 글에 코스와 무관한 Pexels
// 스톡 사진 대신 이 코스만의 지도를 넣는다.
//
// 처음엔 Naver 지도 오픈API로 만들었는데, 그 API(openapi.naver.com)는
// 2019년에 서비스 종료돼 NCP(Naver Cloud Platform) Maps로 이관됐고,
// NCP Maps마저 2025-07-01부로 무료 티어가 폐지되고 신규 신청이 막혀
// 있어(사용자 확인) 쓸 수 없다. Google Static Maps로 교체 — 이미 쓰고
// 있는 GOOGLE_PLACES_API_KEY를 그대로 재사용해 새 환경변수가 필요
// 없다(Maps Static API가 같은 GCP 프로젝트에 활성화돼 있어야 하는데,
// 이건 이 세션에서 확인할 수 없다 — 아래 "검증 못 한 것" 참고).
//
// 키가 없거나 Blob 저장소가 준비 안 됐으면 조용히 null로 남긴다 —
// course-brief는 애초에 imageUrl을 선택 필드로 정의했고(작업지시서
// 2026-08-27 §1), 지도가 없다고 API 응답 자체가 막히면 안 된다.
//
// 라이브 평점 보강과 같은 이유로 이것도 "구조" 캐시 이후, 시간 예산 안의
// best-effort 단계다 — 외부 호출(Google + Blob 업로드) 하나가
// course-brief 전체를 다시 무응답으로 되돌리면 안 된다(2026-09-01
// "응답 시간" 사고를 반복하지 않는다).
const MAP_CALL_TIMEOUT_MS = 5000;
const MAP_WIDTH = 800;
const MAP_HEIGHT = 500;
const MAP_SCALE = 2; // 레티나 대응 — 실제 픽셀은 1600×1000

// Google Static Maps의 marker label은 A-Z/0-9 단일 문자만 허용한다 — 그래서
// 순서 1~9는 그대로 숫자, 10부터(최대 3일차까지 합쳐도 보통 20곳 안팎)는
// A/B/C…로 넘어간다. "번호 라벨"이라는 요청 취지는 하루 기준(보통 5~7곳)
// 케이스에서는 그대로 지켜지고, 흔치 않은 10번째 이후 스톱만 알파벳으로
// 대체된다.
function markerLabel(order: number): string {
  if (order >= 1 && order <= 9) return String(order);
  return String.fromCharCode(65 + ((order - 10) % 26));
}

// 이미지 자체에는 브랜드 표식을 넣지 않는다 — 작업지시서 2026-09-06
// "정정 및 실측" §4-5: sharp로 픽셀에 굽던 "tradule.co.kr" 워터마크를
// 제거한다. Google Static Maps 호출 자체가 프로덕션에서 403(Maps
// Static API 미활성 추정)으로 막혀 있어 워터마크 코드가 실제로 한 번도
// 실행돼 보지 못한 채 sharp 네이티브 바이너리 리스크만 지고 있었다 —
// 403이 풀려도, 브랜드 표기는 이미지 밖(블로그 HTML의 캡션 등)에서
// AutoPipeline이 붙이는 쪽이 더 단순하고 안전하다.
async function generateCourseMapImage(cacheKey: string, spots: CourseBriefSpot[]): Promise<string | null> {
  if (spots.length === 0) return null;
  // 기존 GOOGLE_PLACES_API_KEY/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY는 브라우저에도
  // 노출되는 키라 HTTP 리퍼러 제한이 걸려 있다(작업지시서 2026-09-06 "PR
  // #231 검증" §2 실측) — Places API(New)는 POST+헤더 방식이라 리퍼러
  // 제한이 적용되지 않아 정상 동작했지만, Static Maps는 GET+쿼리파라미터
  // key= 방식이라 리퍼러가 없는 서버 환경에서 그대로 403이 난다. "같은
  // 키인데 Places는 되고 Static Maps는 403"의 실제 원인이 이것이었다 —
  // Maps Static API 활성화 누락이 아니었다. 그래서 Static Maps 전용 서버
  // 키(GOOGLE_MAPS_SERVER_KEY — 애플리케이션 제한 없음, API 제한은 Maps
  // Static API만)를 새로 등록해 이 호출에만 쓴다. 기존 키로 폴백하지
  // 않는다 — 리퍼러 제한 탓에 어차피 403이 나 호출만 낭비하게 된다.
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("size", `${MAP_WIDTH}x${MAP_HEIGHT}`);
  url.searchParams.set("scale", String(MAP_SCALE));
  url.searchParams.set("key", apiKey);
  // 스톱 순서대로 번호 마커 — 한 곳당 markers 파라미터 하나(label은
  // 그룹 전체에 적용되는 속성이라 스톱마다 값이 다르면 따로 줘야 한다).
  for (const spot of spots) {
    url.searchParams.append("markers", `label:${markerLabel(spot.order)}|${spot.lat},${spot.lng}`);
  }
  // 동선을 잇는 경로선 — path는 여러 좌표를 하나의 파라미터로 잇는다.
  if (spots.length > 1) {
    const points = spots.map((s) => `${s.lat},${s.lng}`).join("|");
    url.searchParams.set("path", `color:0x0000ffcc|weight:3|${points}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAP_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[courseBrief] google staticmap ${res.status}`);
      return null;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
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

/**
 * 하루치를 생성한다 — priorDays가 비어있으면(1일차) 옵션 없이 원본 호출
 * 그대로, 아니면(2·3일차) fetchMultiDayCourse(src/lib/api.ts)와 같은
 * 원리로 이전 날짜들의 장소 id/이름/좌표 중심/음식종류를 넘겨 같은 곳이
 * 반복되지 않게 한다. 이 API엔 숙소·도착/출발 앵커 개념이 없으므로(스펙에
 * 그런 입력이 없다) 시작·종료 위치 고정 없이 매일 새로 짠다.
 *
 * 2일차부터 skipLlm을 켠다(GenerateCourseOptions.skipLlm 참고) — 작업지시서
 * 2026-09-06 "PR #231 검증" §3: 날짜 수만큼 LLM 큐레이션(Anthropic 호출,
 * 실측 8~14초/건)이 순차로 쌓이는 게 다일정 지연의 실제 원인이었다(스팟
 * 후보 조회 자체는 candidateCacheKey가 dayIndex 무관이라 이미 day 간
 * 캐시가 공유된다 — "날짜마다 스팟 조회를 처음부터 다시 한다"는 최초
 * 가설은 코드상 근거가 없었다). 블로그 글의 대표 코스인 1일차만 LLM
 * 큐레이션 품질을 유지한다.
 */
async function generateDay(scope: CourseBriefScope, region: string, dayIndex: number, priorDays: FinalStop[][]): Promise<FinalStop[]> {
  const priorStops = priorDays.flat();
  let result: GenerateResultV2 | { course: []; source: "mock"; theme: CourseTheme };
  try {
    result =
      priorDays.length === 0
        ? await generateCourseV2(scope, region, DEFAULT_THEME, DEFAULT_RADIUS, {})
        : await generateCourseV2(scope, region, DEFAULT_THEME, DEFAULT_RADIUS, {
            excludeIds: new Set(priorStops.map((s) => s.id)),
            excludeNames: priorStops.map((s) => s.name),
            avoidCentroid: { lat: priorStops.reduce((sum, s) => sum + s.lat, 0) / priorStops.length, lng: priorStops.reduce((sum, s) => sum + s.lng, 0) / priorStops.length },
            avoidCuisines: [...new Set(priorStops.map((s) => cuisineKeyword(s.name)).filter((c): c is string => Boolean(c)))],
            dayIndex,
            skipLlm: true,
          });
  } catch (err) {
    console.error(`[courseBrief] day${dayIndex + 1} generateCourseV2 threw:`, err);
    result = { course: [], source: "mock", theme: DEFAULT_THEME };
  }
  // 같은 날짜 안의 중복(예: "경주 황리단길"/"황리단길")도 여기서 한 번 거른다.
  const deduped = dedupeWithinList(stopsOf(result), scope, region);
  if (priorDays.length === 0) return deduped;
  // excludeIds/excludeNames는 정확히 같은 id/문자열일 때만 걸러 날짜를
  // 넘나드는 "이름만 다른 같은 곳"까지는 못 잡는다 — 여기서 한 번 더 거른다.
  return dedupeCrossDay(priorDays, deduped, region);
}

export async function buildBrief(scope: CourseBriefScope, region: string, days: 1 | 2 | 3, cacheKey: string, enrichBudgetMs: number = DEFAULT_ENRICH_BUDGET_MS): Promise<CourseBrief> {
  const appUrl = appUrlFor(region, days);

  // 실패해도 절대 던지지 않는다(스펙 §1 "에러를 던지지 말 것") — 빈
  // spots로 조용히 폴백해 AutoPipeline이 그 지역을 건너뛰게 한다. 어느
  // 날짜든 비면(특히 1일차) 그 다음 날짜는 시도하지 않는다 — 기존
  // 2일차 로직(day1Stops.length===0이면 2일차 생략)의 일반화.
  const dayStops: FinalStop[][] = [];
  for (let i = 0; i < days; i++) {
    const stops = await generateDay(scope, region, i, dayStops);
    if (stops.length === 0) break;
    dayStops.push(stops);
  }

  // 스팟 선정은 위까지 끝났다 — 이제 "어느 날·어느 순서로 방문할지"만
  // 좌표 기준으로 다시 정한다(작업지시서 2026-09-06 "일자 배분이
  // 지리적으로 나뉘지 않습니다" 참고, reallocateStopsByDay 주석).
  const finalDayGroups = reallocateStopsByDay(dayStops);

  let baseOrder = 1;
  let totalDistanceKm = 0;
  const allSpots: CourseBriefSpot[] = [];
  finalDayGroups.forEach((stops, i) => {
    const { spots, distanceKm } = assembleDaySpots(stops, baseOrder, scope, region, (i + 1) as 1 | 2 | 3);
    allSpots.push(...spots);
    totalDistanceKm += distanceKm;
    baseOrder += spots.length;
  });
  // 요청한 days보다 실제로 채워진 날짜 수가 적을 수 있다(1일차부터 비면
  // dayStops가 아예 비고, 이 경우도 최소 1일로 보고한다 — 기존 동작 유지).
  const actualDays = Math.max(1, finalDayGroups.length) as 1 | 2 | 3;
  let brief: CourseBrief = { region, days: actualDays, totalDistanceKm: round1(totalDistanceKm), spots: allSpots, imageUrl: null, appUrl, ratingSource: "google" };

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
export async function getCourseBrief(region: string, days: 1 | 2 | 3, enrichBudgetMs: number = DEFAULT_ENRICH_BUDGET_MS): Promise<CourseBrief> {
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
export interface WarmTask {
  region: string;
  days: 1 | 2 | 3;
}

/**
 * (region, days) 단위로 일반화한 버전 — 작업지시서 2026-09-06 "정정 및
 * 실측" §4-4 "워밍 대상에 days=2 포함", 같은 날짜 "승격 후 실측" §7-4
 * "워밍 대상에 days=3 추가"에 대응. 해외는 AutoPipeline의 상식 게이트
 * (REGION_PROFILES, "해외는 minDays>=2가 하드 규칙")상 하루 코스로는
 * 애초에 안 쓰이므로, 워밍 크론이 국내는 days=1을, 해외는 days=2·3을
 * 태스크로 넘긴다.
 */
export async function pickStaleTasks(tasks: WarmTask[], limit: number): Promise<WarmTask[]> {
  const keys = tasks.map((t) => briefCacheKey(resolveScope(t.region), t.region, t.days));
  const result = await pool.query<{ cache_key: string; created_at: string }>(
    `select cache_key, created_at from place_candidate_cache where cache_key = any($1)`,
    [keys],
  );
  const createdAtByKey = new Map(result.rows.map((row) => [row.cache_key, new Date(row.created_at).getTime()]));
  return tasks
    .map((task, i) => ({ task, age: createdAtByKey.get(keys[i]) ?? -Infinity })) // 캐시 없음 = 가장 오래된 것으로 취급(맨 앞으로)
    .sort((a, b) => a.age - b.age)
    .slice(0, limit)
    .map((x) => x.task);
}
