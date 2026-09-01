import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { pool } from "@/lib/server/db";
import { generateCourseV2, type FinalStop, type GenerateResultV2 } from "@/lib/server/courseRecommendV2";
import { haversineKm } from "@/lib/server/courseRoute";
import { MODE_SPEED_KMH, cuisineKeyword, type CourseTheme, type TravelMode, type TravelRadius } from "@/lib/server/courseRecommend";
import { liveCategoryBucket } from "@/lib/liveCategoryBucket";
import { OVERSEAS_LOCALITY_NAMES } from "@/lib/discoverData";

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
const DEFAULT_MODE: TravelMode = "car";

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

/**
 * 하루치 스톱 배열을 API 응답의 spots 조각(순서·구간 이동시간 포함)으로
 * 변환한다. order는 baseOrder부터 이어서 매긴다(2일치를 이어붙일 때
 * order가 1..N으로 연속되도록) — 스펙엔 날짜 구분 필드가 없어(계약
 * 그대로 유지) 이렇게 이어붙이는 것 외엔 표현할 방법이 없다. 그래서
 * "하루" 단위의 총 이동거리·구간 이동시간만 정확히 계산하고, 날짜가
 * 바뀌는 경계(예: 1일차 마지막 → 2일차 첫 곳)는 실제로 연속된 동선이
 * 아니므로 toNextMinutes를 null로 두고 totalDistanceKm 합산에서도
 * 제외한다.
 */
function toSpots(stops: FinalStop[], baseOrder: number, mode: TravelMode): { spots: CourseBriefSpot[]; distanceKm: number } {
  let distanceKm = 0;
  const spots: CourseBriefSpot[] = stops.map((stop, i) => {
    let toNextMinutes: number | null = null;
    if (i < stops.length - 1) {
      const km = haversineKm({ lat: stop.lat, lng: stop.lng }, { lat: stops[i + 1].lat, lng: stops[i + 1].lng });
      distanceKm += km;
      toNextMinutes = minutesForKm(km, mode);
    }
    return {
      name: stop.name,
      category: liveCategoryBucket(stop.category),
      rating: stop.rating ?? null,
      reviewCount: stop.reviewCount ?? null,
      lat: stop.lat,
      lng: stop.lng,
      order: baseOrder + i,
      toNextMinutes,
      toNextMode: mode,
    };
  });
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
  const { spots: day1Spots, distanceKm: day1Distance } = toSpots(day1Stops, 1, DEFAULT_MODE);

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
  const { spots: day2Spots, distanceKm: day2Distance } = toSpots(day2Stops, day1Spots.length + 1, DEFAULT_MODE);

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
