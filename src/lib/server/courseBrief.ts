import { put } from "@vercel/blob";
import { pool } from "@/lib/server/db";
import { generateCourseV2, type FinalStop, type GenerateResultV2 } from "@/lib/server/courseRecommendV2";
import { decodePolyline, encodePolyline, haversineKm } from "@/lib/server/courseRoute";
import { MODE_SPEED_KMH, cuisineKeyword, googleTop, isLargeFacility, sameShop, stripBranchSuffix, type CourseTheme, type TravelMode, type TravelRadius } from "@/lib/server/courseRecommend";
import { liveCategoryBucket } from "@/lib/liveCategoryBucket";
import { allSpots, DOMESTIC_LOCALITY_NAMES, OVERSEAS_LOCALITY_NAMES, resolveRegionAlias, styleForRegion, type RegionStyle } from "@/lib/discoverData";
import { isDomesticCoordinate } from "@/lib/maps/regionForCoords";
import { routeLegColorStaticParam } from "@/lib/mapRouteColors";

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

// 작업지시서 2026-09-23 "자동 코스 일수 확장(도시형 5일·휴양형 7일)" §1·§6 —
// 3일 상한(D-053)은 알고리즘 한계가 아니라 이 타입의 하드코딩된 범위였다.
// 도시형 최대 5일(4박5일), 휴양형 최대 7일(5박7일)까지 넓힌다 — 실제
// 상한 검사는 maxDaysForStyle()이 스타일별로 한다(이 타입 자체는 "이
// 시스템이 다루는 범위"만 표현한다).
export type CourseDays = 1 | 2 | 3 | 4 | 5 | 6 | 7;

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
  day: CourseDays;
  toNextMinutes: number | null;
  toNextMode: TravelMode;
}

export interface CourseBrief {
  region: string;
  days: CourseDays;
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
  /**
   * totalDistanceKm/toNextMinutes가 실제 경로(route) 기준인지, 하나라도
   * 실제 경로를 못 구해 직선거리(straight)로 대체됐는지 — 작업지시서
   * 2026-09-11 "해외 경로가 조용히 직선으로 떨어지고 있습니다" §3:
   * 실패해도 조용히 직선으로 폴백해 사흘 동안 해외 코스가 잘못된
   * 수치로 블로그에 발행된 것을 알아챌 수 없었다. 도보 구간(모빌리티
   * API가 애초에 다루지 않는, 의도된 폴백)은 "실패"로 안 세고, 그 외
   * 구간이 하나라도 직선으로 대체됐으면 "straight". AutoPipeline이 이
   * 필드를 보고 "직선거리 기준" 표기를 자동으로 붙일 수 있다.
   */
  distanceSource: "route" | "straight";
  /**
   * 일차별 이동 거리·스팟 수 — 작업지시서 2026-09-15 "og:image가
   * 404입니다" §4: AutoPipeline(지식iN 답변·블로그)이 "**1일차 (총 N
   * km)**" 같은 일차별 표기를 쓰고 싶어 하는데, 지금까지는 전체 합산
   * (totalDistanceKm)만 있어 1일 코스에서만 그 표기를 쓸 수 있었다.
   * assembleDaySpots가 이미 날짜별로 거리를 나눠 계산해두므로 합산만
   * 했다 — 클라이언트가 좌표로 추정하면 직선거리가 되어 부정확하다.
   * 권역명(예: "도심", "항만")은 넣지 않는다 — 지시서 §4: 사람이 붙이는
   * 이름이라 자동 판정하면 틀린다.
   */
  dayTotals: { day: CourseDays; distanceKm: number; spotCount: number }[];
}

const DEFAULT_THEME: CourseTheme = "balanced";
const DEFAULT_RADIUS: TravelRadius = 60;

export function resolveScope(region: string): CourseBriefScope {
  // OVERSEAS_LOCALITY_NAMES(discoverData.ts) — 이미 검증된 카탈로그의
  // 부산물이라 새로 만든 판정 로직이 아니다. 못 찾으면 국내로 취급한다
  // (기존 코스 만들기 화면의 기본 스코프와 동일).
  return OVERSEAS_LOCALITY_NAMES.has(region) ? "overseas" : "domestic";
}

/**
 * region이 이 앱이 실제로 아는 지역(국내/해외 정본 목록 — /api/content/regions와
 * 같은 소스)인지 확인한다. 작업지시서 2026-09-14 "미지원 지역이 엉뚱한
 * 동명 지역으로 바뀝니다" §1/§3 — resolveScope는 모르는 이름을 전부
 * "국내"로 기본 취급하다 보니, "발리"처럼 우리 카탈로그엔 없는 해외
 * 지명이 국내 라이브 검색(Kakao)으로 조용히 넘어가 우연히 같은 이름의
 * 국내 동네·상호(울산 온양읍 발리)와 매칭돼버렸다 — "데이터가 없는
 * 것보다 나쁜", 자신 있게 틀린 응답이었다. getCourseBrief가 이 함수로
 * 먼저 걸러 generateCourseV2를 아예 부르지 않는다.
 */
export function isSupportedRegion(region: string): boolean {
  return DOMESTIC_LOCALITY_NAMES.has(region) || OVERSEAS_LOCALITY_NAMES.has(region);
}

/**
 * getCourseBrief가 region을 지원하지 않는다고 판단하면 던진다 —
 * isSupportedRegion 실패(§3 1번) 또는 해외로 인식된 요청인데 실제 결과
 * 좌표가 한반도 안인 경우(§3 "최소한 이것만이라도") 둘 다 여기로 모인다.
 * 호출부(각 route.ts)가 이 타입을 캐치해 각자의 관례대로(JSON 거부 또는
 * course-open의 코스 만들기 화면 리다이렉트) 처리한다.
 */
export class UnsupportedRegionError extends Error {
  constructor(public readonly region: string) {
    super(`unsupported region: ${region}`);
    this.name = "UnsupportedRegionError";
  }
}

/**
 * §3 "최소한 이것만이라도" — isSupportedRegion을 통과한(=해외 카탈로그에
 * 있는) 이름이라도, 실제 라이브 검색 결과 좌표가 전부 한반도 안이면
 * 이름만 맞고 완전히 다른 곳을 찾아온 것일 가능성이 크다. 순수 함수로
 * 뽑아둬야 buildBrief의 나머지 I/O(경로 조회·지도 생성·DB 캐시)를 몰라도
 * 단위 테스트로 확인할 수 있다.
 */
export function looksLikeMismatchedOverseasResult(scope: CourseBriefScope, spots: GeoPoint[]): boolean {
  return scope === "overseas" && spots.length > 0 && spots.every((s) => isDomesticCoordinate(s.lat, s.lng));
}

// 세 라우트(course-brief/course-map/course-open)가 공통으로 쓰는 days
// 파싱 — 작업지시서 2026-09-06 "승격 후 실측" §7-5: 승격 전 프로덕션이
// days=3 요청을 조용히 days=1로 깎아 응답했다("지원하지 않는 값은 조용히
// 축소하지 말고 400으로 거절"). 값이 없으면(생략) 1을 기본값으로 쓴다.
//
// 작업지시서 2026-09-23 "자동 코스 일수 확장(도시형 5일·휴양형 7일)" §1·§6 —
// 1~3 하드코딩을 1~7로 넓힌다. 여기서는 형식(1~7 정수인지)만 본다 —
// 스타일별 상한(도시형 5·휴양형 7)은 지역을 알아야 판단할 수 있어 이
// 함수의 책임 밖이다(호출부가 maxDaysForStyle로 별도 확인한다).
export function parseDays(value: string | null): CourseDays | null {
  if (value == null) return 1;
  if (/^[1-7]$/.test(value)) return Number(value) as CourseDays;
  return null;
}

/**
 * 스타일별 최대 일수 — 작업지시서 §1: "도시형 하루 4~5곳을 돌면 4~5일이면
 * 대부분 다 봄", "휴양형은 5박7일이 흔함". D-053의 sanitizeDaysAgainstTripData
 * 는 AutoPipeline 쪽(별도 저장소) 로직이라 여기서 건드리지 않는다 — 이
 * 함수는 트레쥴 API 자체의 상한만 정한다.
 */
export function maxDaysForStyle(style: RegionStyle): CourseDays {
  return style === "resort" ? 7 : 5;
}

/**
 * 작업지시서 §4 표(정확히 그대로 구현) — city: days×4, resort: days×2,
 * 공통 바닥값 3(1일짜리조차 스팟 3곳 미만이면 애초에 코스라고 부르기
 * 어렵다는 기존 MIN_VIABLE_SPOTS 전제는 스타일과 무관하게 유지).
 *
 * ⚠️ city는 days=1부터 기존 고정값(MIN_VIABLE_SPOTS=3)보다 엄격해진다
 * (1일=4, 2일=8, 3일=12) — 기존 3이라는 바닥은 "도시형 하루 4~5곳"이라는
 * 실제 목표치보다 낮게 잡혀 있었을 뿐, 이 지시서가 그 기준 자체를
 * 올리라고 명시했다(§4 표). 그래서 이 변경은 기존 city 2·3일 요청 중
 * 일부(스팟 수가 새 기준에 못 미치던 지역)를 insufficient_spots로
 * 새로 거절할 수 있다 — 이 세션은 실제 지역별 스팟 수 분포를 라이브로
 * 확인할 수 없어 그 영향 범위를 가늠하지 못했다. resort는 days=1에서만
 * 바닥값(3)이 적용되고(2×1=2 < 3), 그 이상은 기존과 무관하게 새 기준
 * (2×days)을 따른다.
 */
export function minViableSpots(style: RegionStyle, days: CourseDays): number {
  const perDay = style === "resort" ? 2 : 4;
  return Math.max(MIN_VIABLE_SPOTS, perDay * days);
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
export function appUrlFor(region: string, days: CourseDays): string {
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
export const COURSE_ALGO_VERSION = 10; // 작업지시서 2026-09-23 "ASCII 라우트가 증명했습니다 + 기존 실패 캐시를 비워주세요" §2 — preferRatedFirstStop(1번 자리 평점 우선)과 실패 캐시 금지(isCacheableBrief)가 캐시 키에 반영되지 않아, 이미 채워진 옛 캐시(예: 경주 d3의 1번 스팟이 여전히 "경주원조콩국 ★없음", 고베/교토/오사카의 스팟 부족 422)가 그대로 남아 있었다. 버전을 올려 한 번에 무효화한다 — 다음 워밍 크론(또는 수동 실행)이 새 로직으로 다시 채운다.

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
export function isFreshBriefPayload(payload: CourseBrief): boolean {
  if (typeof payload.ratingSource !== "string") return false;
  if (typeof payload.distanceSource !== "string") return false;
  if (!Array.isArray(payload.spots)) return false;
  if (!Array.isArray(payload.dayTotals)) return false; // 작업지시서 2026-09-15 §4 — 이 필드가 생기기 전 캐시는 미스로 취급한다.
  // 작업지시서 2026-09-23 "ASCII 라우트가 증명했습니다 + 기존 실패 캐시를
  // 비워주세요" §3 — isCacheableBrief(쓰기 경로, #268)는 앞으로 스팟 부족
  // brief가 캐시에 새로 들어가는 것만 막는다. 이미 들어간 빈약한 brief는
  // 읽기 경로에서 계속 그대로 반환돼 route가 다시 422를 낸다(고베
  // d2·교토 d1·오사카 d2). 여기서도 같은 기준으로 걸러 캐시 미스로
  // 취급해야 재생성된다. 작업지시서 2026-09-23 "자동 코스 일수 확장
  // (도시형 5일·휴양형 7일)" §4 이후로는 그 기준이 스타일·일수에 따라
  // 다르다(minViableSpots) — payload 자체에 region/days가 이미 있어
  // 별도 인자 없이 여기서 구할 수 있다.
  if (payload.spots.length < minViableSpots(styleForRegion(payload.region), payload.days)) return false;
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
export function modeForDistance(km: number, scope: CourseBriefScope): TravelMode {
  if (km < WALK_MAX_KM) return "walk";
  if (km <= TRANSIT_OR_CAR_MAX_KM) return scope === "overseas" ? "transit" : "car";
  return "car";
}

// ---------------------------------------------------------------- 실제 경로 조회
//
// 작업지시서 2026-09-08 "이동 거리·시간이 직선거리입니다": totalDistanceKm/
// toNextMinutes가 하버사인(직선) 거리를 고정 속도(MODE_SPEED_KMH)로 나눈
// 추정값이었다 — 통영 "사량도 → 중앙활어시장 21km, 차량 51분"처럼 실제로는
// 배로만 갈 수 있는 구간도 차로 갈 수 있다고 단언해버렸다(직선 21km ÷
// 24.8km/h). 국내는 카카오모빌리티 길찾기(자동차), 해외는 Google
// Directions API로 실제 경로의 거리·소요시간·폴리라인을 받는다.
//
// 도보 구간(WALK_MAX_KM 이하)은 실경로 조회 대상이 아니다 — 카카오
// 모빌리티는 자동차 경로만 제공하고, 짧은 도보 구간까지 매 요청마다
// API를 태우는 건 이 지시서의 핵심 문제(사량도류 오판)에 비해 비용
// 대비 효과가 낮다. 기존처럼 직선 ÷ 도보 속도 추정을 그대로 쓴다.

const ROUTE_CALL_TIMEOUT_MS = 4000;
// 한 코스(모든 날짜 합산) 전체의 실제 경로 조회에 쓸 수 있는 총 시간 —
// 이걸 넘기면 남은 구간은 실패로 보지 않고(스팟을 지우지 않고) 그냥
// 직선 추정으로 폴백한다. liveEnrichSpots의 enrichBudgetMs와 같은
// "예산 초과는 무응답이 아니라 조용한 성능 저하"원칙(작업지시서
// 2026-09-01 §2-1)을 여기도 적용한다 — 구조 캐시를 쓰기 전 단계라
// 여기서 무한정 기다리면 응답 자체가 늦어진다.
const ROUTING_BUDGET_MS = 15000;
// 작업지시서 2026-09-23 "자동 코스 일수 확장(도시형 5일·휴양형 7일)" §5 —
// 위 고정값은 기존 최대 3일(약 10구간) 기준으로 실측·검증된 값이다.
// 최대 일수가 5·7일로 늘면 구간 수도 그만큼 늘어(도시형 5일 약 20구간,
// 휴양형 7일 약 14구간 — 지시서 §5 자체 추산) 같은 예산을 나눠 쓰면
// 뒤쪽 구간일수록 예산 초과로 직선 추정 폴백이 잦아진다. 구간 수에
// 비례해 늘리되, 기존 1~3일 실측 검증치(15초) 밑으로는 절대 줄지
// 않는다 — ROUTING_BUDGET_MS_PER_SEGMENT는 15000ms÷약 10구간(3일 기준)의
// 근사치다. 실제 늘어난 예산이 충분한지는 이 세션이 라이브로 확인하지
// 못했다(§7 "먼저 재보라"는 실측 지시를 배포 환경 접근 없이 수행할 수
// 없었다) — Cowork가 배포 후 확인해야 한다.
const ROUTING_BUDGET_MS_PER_SEGMENT = 1500;
// 작업지시서 §3 ★ "소요시간이 비정상적으로 큼(예: 3시간 초과)" — 실제
// 경로가 잡히더라도 이 이상이면 사실상 당일 코스에 못 낄 곳으로 보고
// 뺀다(예: 육로로 크게 돌아가야 하는 곳).
const MAX_SEGMENT_MINUTES = 180;

export interface RouteMeasurement {
  distanceKm: number;
  durationMinutes: number;
  /** 정적 지도 path= 파라미터 값(색상·굵기·좌표 전부 포함) — 실제 경로 폴리라인이 있으면 그걸, 없으면 두 지점을 잇는 직선을 쓴다. */
  mapPath: string;
  /**
   * 실제 도로를 따라가는 좌표열 — mapPath와 달리 Static Maps 전용 문자열이
   * 아니라 지도 SDK(Google/Kakao) Polyline에 바로 넘길 수 있는 배열이다.
   * 작업지시서 2026-09-11 "계획 탭 동선을 실제 경로로" §3 — /api/routes가
   * 이 필드를 그대로 클라이언트에 돌려준다. 실제 경로를 못 구해 직선으로
   * 폴백한 경우(straightRouteMeasurement)는 null — "이 거리·시간은 진짜
   * 경로 값이 아니다"를 이 필드 하나로 구분할 수 있게 한다.
   */
  points: { lat: number; lng: number }[] | null;
}
export interface RouteResult extends RouteMeasurement {
  mode: TravelMode;
}

// mapPathParam/mapPathParamEncoded가 세그먼트를 만드는 시점엔 아직 "몇
// 일차"인지 모른다(둘 다 leg 하나만 보고 호출되는 leg 단위 함수라서) —
// 일단 이 기본색으로 찍어두고, 날짜별로 다 모인 뒤(buildBrief의
// routedDays.forEach)에 recolorMapPathForDay가 실제 팔레트 색으로
// 되칠한다. 작업지시서 2026-09-15 "공유 품질 4건" §3 참고.
const DEFAULT_MAP_PATH_COLOR = "0x0000ffcc";

/** Static Maps path= 값 하나를 좌표 목록으로 만든다 — 점 2개짜리 직선 폴백(straightRouteMeasurement)처럼 애초에 짧은 경우에만 쓴다. */
export function mapPathParam(points: GeoPoint[]): string {
  const coords = points.map((p) => `${p.lat},${p.lng}`).join("|");
  return `color:${DEFAULT_MAP_PATH_COLOR}|weight:3|${coords}`;
}

/**
 * Static Maps path= 값을 인코딩된 폴리라인으로 만든다 — mapPathParam과
 * 달리 좌표를 그대로 나열하지 않아 점이 많아도 훨씬 짧다. 작업지시서
 * 2026-09-11 "해외 경로 해결 / 지도 이미지가 전부 사라졌습니다" §2:
 * 카카오 실제 경로(수십 점)가 raw 좌표 나열이라 URL 길이 상한(8,192자)을
 * 넘겨 지도 자체가 통째로 안 만들어지는 원인이었다. 구글 경로는
 * Directions API가 애초에 인코딩된 형태를 줘서 이 문제가 없었다.
 */
export function mapPathParamEncoded(points: GeoPoint[]): string {
  return `color:${DEFAULT_MAP_PATH_COLOR}|weight:3|enc:${encodePolyline(points)}`;
}

/**
 * mapPathParam(Encoded)가 찍어둔 기본색을 날짜 인덱스에 맞는 팔레트
 * 색으로 되칠한다 — 작업지시서 2026-09-15 "공유 품질 4건" §3: "날짜가
 * 다르면 색 계열도 다르게 해주세요. 3일 계획이면 하루씩 구분돼야
 * 합니다". 세그먼트를 만드는 leg 단위 함수들(mapPathParam 등)의
 * 시그니처를 바꿔 day 인덱스를 전달하는 대신(그 함수들은 여러 곳에서
 * leg 단위로 재사용되고 이미 단위 테스트로 고정돼 있다), 날짜별로 다
 * 모인 뒤 이 순수 함수 하나로 문자열을 치환하는 쪽이 훨씬 적은 변경으로
 * 같은 결과를 낸다.
 */
export function recolorMapPathForDay(mapPath: string, dayIndex: number): string {
  return mapPath.replace(DEFAULT_MAP_PATH_COLOR, routeLegColorStaticParam(dayIndex));
}

// 작업지시서 2026-09-15 "도보 구간이 직선으로 그려집니다" §5 — Static
// Maps는 점선을 못 그리니 색을 흐리게 해서 "이 구간은 추정"을 표시한다.
// 요일별 팔레트(recolorMapPathForDay)보다 우선한다 — 실제 경로인지
// 여부가 어느 날짜인지보다 더 중요한 신호라, 추정 구간은 날짜와
// 무관하게 항상 이 회색을 쓴다.
const ESTIMATED_MAP_PATH_COLOR = "0x9e9e9e88";

export function recolorMapPathAsEstimated(mapPath: string): string {
  return mapPath.replace(DEFAULT_MAP_PATH_COLOR, ESTIMATED_MAP_PATH_COLOR);
}

// 카카오 vertexes/구글 상세 경로는 도로 하나당 점이 수십~수백 개라
// 일정 간격으로 솎아낸다(양 끝은 항상 포함해 경로가 끊겨 보이지 않게
// 한다) — 인코딩(위 mapPathParamEncoded)으로 이미 짧아지지만, 여러 날짜·
// 여러 구간이 한 지도에 다 들어가는 course-brief 지도는 그래도 값이
// 몇 배로 쌓일 수 있어 상한을 더 보수적으로 낮춘다(작업지시서 §2:
// "그래도 길면 60 → 25로").
const MAX_MAP_PATH_POINTS = 25;
export function simplifyPath(points: GeoPoint[]): GeoPoint[] {
  if (points.length <= MAX_MAP_PATH_POINTS) return points;
  const step = (points.length - 1) / (MAX_MAP_PATH_POINTS - 1);
  return Array.from({ length: MAX_MAP_PATH_POINTS }, (_, i) => points[Math.round(i * step)]);
}

export function straightRouteMeasurement(a: GeoPoint, b: GeoPoint, mode: TravelMode): RouteResult {
  const km = haversineKm(a, b);
  return { distanceKm: km, durationMinutes: minutesForKm(km, mode), mapPath: mapPathParam([a, b]), points: null, mode };
}

/** 실측(거리·소요시간)에 §3 ★ "3시간 초과" 상한을 적용한다 — 넘으면 "no-route"(그 스팟을 코스에서 뺀다). */
export function applyDurationCap(measurement: RouteMeasurement, mode: TravelMode): RouteResult | "no-route" {
  if (measurement.durationMinutes > MAX_SEGMENT_MINUTES) return "no-route";
  return { ...measurement, mode };
}

const KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";

/** 로그에 남길 "구간 좌표" 표기 — fetchKakaoDrivingRoute/fetchGoogleDirectionsRoute 실패 로그에서 공통으로 쓴다. */
function legCoordsLabel(a: GeoPoint, b: GeoPoint): string {
  return `${a.lat},${a.lng}->${b.lat},${b.lng}`;
}

/**
 * 국내 자동차 구간의 실제 경로 — 카카오모빌리티 길찾기(자동차 전용).
 * 응답이 없거나(네트워크 오류·타임아웃·API 키 미설정 등) result_code가
 * "이 장소 자체에 대한 판단이 아닌" 경우는 null을 돌려줘 호출부가 직선
 * 추정으로 폴백하게 한다(liveDomesticRatingFor와 같은 원칙 — "확인
 * 못 함"과 "확인했더니 안 됨"을 구분한다). result_code가 명확히
 * "경로 없음"(1: 경로 탐색 실패, 2: 그래프 생성 실패 — 사량도처럼
 * 도로망 자체가 없는 경우가 여기 해당)일 때만 "no-route"를 돌려줘
 * 그 스팟을 코스에서 빼도록 한다.
 */
export async function fetchKakaoDrivingRoute(a: GeoPoint, b: GeoPoint): Promise<RouteMeasurement | "no-route" | null> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return null;
  const url = new URL(KAKAO_DIRECTIONS_URL);
  url.searchParams.set("origin", `${a.lng},${a.lat}`);
  url.searchParams.set("destination", `${b.lng},${b.lat}`);
  url.searchParams.set("priority", "RECOMMEND");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` }, signal: controller.signal });
    if (!res.ok) {
      // 작업지시서 2026-09-11 "해외 경로 해결 / 지도 이미지가 전부
      // 사라졌습니다" §3 — 실패해도 null만 돌아오고 왜 실패했는지
      // 아무 데도 안 남던 것을 고친다.
      console.warn(`[courseBrief] kakao directions http ${res.status} for ${legCoordsLabel(a, b)}`);
      return null;
    }
    const data = (await res.json()) as {
      routes?: Array<{
        result_code: number;
        result_msg?: string;
        summary?: { distance: number; duration: number };
        sections?: Array<{ roads?: Array<{ vertexes?: number[] }> }>;
      }>;
    };
    const route = data.routes?.[0];
    if (!route) return null;
    if (route.result_code !== 0) {
      if (route.result_code === 1 || route.result_code === 2) return "no-route"; // 확정적 "경로 없음" — 이건 실패가 아니라 정상적인 판정이라 로그 대상이 아니다
      console.warn(`[courseBrief] kakao directions result_code=${route.result_code} (${route.result_msg ?? "no result_msg"}) for ${legCoordsLabel(a, b)}`);
      return null;
    }
    if (!route.summary) return null;
    // vertexes는 [lng, lat, lng, lat, ...] 평면 배열이 도로(section.roads[])
    // 마다 나뉘어 있다 — 전부 이어 붙여 하나의 경로 좌표열로 만든다.
    const flatVertexes = (route.sections ?? []).flatMap((s) => (s.roads ?? []).flatMap((r) => r.vertexes ?? []));
    const points: GeoPoint[] = [];
    for (let i = 0; i + 1 < flatVertexes.length; i += 2) points.push({ lng: flatVertexes[i], lat: flatVertexes[i + 1] });
    const simplified = simplifyPath(points.length > 0 ? points : [a, b]);
    return {
      distanceKm: route.summary.distance / 1000,
      durationMinutes: Math.round(route.summary.duration / 60),
      mapPath: mapPathParamEncoded(simplified), // raw 나열(mapPathParam)이면 URL 길이 상한을 넘긴다 — §2 참고
      points: simplified,
    };
  } catch (err) {
    console.warn(`[courseBrief] kakao directions request failed for ${legCoordsLabel(a, b)}:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const GOOGLE_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";

/**
 * 해외 구간의 실제 경로 — Google Directions API. GOOGLE_MAPS_SERVER_KEY
 * (Static Maps 전용으로 이미 등록된, 리퍼러 제한 없는 서버 키 —
 * generateCourseMapImage 주석 참고)를 재사용한다.
 *
 * 이 키는 원래 GCP 콘솔에서 "Maps Static API만" 허용하도록 API 제한이
 * 걸려 있어 REQUEST_DENIED로 막혀 있었다 — 작업지시서 2026-09-11 "해외
 * 경로 해결 / 지도 이미지가 전부 사라졌습니다" §1: 그 허용 목록에
 * Directions API를 추가한 뒤(GCP 콘솔 작업, 코드 밖) 전파 완료 후
 * 정상 작동이 실측으로 확인됐다. REQUEST_DENIED를 포함해 상태가
 * OK/ZERO_RESULTS/NOT_FOUND가 아닌 모든 경우는 여전히 "이 장소 판단이
 * 아님"으로 처리해 직선 추정으로 폴백한다(조용히 저하될 뿐 응답 자체가
 * 깨지진 않는다) — 다만 이제 그 이유(status·error_message)를 로그로
 * 남긴다(§3: "그 한 줄만 로그에 있었으면 10분 만에 끝났을 일").
 */
export async function fetchGoogleDirectionsRoute(a: GeoPoint, b: GeoPoint, mode: "walking" | "transit" | "driving"): Promise<RouteMeasurement | "no-route" | null> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) return null;
  const url = new URL(GOOGLE_DIRECTIONS_URL);
  url.searchParams.set("origin", `${a.lat},${a.lng}`);
  url.searchParams.set("destination", `${b.lat},${b.lng}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("key", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[courseBrief] google directions http ${res.status} for ${legCoordsLabel(a, b)}`);
      return null;
    }
    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      routes?: Array<{ legs?: Array<{ distance?: { value: number }; duration?: { value: number } }>; overview_polyline?: { points: string } }>;
    };
    if (data.status === "ZERO_RESULTS" || data.status === "NOT_FOUND") return "no-route";
    if (data.status !== "OK") {
      // OVER_QUERY_LIMIT/REQUEST_DENIED/UNKNOWN_ERROR 등 — 이 장소
      // 판단이 아니다. error_message에 구글이 거부 이유를 정확히
      // 적어준다(예: "REQUEST_DENIED: API not authorized") — 이걸
      // 로그에 안 남겨 GCP 키 제한 문제를 추적하는 데 2시간 가까이
      // 걸렸다(§3).
      console.warn(`[courseBrief] google directions status=${data.status} (${data.error_message ?? "no error_message"}) for ${legCoordsLabel(a, b)}`);
      return null;
    }
    const route = data.routes?.[0];
    const leg = route?.legs?.[0];
    if (!route || !leg?.distance || !leg?.duration) return null;
    const encoded = route.overview_polyline?.points;
    const points = simplifyPath(encoded ? decodePolyline(encoded) : [a, b]);
    return {
      distanceKm: leg.distance.value / 1000,
      durationMinutes: Math.round(leg.duration.value / 60),
      mapPath: encoded ? `color:${DEFAULT_MAP_PATH_COLOR}|weight:3|enc:${encoded}` : mapPathParam([a, b]),
      points,
    };
  } catch (err) {
    console.warn(`[courseBrief] google directions request failed for ${legCoordsLabel(a, b)}:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * scope·mode에 맞는 실제 경로 조회로 라우팅하고, 확정적으로 "경로 없음"이면
 * "no-route"를, 그 외(타임아웃 등 판단 보류 포함)엔 직선 추정을 돌려준다.
 *
 * 도보(mode==="walk")는 원래 실경로 조회 대상이 아니었다(카카오모빌리티는
 * 자동차 전용, 국내는 애초에 API가 없다) — 그런데 이 가정을 해외에도
 * 그대로 적용해온 게 문제였다: 작업지시서 2026-09-15 "도보 구간이
 * 직선으로 그려집니다" §3 실측 — Google DirectionsService를 직접
 * 불러보니 해외(예: 후쿠오카)는 도보 경로가 정상적으로 나온다(한국만
 * ZERO_RESULTS — 구글이 한국 도보 길안내를 제공하지 않는다, 지도 데이터
 * 반출 제한). 그래서 해외 도보만 Google walking을 새로 태우고, 국내
 * 도보는 여전히 직선 추정(§4 "국내 도보는 직선일 수밖에 없다")을 쓴다.
 */
async function routeSegment(scope: CourseBriefScope, a: GeoPoint, b: GeoPoint, mode: TravelMode): Promise<RouteResult | "no-route"> {
  if (mode === "walk" && scope !== "overseas") return straightRouteMeasurement(a, b, mode); // 국내 도보 — 조회 대상 없음(위 설명)
  const outcome =
    mode === "walk"
      ? await fetchGoogleDirectionsRoute(a, b, "walking")
      : scope === "domestic"
        ? await fetchKakaoDrivingRoute(a, b)
        : await fetchGoogleDirectionsRoute(a, b, mode === "transit" ? "transit" : "driving");
  if (outcome === "no-route") return "no-route";
  if (outcome == null) return straightRouteMeasurement(a, b, mode); // 조회 실패/판단 보류 — 폴백, 스팟은 유지
  return applyDurationCap(outcome, mode); // §3 ★ 비정상적으로 크면(3시간 초과) "no-route"
}

export interface LegRouteResult {
  distanceM: number | null;
  durationMin: number | null;
  /**
   * null이면 실제 경로를 확인하지 못했다는 뜻 — 호출부(/api/routes,
   * 계획 탭 지도)는 두 점을 잇는 점선 직선으로 대체하고 시간은 보여주지
   * 않는다. 작업지시서 2026-09-11 "계획 탭 동선을 실제 경로로" §2 —
   * "사용자가 장소를 직접 추가하면 그 구간은 다시 추정값이 됩니다...
   * 한 일정 안에 실제값과 추정값이 섞입니다"가 바로 이 구분이 없어서
   * 생긴 문제였다.
   */
  path: { lat: number; lng: number }[] | null;
  /**
   * true면 이 값(거리·시간·path)이 실제 경로 조회 결과가 아니라 두 점을
   * 잇는 직선 추정이다 — 작업지시서 2026-09-15 "도보 구간이 직선으로
   * 그려집니다" §4: 예전엔 직선 폴백도 `path`에 좌표 2개를 채워 돌려줘서
   * `path !== null`만 보는 호출부가 실선으로 그려버렸다("path.length<=2로
   * 판별해도 되지만, 서버가 명시하는 쪽이 안전하다 — 실제 경로가 우연히
   * 2점일 수도 있다"). 호출부는 이 값이 true면 점선(추정 표시)으로
   * 그려야 한다.
   */
  estimated: boolean;
}

const NO_ROUTE: LegRouteResult = { distanceM: null, durationMin: null, path: null, estimated: true };

/**
 * 계획 탭 지도/일정 시각용 구간 조회(/api/routes가 그대로 노출) —
 * fetchKakaoDrivingRoute/fetchGoogleDirectionsRoute는 routeSegment와
 * 재사용하지만 폴백 정책이 다르다. routeSegment는 코스 "생성"용이라
 * 판단 보류 시에도 직선 추정치를 진짜 구간처럼 채워야 한다(값이 없으면
 * 스팟을 코스에서 지워야 하니까) — 반면 여기는 사용자가 실시간으로 보는
 * 화면이라 "확인 안 됨"과 "실제 값"을 섞으면 안 된다. 그래서 판단
 * 보류·실패·3시간 초과는 전부 동일하게 NO_ROUTE로 응답해, 실제 값이
 * 있을 때만 실제 값을 준다 — 나머지는 호출부가 알아서 직선/무표시로
 * 처리한다.
 *
 * 도보(모빌리티 API가 애초에 다루지 않는 구간)는 예외다 — 작업지시서
 * 2026-09-11 "해외 경로 해결 / 지도 이미지가 전부 사라졌습니다" §4:
 * "확인 안 됨"이 아니라 "확인할 필요가 없을 만큼 확실한" 케이스라
 * straightRouteMeasurement의 직선 추정치를 그대로 돌려준다 — 우메다
 * 일대처럼 가까운 스팟끼리는 대부분 도보권이라, 이걸 NO_ROUTE로
 * 두면 계획 지도에 선이 하나도 안 남는다.
 *
 * scope(국내/해외)·mode(도보/대중교통/자동차)는 클라이언트가 알 필요가
 * 없다 — 이미 courseBrief 코스 생성에 쓰는 것과 같은 규칙(좌표 기반
 * isDomesticCoordinate + 거리 기반 modeForDistance)으로 여기서 그대로
 * 정한다. 같은 좌표쌍이면 항상 같은 scope·mode로 재현되므로 클라이언트가
 * 캐시 키에 모드를 따로 넣을 필요도 없다.
 */
export async function fetchLegRoute(a: GeoPoint, b: GeoPoint): Promise<LegRouteResult> {
  const km = haversineKm(a, b);
  const scope: CourseBriefScope = isDomesticCoordinate(a.lat, a.lng) ? "domestic" : "overseas";
  const mode = modeForDistance(km, scope);
  if (mode === "walk") {
    // 작업지시서 2026-09-15 "도보 구간이 직선으로 그려집니다" §3 — 해외
    // 도보는 routeSegment와 같은 이유로 Google walking을 시도한다. 실패
    // (타임아웃 등 판단 보류)하면 직선으로 폴백하되 estimated:true로
    // 표시한다 — 국내는 애초에 시도하지 않는다(§4, Google도 ZERO_RESULTS).
    if (scope === "overseas") {
      const outcome = await fetchGoogleDirectionsRoute(a, b, "walking");
      if (outcome === "no-route") return NO_ROUTE; // 확정적으로 걸어갈 길이 없다
      if (outcome != null) {
        const capped = applyDurationCap(outcome, mode);
        if (capped !== "no-route") {
          return { distanceM: Math.round(capped.distanceKm * 1000), durationMin: capped.durationMinutes, path: capped.points, estimated: false };
        }
      }
      // outcome == null(조회 실패/타임아웃) 또는 3시간 초과 — 아래 직선 폴백으로.
    }
    const walk = straightRouteMeasurement(a, b, "walk");
    return { distanceM: Math.round(walk.distanceKm * 1000), durationMin: walk.durationMinutes, path: [a, b], estimated: true };
  }

  const outcome = scope === "domestic" ? await fetchKakaoDrivingRoute(a, b) : await fetchGoogleDirectionsRoute(a, b, mode === "transit" ? "transit" : "driving");
  if (outcome == null || outcome === "no-route") return NO_ROUTE;
  const capped = applyDurationCap(outcome, mode);
  if (capped === "no-route") return NO_ROUTE;
  return { distanceM: Math.round(capped.distanceKm * 1000), durationMin: capped.durationMinutes, path: capped.points, estimated: false };
}

/**
 * stops를 순서대로 resolveSegment(직전 구간)로 검증하며 잇는다 — 구간이
 * 확정적으로 "경로 없음"이면(예: 사량도처럼 배로만 갈 수 있는 섬) 그
 * 스팟을 코스에서 뺀다(작업지시서 2026-09-08 "이동 거리·시간이
 * 직선거리입니다" §3 ★). 실제 API 호출은 resolveSegment로 주입받는다 —
 * 이 함수 자체는 그 결과를 보고 "무엇을 남기고 무엇을 뺄지"만 결정하는
 * 순수 로직이라, 단위 테스트가 실제 네트워크(fetch)를 몰라도 된다.
 *
 * 이 날의 첫 스팟(kept[0])은 아직 어느 구간으로도 검증된 적이 없다 —
 * 사량도처럼 이 날의 시작점 자체가 문제일 수도 있으므로, 첫 구간이
 * 막히면 후보가 아니라 시작점 쪽을 버리고 후보를 새 시작점으로 삼는다.
 * 이미 한 구간 이상으로 도달 가능함이 확인된 뒤(kept.length ≥ 2)는
 * 새로 등장한 후보 쪽을 버린다 — kept의 마지막 스팟은 이미 검증됐으므로.
 */
export async function planRouteForDay<T extends GeoPoint>(
  stops: T[],
  resolveSegment: (a: T, b: T) => Promise<RouteResult | "no-route">,
): Promise<{ stops: T[]; segments: RouteResult[] }> {
  if (stops.length <= 1) return { stops, segments: [] };
  const kept: T[] = [stops[0]];
  const segments: RouteResult[] = [];
  for (let i = 1; i < stops.length; i++) {
    const candidate = stops[i];
    const outcome = await resolveSegment(kept[kept.length - 1], candidate);
    if (outcome !== "no-route") {
      kept.push(candidate);
      segments.push(outcome);
      continue;
    }
    if (kept.length === 1) {
      kept[0] = candidate; // 시작점 자체가 문제 — 후보를 새 시작점으로 삼는다
    }
    // kept.length >= 2: 마지막 스팟은 이미 도달 가능함이 검증됐다 — 이번 후보만 뺀다.
  }
  return { stops: kept, segments };
}

/**
 * 두 지점 사이 실제 경로를 조회한다 — 예산(deadline)을 넘기면 조회 자체를
 * 생략하고 직선 추정으로 채운다("시간이 없어서 확인을 못 했다"를 "경로가
 * 없다"로 오판하지 않는다). routeDayStops(하루 전체를 순서대로 조회)와
 * reorderRatedFirstStopAfterEnrichment(§3-b 재배치로 바뀐 구간 1~3개만
 * 다시 조회)가 같은 조회 규칙을 공유해야 해서 이 함수로 뽑아 뒀다.
 */
async function resolveRouteSegment(scope: CourseBriefScope, last: GeoPoint, candidate: GeoPoint, deadline: number): Promise<RouteResult | "no-route"> {
  const km = haversineKm(last, candidate);
  const mode = modeForDistance(km, scope);
  if (Date.now() > deadline) return straightRouteMeasurement(last, candidate, mode);
  return routeSegment(scope, last, candidate, mode);
}

/**
 * 하루치 스톱에 실제 경로 조회(routeSegment)를 적용한다 — planRouteForDay의
 * 실제 호출부.
 */
async function routeDayStops(scope: CourseBriefScope, stops: FinalStop[], deadline: number): Promise<{ stops: FinalStop[]; segments: RouteResult[] }> {
  return planRouteForDay(stops, (last, candidate) => resolveRouteSegment(scope, last, candidate, deadline));
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

/**
 * 작업지시서 2026-09-23 "404 결정적 단서 + 후보 급감 실측 데이터" §3-b —
 * 하루의 첫 스팟(방문자가 페이지에서 가장 먼저 보는 곳)이 평점 신호
 * 없이 시작하지 않도록, 같은 날짜 안에서 평점 신호가 있는 스팟을
 * 앞으로 옮긴다. 스팟을 빼지 않는다(§3-a 제외는 여전히 보류) — 순서만
 * 바꾼다.
 *
 * 반드시 routeDayStops(구간 이동시간 계산) **이전에** 불러야 한다 —
 * 이동시간은 "순서상 이웃한 두 스톱" 사이만 조회하므로, 순서를 먼저
 * 정하면 그 다음 조회가 항상 실제 순서와 맞는다. 라우팅 뒤에 순서만
 * 바꾸면 구간 이동시간이 엉뚱한 스팟 쌍을 가리키게 된다.
 *
 * hasRatingHint(기존 중복 제거 로직이 쓰는 것과 같은 힌트)만으로
 * 판단한다 — 이 시점엔 아직 buildBrief 후반부의 liveEnrichSpots(라이브
 * Google 평점 보강)가 돌기 전이라, "완전히 확정된 최종 평점"은 알 수
 * 없다. 그래도 카탈로그 매칭(사전에 실측으로 확인해둔 값)은 이미 쓸 수
 * 있어, 완벽하지 않아도 의미 있는 개선이다.
 */
export function preferRatedFirstStop(scope: CourseBriefScope, region: string, stops: FinalStop[]): FinalStop[] {
  if (stops.length < 2 || hasRatingHint(scope, region, stops[0])) return stops;
  const ratedIndex = stops.findIndex((s, i) => i > 0 && hasRatingHint(scope, region, s));
  if (ratedIndex === -1) return stops;
  const reordered = [...stops];
  [reordered[0], reordered[ratedIndex]] = [reordered[ratedIndex], reordered[0]];
  return reordered;
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
 * 작업지시서 2026-09-23 "코스 페이지가 열립니다 + 남은 4건" §3 —
 * preferRatedFirstStop(라우팅 이전)은 카탈로그 매칭까지만 평점 신호로
 * 본다. 국내 스코프에서 카탈로그에 없는 스팟은 바로 위 liveEnrichSpots
 * (Google Places 라이브 조회)를 거쳐야 비로소 평점이 생긴다 — 그래서
 * 하루의 스팟이 전부 카탈로그 미매칭이면 preferRatedFirstStop 시점엔
 * "평점 있는 곳이 하나도 없다"로 보여 순서를 못 바꾼다(실측: 경주 d1 —
 * 경주중앙시장·경주원조콩국·테라로사 경주점·경주보문관광단지 넷 다
 * 카탈로그 미매칭. 테라로사(★4.5)·보문관광단지(★4.3)는 라이브 조회로만
 * 평점이 생겼다).
 *
 * liveEnrichSpots 이후 최종 평점을 알게 된 지금, 하루치 스팟(day
 * 슬라이스, order 순서)에 같은 규칙을 한 번 더 적용해 1번 자리와 맞바꿀
 * 상대 위치(슬라이스 내 인덱스)를 판단만 한다(네트워크 없는 순수 함수 —
 * 실제 구간 재조회·교체는 buildBrief가 이 결과로 수행한다).
 */
export function findRatedFirstStopSwapIndex(daySpots: readonly CourseBriefSpot[]): number | null {
  if (daySpots.length < 2 || daySpots[0].rating != null) return null;
  const j = daySpots.findIndex((s, i) => i > 0 && s.rating != null);
  return j === -1 ? null : j;
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
 * 구간 거리·소요시간·이동수단은 이미 routeDayStops가 실제 경로로 구해
 * 왔다(segments, stops와 같은 순서로 stops.length-1개) — 이 함수는 그
 * 결과를 스팟 형태로 옮겨 담고 카탈로그 평점을 조인하는 로컬/동기
 * 작업만 한다. 실제 경로 조회(외부 I/O)는 이 함수를 부르기 전에 이미
 * 끝나 있어야 한다 — 라이브 평점 보강(liveEnrichSpots, 이후 단계)과
 * 마찬가지로, 이 함수의 결과만으로도 완결된 코스 구조를 즉시 캐시에
 * 쓸 수 있어야 한다.
 */
export function assembleDaySpots(stops: FinalStop[], segments: RouteResult[], baseOrder: number, scope: CourseBriefScope, region: string, day: CourseDays): { spots: CourseBriefSpot[]; distanceKm: number; hadStraightFallback: boolean } {
  let distanceKm = 0;
  let hadStraightFallback = false;
  const spots: CourseBriefSpot[] = stops.map((stop, i) => {
    let toNextMinutes: number | null = null;
    let toNextMode: TravelMode = "car";
    if (i < stops.length - 1) {
      const seg = segments[i];
      distanceKm += seg.distanceKm;
      toNextMode = seg.mode;
      toNextMinutes = seg.durationMinutes;
      // 국내 도보는 애초에 실경로 조회 대상이 아니다(routeSegment 위
      // 설명 참고) — 의도된 직선 추정이라 "실패"로 세지 않는다. 해외
      // 도보는 작업지시서 2026-09-15 "도보 구간이 직선으로 그려집니다"
      // §3 이후로 Google walking을 실제로 시도하므로, 그게 실패해서
      // 직선으로 떨어진 경우는 다른 모드와 마찬가지로 "조용한 저하"로
      // 센다 — distanceSource가 이걸 놓치면 §1의 재발("그걸 아무도
      // 모르게 만든 게 코드 문제")과 같은 사고가 된다.
      if (!(seg.mode === "walk" && scope === "domestic") && seg.points == null) hadStraightFallback = true;
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
  return { spots, distanceKm, hadStraightFallback };
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
// 작업지시서 2026-09-15 "OG 이미지 구도 3건" §3-③: 기존 800×500(scale 2)은
// "실제 픽셀 1600×1000"이라는 옆 주석과 달리 실측 1280×1000으로 나왔다 —
// Google Static Maps 무료 등급은 과금 연결 없이는 가로/세로 각각 640px
// 상한이라, scale 곱하기 전 요청값 800이 640으로 조용히 잘린 뒤(640×2=1280)
// scale이 적용된 것. 600×315는 상한(640) 밑이라 잘리지 않고, scale:2를
// 곱하면 정확히 1200×630(카카오·페이스북이 기준으로 삼는 1.91:1)이 된다.
const MAP_WIDTH = 600;
const MAP_HEIGHT = 315;
const MAP_SCALE = 2; // 레티나 대응 — 실제 픽셀은 1200×630

// 이미지 자체에는 브랜드 표식을 넣지 않는다 — 작업지시서 2026-09-06
// "정정 및 실측" §4-5: sharp로 픽셀에 굽던 "tradule.co.kr" 워터마크를
// 제거한다. Google Static Maps 호출 자체가 프로덕션에서 403(Maps
// Static API 미활성 추정)으로 막혀 있어 워터마크 코드가 실제로 한 번도
// 실행돼 보지 못한 채 sharp 네이티브 바이너리 리스크만 지고 있었다 —
// 403이 풀려도, 브랜드 표기는 이미지 밖(블로그 HTML의 캡션 등)에서
// AutoPipeline이 붙이는 쪽이 더 단순하고 안전하다.
// Static Maps의 공식 URL 길이 상한은 8,192자 — 여유를 두고 이보다 낮게 잡는다.
const STATIC_MAPS_URL_LIMIT = 8000;

export interface MapViewport {
  center: { lat: number; lng: number };
  zoom: number;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 작업지시서 2026-09-15 "OG 지도 잔여 2건" §2: "중앙값 거리의 3배 초과"를
// 그대로 기준으로 쓴다.
const OUTLIER_MEDIAN_DISTANCE_MULTIPLIER = 3;

/**
 * 좌표들의 중앙 지점(median lat/lng)에서 크게(중앙값 거리의 3배 초과)
 * 벗어난 점을 뺀 "핵심 군집"을 돌려준다 — 대표 하루 안에도 멀리 떨어진
 * 단독 방문지가 섞이면(후쿠오카 예: 도심 6곳 + 15km 밖 다자이후 1곳)
 * 그 하나 때문에 화면 축척 전체가 무너진다. 이 함수는 "화면을 어디에
 * 맞출지"만 정하는 용도라, 결과에서 빠진 점도 markers=에는 그대로
 * 남는다(buildStaticMapUrl 호출부 책임) — 화면 밖이면 안 보일 뿐이다.
 */
export function excludeOutlierSpots<T extends { lat: number; lng: number }>(points: T[]): T[] {
  if (points.length <= 2) return points; // 점이 2개 이하면 "중앙값에서 벗어남"이 정의되지 않는다
  const medianLat = median(points.map((p) => p.lat));
  const medianLng = median(points.map((p) => p.lng));
  const distances = points.map((p) => haversineKm(p, { lat: medianLat, lng: medianLng }));
  const medianDistance = median(distances);
  if (medianDistance === 0) return points; // 전부 같은 지점 — 배제할 대상이 없다
  const threshold = medianDistance * OUTLIER_MEDIAN_DISTANCE_MULTIPLIER;
  const core = points.filter((_, i) => distances[i] <= threshold);
  return core.length > 0 ? core : points; // 방어적 — 극단적 분포로 전부 빠지면 원본을 그대로 쓴다
}

const VIEWPORT_WORLD_DIM = 256; // Web Mercator 타일 한 변(줌 0 기준) — Google Maps의 표준 bounds-to-zoom 계산 상수
const VIEWPORT_MAX_ZOOM = 20;
const VIEWPORT_MIN_ZOOM = 2;
const VIEWPORT_PADDING = 0.9; // 마커가 화면 가장자리에 딱 붙지 않도록 10% 여백을 둔다

function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  const rad = Math.log((1 + sin) / (1 - sin)) / 2;
  return Math.max(Math.min(rad, Math.PI), -Math.PI) / 2;
}

function zoomForFraction(pixelDim: number, fraction: number): number {
  if (fraction <= 0) return VIEWPORT_MAX_ZOOM;
  return Math.floor(Math.log2(pixelDim / VIEWPORT_WORLD_DIM / fraction));
}

/**
 * 주어진 좌표들이 MAP_WIDTH×MAP_HEIGHT 프레임 안에 여유 있게 들어오는
 * center/zoom을 계산한다 — Google Maps JS SDK의 표준 bounds-to-zoom
 * 알고리즘(위도는 Web Mercator 투영, 경도는 선형)을 그대로 옮긴 것.
 * excludeOutlierSpots로 걸러낸 "핵심 군집"에 적용해야
 * 의도한 효과(이상치 제외한 화면)가 난다.
 */
export function computeViewport(points: { lat: number; lng: number }[]): MapViewport {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  if (points.length <= 1) return { center, zoom: 15 };

  const latFraction = (mercatorY(maxLat) - mercatorY(minLat)) / Math.PI;
  const lngDiffRaw = maxLng - minLng;
  const lngFraction = (lngDiffRaw < 0 ? lngDiffRaw + 360 : lngDiffRaw) / 360;

  const latZoom = zoomForFraction(MAP_HEIGHT * VIEWPORT_PADDING, latFraction);
  const lngZoom = zoomForFraction(MAP_WIDTH * VIEWPORT_PADDING, lngFraction);
  const zoom = Math.min(latZoom, lngZoom, VIEWPORT_MAX_ZOOM);
  return { center, zoom: Math.max(zoom, VIEWPORT_MIN_ZOOM) };
}

/**
 * Static Maps 요청 URL을 조립한다 — generateCourseMapImage에서 분리한
 * 순수 함수라(네트워크 없음) 단위 테스트로 길이 방어 로직을 직접
 * 검증할 수 있다. 작업지시서 2026-09-11 "해외 경로 해결 / 지도 이미지가
 * 전부 사라졌습니다" §2 ★: 마커·경로선을 다 넣은 URL이 상한을 넘기면
 * 요청 자체가 실패해 지도가 통째로 안 만들어졌다(카카오 실제 경로가
 * raw 좌표 나열이라 특히 잘 넘쳤다 — mapPathParamEncoded로 대부분
 * 예방되지만, 그래도 넘치면 경로선만 빼고 마커는 남긴다 — "지도가
 * 아예 없는 것보다 낫다").
 */
export function buildStaticMapUrl(
  apiKey: string,
  spots: { order: number; lat: number; lng: number }[],
  mapPaths: string[],
  viewport?: MapViewport,
): URL {
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("size", `${MAP_WIDTH}x${MAP_HEIGHT}`);
  url.searchParams.set("scale", String(MAP_SCALE));
  // viewport가 주어지면 center/zoom을 명시해 Google의 기본 동작(마커+경로
  // 전부를 감싸는 자동 축척)을 대신한다 — 작업지시서 2026-09-15 "OG 지도
  // 잔여 2건" §2: 이상치 스팟(예: 도심에서 15km 떨어진 단독 방문지) 하나
  // 때문에 축척이 무너져 나머지 스팟들이 한 점으로 뭉치는 문제. 이상치도
  // markers=에는 그대로 남아 좌표는 정확하지만, 보이는 화면(center/zoom)은
  // 핵심 군집(excludeOutlierSpots가 걸러낸 코어) 기준으로 맞춘다 — 화면
  // 밖으로 벗어난 마커는 단순히 안 보일 뿐이다.
  if (viewport) {
    url.searchParams.set("center", `${viewport.center.lat},${viewport.center.lng}`);
    url.searchParams.set("zoom", String(viewport.zoom));
  }
  url.searchParams.set("key", apiKey);
  // 작업지시서 2026-09-15 "OG 이미지 구도 3건" §3-②: Google Static Maps의
  // label은 A-Z/0-9 단일 문자만 받아, 순서 10부터 A/B/C…로 넘어가면서
  // 방문 순서를 읽을 수 없게 됐다("E, I, J …"). 썸네일 크기에서는 어차피
  // 번호가 읽히지 않으니, 번호 라벨은 완전히 없애고 시작점만 다른
  // 색+"S" 라벨로 구분한다 — 동선의 시작/방향만 보이면 충분하다.
  // 작업지시서 2026-09-15 "OG 지도 잔여 2건" §4: 나머지 마커는 기본
  // 크기 그대로면 스팟이 몰린 도심에서 서로 겹쳐 안 보인다 — size:small로
  // 줄이고, 시작점만 기본 크기로 남겨 대비를 준다.
  for (const spot of spots) {
    const marker = spot.order === 1 ? `color:blue|label:S|${spot.lat},${spot.lng}` : `size:small|color:red|${spot.lat},${spot.lng}`;
    url.searchParams.append("markers", marker);
  }
  // 동선을 잇는 경로선 — path=는 반복 가능한 파라미터라(Static Maps
  // 스펙) 구간마다 하나씩 따로 그린다. 작업지시서 2026-09-08 "이동
  // 거리·시간이 직선거리입니다" §4: 기존엔 스톱 좌표만 이어 하나의
  // 측지선(직선)으로 그렸는데("①→④가 시가지·하천을 가로질러 일직선"),
  // 이제 각 구간의 실제 경로 폴리라인(routeDayStops/RouteResult.mapPath —
  // 실경로가 없으면 그 구간만 직선으로 폴백)을 그대로 넘긴다. 날짜가
  // 바뀌는 경계는 여기 안 들어 있다(routeDayStops가 하루 안의 구간만
  // 계산) — 서로 다른 날 방문지를 선으로 잇는 게 애초에 의미가 없다.
  for (const path of mapPaths) {
    url.searchParams.append("path", path);
  }
  const urlLength = url.toString().length;
  if (urlLength > STATIC_MAPS_URL_LIMIT) {
    console.warn(`[courseBrief] static map url too long (${urlLength} chars, limit ${STATIC_MAPS_URL_LIMIT}) — dropping route lines, keeping ${spots.length} markers only`);
    url.searchParams.delete("path");
  }
  return url;
}

async function generateCourseMapImage(cacheKey: string, spots: CourseBriefSpot[], mapPaths: string[]): Promise<string | null> {
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

  const url = buildStaticMapUrl(apiKey, spots, mapPaths);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAP_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[courseBrief] google staticmap ${res.status} (url ${url.toString().length} chars)`);
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
// 작업지시서 2026-09-23 §2 — API의 기존 "스팟 3곳 미만이면 글을 쓰지
// 않는다"(insufficient_spots) 기준과 맞춘다. 1일차 하나만으로 이 밑으로
// 떨어지면 사실상 하루짜리 코스로도 못 쓸 정도라 재시도할 가치가 있다.
const MIN_DAY0_STOPS = 3;

/** 1일차 LLM 큐레이션 결과가 너무 적을 때, skipLlm 재시도 결과와 비교해 더 나은(스팟이 더 많은) 쪽을 고른다 — 재시도도 실패하면 원본을 그대로 쓴다(둘 다 나쁘더라도 최소한 원본만큼은 보장). */
export function pickBetterDayResult(original: FinalStop[], retry: FinalStop[]): FinalStop[] {
  return retry.length > original.length ? retry : original;
}

async function generateDay(scope: CourseBriefScope, region: string, dayIndex: number, priorDays: FinalStop[][], theme: CourseTheme): Promise<FinalStop[]> {
  const priorStops = priorDays.flat();
  let result: GenerateResultV2 | { course: []; source: "mock"; theme: CourseTheme };
  try {
    result =
      priorDays.length === 0
        ? await generateCourseV2(scope, region, theme, DEFAULT_RADIUS, {})
        : await generateCourseV2(scope, region, theme, DEFAULT_RADIUS, {
            excludeIds: new Set(priorStops.map((s) => s.id)),
            excludeNames: priorStops.map((s) => s.name),
            avoidCentroid: { lat: priorStops.reduce((sum, s) => sum + s.lat, 0) / priorStops.length, lng: priorStops.reduce((sum, s) => sum + s.lng, 0) / priorStops.length },
            avoidCuisines: [...new Set(priorStops.map((s) => cuisineKeyword(s.name)).filter((c): c is string => Boolean(c)))],
            dayIndex,
            skipLlm: true,
          });
  } catch (err) {
    console.error(`[courseBrief] day${dayIndex + 1} generateCourseV2 threw:`, err);
    result = { course: [], source: "mock", theme };
  }
  // 같은 날짜 안의 중복(예: "경주 황리단길"/"황리단길")도 여기서 한 번 거른다.
  const deduped = dedupeWithinList(stopsOf(result), scope, region);
  if (priorDays.length === 0) {
    // 작업지시서 2026-09-23 "404 결정적 단서 + 후보 급감 실측 데이터" §2 —
    // 1일차만 LLM 취향 큐레이션을 쓰는데(위 주석 참고), 그 결과가 가끔
    // 지나치게 적을 수 있다(실측: 오사카 2일 요청의 1일차, 교토 1일
    // 요청 — 둘 다 2곳 안팎). getCourseBrief의 캐시는 이 결과를 그대로
    // 26시간 박아두므로, 한 번의 나쁜 LLM 응답이 그 지역·일수 조합
    // 전체를 하루 종일 얇은 코스로 고정시킨다. 1일차가 너무 적으면
    // 2·3일차에서 이미 안정적으로 쓰고 있는 결정론 경로(skipLlm:true)로
    // 한 번 더 시도해, 둘 중 더 나은 쪽을 쓴다 — deterministicTaste
    // 자체는 건드리지 않는다(지시서 §3 — 공유 함수라 라이브 검증 없이
    // 손대지 않기로 한 결정 유지).
    if (deduped.length < MIN_DAY0_STOPS) {
      const retryResult: GenerateResultV2 | { course: []; source: "mock"; theme: CourseTheme } = await generateCourseV2(scope, region, theme, DEFAULT_RADIUS, {
        skipLlm: true,
      }).catch((err) => {
        console.error(`[courseBrief] day1 skipLlm 재시도 실패:`, err);
        return { course: [], source: "mock", theme };
      });
      const retryDeduped = dedupeWithinList(stopsOf(retryResult), scope, region);
      return pickBetterDayResult(deduped, retryDeduped);
    }
    return deduped;
  }
  // excludeIds/excludeNames는 정확히 같은 id/문자열일 때만 걸러 날짜를
  // 넘나드는 "이름만 다른 같은 곳"까지는 못 잡는다 — 여기서 한 번 더 거른다.
  const crossDayDeduped = dedupeCrossDay(priorDays, deduped, region);

  // 작업지시서 2026-09-23 "코스 페이지가 열립니다 + 남은 4건" §4 — 실측:
  // 고베 d1(1일 단독 요청)은 5곳인데, 같은 지역 d2(2일 요청) 호출은 총
  // 2곳으로 끝났다. COURSE_ALGO_VERSION을 올려 캐시를 강제로 비운 뒤에도
  // 재현돼 캐시 탓이 아니다. excludeIds는 "정확히 같은 장소"만 거르는
  // 안전한 필터지만, excludeNames는 sameShop(같은 브랜드) 기준으로 훨씬
  // 넓게 거른다 — 고베처럼 후보 풀이 원래 작은 지역은 이전 날짜가 쓴 몇
  // 곳의 "브랜드"까지 통째로 빠지면 이 날짜의 후보가 급격히 줄어들 수
  // 있다(1일차 자체가 LLM 비결정성으로 이미 적게 나온 경우 특히 더).
  // 이 날짜가 너무 적으면 excludeNames를 뺀(excludeIds만 유지 — 완전히
  // 같은 장소 반복은 여전히 막는다) 재시도로 더 나은 쪽을 고른다.
  // avoidCentroid/avoidCuisines는 후보를 제거하지 않고 점수만 깎는 연성
  // 페널티라(clusterPenalty·cuisinePenalty, courseRecommendV2.ts) 후보 수
  // 감소의 원인이 될 수 없어 그대로 둔다 — deterministicTaste 등 공유
  // 스코어링 자체는 여전히 손대지 않는다(2026-09-23 §2, 라이브 검증 없이
  // 손대지 않기로 한 결정 유지).
  if (crossDayDeduped.length < MIN_DAY0_STOPS) {
    const retryResult: GenerateResultV2 | { course: []; source: "mock"; theme: CourseTheme } = await generateCourseV2(scope, region, theme, DEFAULT_RADIUS, {
      excludeIds: new Set(priorStops.map((s) => s.id)),
      avoidCentroid: { lat: priorStops.reduce((sum, s) => sum + s.lat, 0) / priorStops.length, lng: priorStops.reduce((sum, s) => sum + s.lng, 0) / priorStops.length },
      avoidCuisines: [...new Set(priorStops.map((s) => cuisineKeyword(s.name)).filter((c): c is string => Boolean(c)))],
      dayIndex,
      skipLlm: true,
    }).catch((err) => {
      console.error(`[courseBrief] day${dayIndex + 1} excludeNames 완화 재시도 실패:`, err);
      return { course: [], source: "mock", theme };
    });
    const retryDeduped = dedupeWithinList(stopsOf(retryResult), scope, region);
    const retryCrossDayDeduped = dedupeCrossDay(priorDays, retryDeduped, region);
    return pickBetterDayResult(crossDayDeduped, retryCrossDayDeduped);
  }
  return crossDayDeduped;
}

// /api/content/course-brief가 "insufficient_spots"(422)로 거절하는
// 기준과 같은 값이다 — buildBrief가 캐시를 쓸지 말지도 같은 기준을
// 봐야 한다(아래 writeBriefCache 가드 참고). 한 곳에만 두고 라우트가
// 이 상수를 가져다 쓴다.
export const MIN_VIABLE_SPOTS = 3;

/**
 * 작업지시서 2026-09-23 "#266 검증: 둘은 됐고, 404는 라우트 미실행이
 * 거의 확실합니다" §3 — 실패(스팟 부족) 결과까지 26시간 캐시했더니
 * "고쳤는데 그대로"가 반복됐다. buildBrief가 캐시를 쓸지 판단하는
 * 조건을 순수 함수로 뽑아 단위 테스트로 고정한다.
 *
 * 작업지시서 2026-09-23 "자동 코스 일수 확장(도시형 5일·휴양형 7일)" §4 —
 * 고정값(MIN_VIABLE_SPOTS) 대신 스타일·일수별 기준(minViableSpots)을
 * 쓴다 — 휴양형은 하루 스팟이 적은 게 정상이라 고정 기준을 그대로 쓰면
 * 정상 결과까지 "캐시할 가치 없음"으로 오판한다.
 */
export function isCacheableBrief(spots: CourseBriefSpot[], style: RegionStyle, days: CourseDays): boolean {
  return spots.length >= minViableSpots(style, days);
}

export async function buildBrief(scope: CourseBriefScope, region: string, days: CourseDays, cacheKey: string, enrichBudgetMs: number = DEFAULT_ENRICH_BUDGET_MS): Promise<CourseBrief> {
  const appUrl = appUrlFor(region, days);
  // 작업지시서 2026-09-23 "자동 코스 일수 확장(도시형 5일·휴양형 7일)" §3·§4 —
  // RESORT_REGIONS 소속이면 "resort" 테마(하루 3슬롯 — 액티비티·휴식·
  // 저녁)로, 아니면 기존 그대로 DEFAULT_THEME(balanced, 하루 7슬롯)으로
  // 생성한다. 최소 스팟 기준도 이 style을 따른다(minViableSpots).
  const style = styleForRegion(region);
  const theme: CourseTheme = style === "resort" ? "resort" : DEFAULT_THEME;

  // 실패해도 절대 던지지 않는다(스펙 §1 "에러를 던지지 말 것") — 빈
  // spots로 조용히 폴백해 AutoPipeline이 그 지역을 건너뛰게 한다. 어느
  // 날짜든 비면(특히 1일차) 그 다음 날짜는 시도하지 않는다 — 기존
  // 2일차 로직(day1Stops.length===0이면 2일차 생략)의 일반화.
  const dayStops: FinalStop[][] = [];
  for (let i = 0; i < days; i++) {
    const stops = await generateDay(scope, region, i, dayStops, theme);
    if (stops.length === 0) break;
    dayStops.push(stops);
  }

  // 스팟 선정은 위까지 끝났다 — 이제 "어느 날·어느 순서로 방문할지"만
  // 좌표 기준으로 다시 정한다(작업지시서 2026-09-06 "일자 배분이
  // 지리적으로 나뉘지 않습니다" 참고, reallocateStopsByDay 주석).
  const geoOrderedDayGroups = reallocateStopsByDay(dayStops);
  // 작업지시서 2026-09-23 §3-b — 각 날짜의 첫 스팟이 평점 신호 없이
  // 시작하지 않도록 순서를 조정한다. 반드시 라우팅(바로 아래
  // routeDayStops) 이전에 해야 한다 — 이후에 순서만 바꾸면 구간
  // 이동시간(toNextMinutes)이 실제와 다른 스팟 쌍을 가리키게 된다
  // (routeDayStops는 "순서상 이웃한 두 스톱" 사이만 조회하므로, 순서를
  // 정한 뒤에 조회해야 항상 맞는다). preferRatedFirstStop 주석 참고 —
  // 스팟을 빼지 않고 순서만 바꾼다(§3-a 제외는 여전히 보류).
  const finalDayGroups = geoOrderedDayGroups.map((stops) => preferRatedFirstStop(scope, region, stops));

  // 하루 안의 구간(순서상 이웃한 두 스톱)마다 실제 경로를 조회한다 —
  // 작업지시서 2026-09-08 "이동 거리·시간이 직선거리입니다" §3. 경로가
  // 확정적으로 없으면(예: 사량도) 그 스팟은 빠진 채로 stops가 돌아온다
  // (routeDayStops 주석 참고) — 그래서 reallocateStopsByDay가 정한
  // "어느 날"은 그대로 두되, 실제로 갈 수 있는 곳만 남긴 뒤에야 스팟
  // 형태로 조립한다. 날짜별로 서로 독립이라 병렬로 돌린다 — deadline은
  // 코스 전체(모든 날짜 합산) 공유 예산이다. 구간 수(총 스팟 수 - 날짜
  // 수)에 비례해 예산을 늘린다 — 위 ROUTING_BUDGET_MS_PER_SEGMENT 주석 참고.
  const estimatedSegments = finalDayGroups.reduce((sum, stops) => sum + Math.max(0, stops.length - 1), 0);
  const routingBudgetMs = Math.max(ROUTING_BUDGET_MS, estimatedSegments * ROUTING_BUDGET_MS_PER_SEGMENT);
  const routingDeadline = Date.now() + routingBudgetMs;
  const routedDays = await Promise.all(finalDayGroups.map((stops) => routeDayStops(scope, stops, routingDeadline)));

  let baseOrder = 1;
  let totalDistanceKm = 0;
  let hadAnyStraightFallback = false;
  const allSpots: CourseBriefSpot[] = [];
  const mapPaths: string[] = [];
  const dayTotals: CourseBrief["dayTotals"] = [];
  routedDays.forEach(({ stops, segments }, i) => {
    const { spots, distanceKm, hadStraightFallback } = assembleDaySpots(stops, segments, baseOrder, scope, region, (i + 1) as CourseDays);
    allSpots.push(...spots);
    totalDistanceKm += distanceKm;
    baseOrder += spots.length;
    // 작업지시서 2026-09-15 "공유 품질 4건" §3 — 날짜(i)마다 다른 색으로
    // 되칠해, 여러 날짜 동선이 한 지도에 겹쳐도 하루씩 구분되게 한다.
    // 이어서 같은 날짜 "도보 구간이 직선으로 그려집니다" §5 — 실제 경로가
    // 없는(points === null) 구간은 요일 색 대신 회색(추정 표시)이 우선한다.
    mapPaths.push(...segments.map((s) => (s.points == null ? recolorMapPathAsEstimated(s.mapPath) : recolorMapPathForDay(s.mapPath, i))));
    if (hadStraightFallback) hadAnyStraightFallback = true;
    dayTotals.push({ day: (i + 1) as CourseDays, distanceKm: round1(distanceKm), spotCount: spots.length });
  });
  // 실패해도 조용히 직선으로 폴백해왔다 — 작업지시서 2026-09-11 "해외
  // 경로가 조용히 직선으로 떨어지고 있습니다" §3: "그걸 아무도 모르게
  // 만든 게 코드 문제". 지금은 로그로라도 남긴다(logger 모듈이 따로
  // 없어 이 파일의 기존 관례 그대로 console 사용 — generateDay의
  // console.error와 같은 패턴).
  if (hadAnyStraightFallback) {
    console.warn(`[courseBrief] ${scope}/${region} 코스의 일부 구간이 실제 경로를 못 구해 직선거리로 대체됐습니다 (distanceSource="straight")`);
  }
  // 조용히 틀린 코스를 캐시·반환하는 대신 "지원하지 않는 지역"과
  // 동일하게 명시 거부한다(looksLikeMismatchedOverseasResult 주석 참고).
  if (looksLikeMismatchedOverseasResult(scope, allSpots)) {
    throw new UnsupportedRegionError(region);
  }
  // 요청한 days보다 실제로 채워진 날짜 수가 적을 수 있다(1일차부터 비면
  // dayStops가 아예 비고, 이 경우도 최소 1일로 보고한다 — 기존 동작 유지).
  // 실제 경로 검증으로 어느 날의 스팟이 줄어드는 것(심지어 1곳까지)은
  // 날짜 자체를 없애지 않는다 — §3은 "그 스팟을 빼라"는 것이지 "그
  // 날짜를 스킵하라"는 게 아니다(스팟이 3곳 미만이 되는 지역 전체를
  // 스킵할지는 이 응답을 쓰는 AutoPipeline 쪽 C-2 계약의 몫).
  const actualDays = Math.max(1, finalDayGroups.length) as CourseDays;
  let brief: CourseBrief = {
    region,
    days: actualDays,
    totalDistanceKm: round1(totalDistanceKm),
    spots: allSpots,
    imageUrl: null,
    appUrl,
    ratingSource: "google",
    distanceSource: hadAnyStraightFallback ? "straight" : "route",
    dayTotals,
  };

  // 여기까지가 "구조" 단계 — 순서·실제 경로 거리/소요시간·카탈로그
  // 평점까지 전부 확정됐다. ⚠️ 실제 경로 조회(routeDayStops)는 외부
  // I/O이지만 이 단계 안에 포함된다 — totalDistanceKm/toNextMinutes가
  // 이 지시서의 핵심 대상이라 "구조"로 취급해 먼저 캐시에 반영해야
  // 한다(아래 라이브 보강이 타임아웃/에러로 끊겨도 다음 호출은 최소한
  // 실제 경로가 반영된 이 결과를 즉시 캐시 히트로 받는다 — 작업지시서
  // 2026-09-01 "응답 시간" §2-2). 대신 ROUTING_BUDGET_MS로 예산을 두고,
  // 넘기면 직선 추정으로 조용히 폴백한다(routeDayStops 주석 참고) — 여기서
  // 무한정 기다려 응답 자체가 늦어지지 않게 한다.
  //
  // 작업지시서 2026-09-23 "#266 검증: 둘은 됐고, 404는 라우트 미실행이
  // 거의 확실합니다" §3 — 실측: "고베 d2 → 422 insufficient_spots ·
  // 321ms"에서 321ms는 라이브 생성이 아니라 캐시 히트였다. 스팟이 API
  // 자체 최소 기준(MIN_VIABLE_SPOTS) 미만인 실패 결과까지 그대로
  // 캐시했더니, 수정을 배포해도 캐시 TTL(26시간)이 지나기 전까지 같은
  // 실패가 그대로 반복되는 문제가 났다 — "일시적 실패"가 "하루짜리
  // 장애"로 굳는다. 이 밑으로는 캐시하지 않는다 — 다음 요청이 처음부터
  // 다시 시도할 기회를 갖는다(dedupeInFlight가 여전히 동시 요청은
  // 하나로 합친다).
  if (isCacheableBrief(allSpots, style, days)) {
    await writeBriefCache(cacheKey, brief).catch((err) => {
      console.error("[courseBrief] structure cache write failed:", err);
    });
  }

  const deadline = Date.now() + enrichBudgetMs;
  const enrichedSpots = await liveEnrichSpots(brief.spots, scope, region, deadline);

  // 작업지시서 2026-09-23 "코스 페이지가 열립니다 + 남은 4건" §3 — 위
  // liveEnrichSpots로 최종 평점이 확정된 지금, findRatedFirstStopSwapIndex로
  // 하루씩 다시 확인한다. 스팟을 옮기거나 빼지 않는다 — 자리(order/day)는
  // 그대로 두고 1번 자리와 상대 위치의 "내용"(이름·카테고리·평점·좌표)만
  // 맞바꾼다. 좌표가 바뀌는 구간(최대 3개: (0,1)·(j-1,j)·(j,j+1) — j가
  // 1이면 앞의 둘이 같은 구간이라 실제로는 최대 2개)만 실제 경로를 다시
  // 조회해 이동시간·거리·지도 경로를 갱신한다. 이미 라우팅이 확정한
  // 나머지 구간은 좌표가 안 바뀌었으니 다시 조회하지 않는다. 새 구간 중
  // 하나라도 "no-route"면 그 날은 통째로 되돌린다(원래 1번 유지) —
  // preferRatedFirstStop과 같은 보수적 원칙. enrichBudgetMs를 넘겼으면
  // resolveRouteSegment 자체가 조용히 직선 추정으로 폴백한다(기존 규칙
  // 그대로) — 여기서 별도로 예산을 늘리지 않는다.
  let finalSpots = enrichedSpots;
  const finalMapPaths = [...mapPaths];
  let dayOffset = 0;
  let mapPathOffset = 0;
  for (let d = 0; d < routedDays.length; d++) {
    const dayLen = routedDays[d].stops.length;
    const start = dayOffset;
    const daySlice = finalSpots.slice(start, start + dayLen);
    const j = findRatedFirstStopSwapIndex(daySlice);
    if (j != null) {
      const globalJ = start + j;
      const affectedLocalEdges = new Set<number>([0]);
      if (j - 1 > 0) affectedLocalEdges.add(j - 1);
      if (j + 1 < dayLen) affectedLocalEdges.add(j);

      const swappedSlice = [...daySlice];
      [swappedSlice[0], swappedSlice[j]] = [swappedSlice[j], swappedSlice[0]];

      const newSegByLocalEdge = new Map<number, RouteResult>();
      let aborted = false;
      for (const localEdge of affectedLocalEdges) {
        const outcome = await resolveRouteSegment(scope, swappedSlice[localEdge], swappedSlice[localEdge + 1], deadline);
        if (outcome === "no-route") {
          aborted = true;
          break;
        }
        newSegByLocalEdge.set(localEdge, outcome);
      }

      if (!aborted) {
        const startSpot = daySlice[0];
        const jSpot = daySlice[j];
        const nextArr = [...finalSpots];
        nextArr[start] = { ...jSpot, order: startSpot.order, day: startSpot.day, toNextMinutes: startSpot.toNextMinutes, toNextMode: startSpot.toNextMode };
        nextArr[globalJ] = { ...startSpot, order: jSpot.order, day: jSpot.day, toNextMinutes: jSpot.toNextMinutes, toNextMode: jSpot.toNextMode };

        let dayDeltaKm = 0;
        for (const [localEdge, seg] of newSegByLocalEdge) {
          const globalEdgeIdx = start + localEdge;
          const oldDistanceKm = routedDays[d].segments[localEdge].distanceKm;
          nextArr[globalEdgeIdx] = { ...nextArr[globalEdgeIdx], toNextMinutes: seg.durationMinutes, toNextMode: seg.mode };
          dayDeltaKm += seg.distanceKm - oldDistanceKm;
          const globalMapPathIdx = mapPathOffset + localEdge;
          finalMapPaths[globalMapPathIdx] = seg.points == null ? recolorMapPathAsEstimated(seg.mapPath) : recolorMapPathForDay(seg.mapPath, d);
          if (seg.points == null && !(seg.mode === "walk" && scope === "domestic")) hadAnyStraightFallback = true;
        }
        finalSpots = nextArr;
        totalDistanceKm += dayDeltaKm;
        dayTotals[d] = { ...dayTotals[d], distanceKm: round1(dayTotals[d].distanceKm + dayDeltaKm) };
      }
    }
    dayOffset += dayLen;
    mapPathOffset += Math.max(0, dayLen - 1);
  }

  const imageUrl = await generateCourseMapImage(cacheKey, finalSpots, finalMapPaths);
  brief = {
    ...brief,
    spots: finalSpots,
    imageUrl,
    totalDistanceKm: round1(totalDistanceKm),
    distanceSource: hadAnyStraightFallback ? "straight" : "route",
    dayTotals: [...dayTotals],
  };

  if (isCacheableBrief(brief.spots, style, days)) {
    await writeBriefCache(cacheKey, brief).catch((err) => {
      console.error("[courseBrief] final cache write failed:", err);
    });
  }

  return brief;
}

/**
 * 같은 key로 부른 여러 호출을 하나의 진행 중인 Promise로 합친다 — 작업
 * 지시서 2026-09-22 "24개 전부 아직 404입니다" §4가 지적한 대로, 지난
 * 라운드(PR #262, getCachedCourseBrief로 라이브 생성 자체를 없앰)는
 * "캐시가 없으면 크론이 돌 때까지 404"라는 더 나쁜 회귀를 냈다 — 실측
 * (`/api/content/course-brief`)으로 확인된 대로 캐시가 비어 있어도
 * 라이브 생성 자체는 정상 동작하니, 폴백을 없애는 대신 "같은 key의
 * 라이브 생성이 동시에 두 번 이상 돌지 않게" 막는 쪽이 맞다.
 *
 * courseBrief.ts의 실제 생성 경로(generateDay→generateCourseV2)의 1일차는
 * Anthropic LLM 취향 큐레이션(curateTaste)을 거치는데(2·3일차는 이미
 * skipLlm:true), 이 호출엔 temperature를 고정하지 않아 완전히 같은
 * 프롬프트를 넣어도 매번 다른 상위 3개 숏리스트가 나올 수 있다 —
 * 원래 지시서(2026-09-22 "sitemap에 올린 코스 페이지 20개가 전부
 * 404입니다") §2가 관찰한 "메타데이터는 성공, 본문만 notFound()" 모순의
 * 실제 원인으로 보인다(직전 라운드가 지목한 courseRecommend.ts의
 * pickDeterministic은 v1 전용 함수라 이 경로에서 애초에 호출되지 않는다
 * — 그 진단은 틀렸었다). React `cache()`는 generateMetadata와 페이지
 * 본문 사이에서 이 LLM 호출의 결과를 공유해주지 못했다(Next.js 16
 * 스트리밍 메타데이터가 둘을 별도 실행 트랙으로 다루는 것으로 보이며,
 * 정확한 내부 메커니즘은 확증하지 못함) — 반면 이 Map은 React의
 * 요청 스코프가 아니라 모듈 스코프(같은 Node 프로세스 안에서는 항상
 * 공유됨)라 그 경계와 무관하게 동작한다.
 *
 * LLM 출력 자체를 결정론으로 만드는 건(temperature=0으로도 완전한
 * bit-for-bit 재현은 보장되지 않는다) 이 지시서 범위를 넘는 코스 생성
 * 품질 변경이라 손대지 않았다 — 대신 "같은 key로는 라이브 생성이
 * 정확히 한 번만 돈다"를 보장해 그 비결정성이 결과에 드러날 기회
 * 자체를 없앤다. 진행 중인 build가 끝나면(성공/실패 상관없이) map에서
 * 지운다 — 그래야 다음 요청이 새로 캐시를 확인하고, 정말 필요하면 새
 * build를 다시 시도할 수 있다.
 */
export function dedupeInFlight<T>(inFlight: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

const inFlightBriefBuilds = new Map<string, Promise<CourseBrief>>();

/**
 * GET /api/content/course-brief와 워밍 크론이 공통으로 쓰는 진입점 —
 * 별칭 정규화 → 캐시 확인 → 미스 시 buildBrief(같은 key는
 * dedupeInFlight로 한 번만).
 *
 * 작업지시서 2026-09-23 "한국인이 가장 많이 가는 나라 셋이 0개입니다"
 * §5 — resolveRegionAlias를 이 함수의 맨 앞, 다른 어떤 처리보다도
 * 먼저 부른다. 이후의 모든 것(isSupportedRegion, resolveScope, 캐시
 * 키, buildBrief)이 정본 이름만 보게 되므로, 호출부 각각이 별칭을
 * 알 필요가 없다.
 */
export async function getCourseBrief(rawRegion: string, days: CourseDays, enrichBudgetMs: number = DEFAULT_ENRICH_BUDGET_MS): Promise<CourseBrief> {
  const region = resolveRegionAlias(rawRegion);
  // 캐시를 들여다보기도 전에 거른다 — 이 검사가 생기기 전에 "발리" 같은
  // 미지원 지역이 이미 잘못된 응답으로 캐시돼 있었을 수 있는데, 캐시부터
  // 확인하면 그 오염된 응답을 이 수정 이후에도 계속 돌려주게 된다.
  if (!isSupportedRegion(region)) throw new UnsupportedRegionError(region);
  const scope = resolveScope(region);
  const cacheKey = briefCacheKey(scope, region, days);
  const cached = await readBriefCache(cacheKey).catch((err) => {
    console.error("[courseBrief] cache read failed:", err);
    return null;
  });
  if (cached) return cached;
  return dedupeInFlight(inFlightBriefBuilds, cacheKey, () => buildBrief(scope, region, days, cacheKey, enrichBudgetMs));
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
  days: CourseDays;
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
