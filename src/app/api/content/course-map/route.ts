import { maxDaysForRegion } from "@/lib/regionTypicalDays";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { isBotUserAgent } from "@/lib/botUserAgent";
import { getCourseBrief, loadCourseMapInput, parseDays, renderCourseMapPng, TransientApiFailureError, UnsupportedRegionError } from "@/lib/server/courseBrief";
import { resolveRegionAlias, styleForRegion } from "@/lib/discoverData";

/**
 * 트레쥴 콘텐츠 API — 동선 지도 이미지 전용 엔드포인트. 작업지시서
 * 2026-09-05 "AutoPipeline 통합" §B-1/§D-2 반영: 블로그가 직접 지도
 * API를 부르면 지도 키가 파이프라인 쪽으로 새고 브랜딩도 제각각이
 * 되니, 트레쥴이 이미지를 만들어 하나의 URL로 내려준다.
 *
 * 작업지시서 2026-10-13 "긴급: Vercel Blob 한도 초과" — 지도는 Blob 에 저장하지 않고 이 라우트가 요청 때
 * 저장된 지도 입력(courseBrief.ts prepareCourseMaps)으로 Static Maps PNG 를 만들어 직접 응답한다.
 * Cache-Control s-maxage 30일 + ETag(지도 내용 해시)라 Vercel CDN 이 캐시하고, 코스가 같으면 재생성이 없다.
 *
 * width/format 파라미터는 아직 안 받는다 — Blob 캐시가 (지역, 일수)
 * 하나당 이미지 하나인데, 커스텀 크기까지 캐시 키에 넣으면 그 재사용
 * 이점이 바로 깨진다. 지금은 800×500(scale=2, 실픽셀 1600×1000) PNG
 * 고정 — 필요해지면 그때 크기별 캐시 분리를 검토한다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60; // course-brief와 동일(2026-09-06 §4-2로 60초 상향) — 캐시 미스 시 코스 생성+지도 생성을 처음부터 해야 할 수 있다.

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const region = (request.nextUrl.searchParams.get("region") ?? "").trim().slice(0, 40);
  if (!region) return NextResponse.json({ error: "missing region" }, { status: 400 });
  // 작업지시서 2026-09-23 "자동 코스 일수 확장(도시형 5일·휴양형 7일)" §1·§6 —
  // course-brief/route.ts와 같은 스타일별 상한 검사(styleForRegion 주석 참고).
  const days = parseDays(request.nextUrl.searchParams.get("days"));
  if (days == null) return NextResponse.json({ error: "days must be an integer from 1 to 7" }, { status: 400 });
  const style = styleForRegion(region);
  const maxDays = maxDaysForRegion(region);
  if (days > maxDays) {
    return NextResponse.json({ error: "days exceeds this region's style limit", style, maxDays }, { status: 400 });
  }
  // 작업지시서 2026-09-29 "일자별 동선 지도" §1 — day=N이 있으면 그 하루
  // 스팟·구간 경로만 그린 지도를 돌려준다(없으면 기존 전체 지도 그대로).
  // 범위(1..days) 밖이면 조용히 깎지 않고 400 — days 검사와 같은 원칙.
  const dayRaw = (request.nextUrl.searchParams.get("day") ?? "").trim();
  let day: number | null = null;
  if (dayRaw !== "") {
    const n = Number(dayRaw);
    if (!Number.isInteger(n) || n < 1 || n > days) {
      return NextResponse.json({ error: "day must be an integer from 1 to days", days }, { status: 400 });
    }
    day = n;
  }

  const canonicalRegion = resolveRegionAlias(region);
  // 지도 입력(스팟·경로선)이 저장돼 있으면 코스를 다시 만들지 않는다 — 이 요청은 CDN 에 캐시되고, 캐시 미스에서 코스 생성(수십 초)을 기다리게 하지 않는다.
  let input = await loadCourseMapInput(canonicalRegion, days);
  if (!input) {
    try {
      console.log(`[courseBrief] route=course-map region=${region} days=${days}`);
      await getCourseBrief(region, days, undefined, { requestSource: isBotUserAgent(request.headers.get("user-agent")) ? "bot" : "user" }); // 코스가 만들어지면서 지도 입력도 함께 저장된다
    } catch (err) {
      // course-brief/route.ts와 같은 이유(작업지시서 2026-09-14 §3) — 미지원
      // 지역엔 엉뚱한 코스 지도 대신 명시적으로 거부한다.
      if (err instanceof UnsupportedRegionError) {
        return NextResponse.json({ error: "unsupported_region", region: err.region, message: "지원하지 않는 지역입니다." }, { status: 404 });
      }
      // course-brief/route.ts와 같은 이유(작업지시서 2026-09-27 A-6).
      if (err instanceof TransientApiFailureError) {
        return NextResponse.json({ error: "temporarily_unavailable", region: err.region, message: "일시적으로 지도를 만들 수 없습니다. 잠시 후 다시 시도해주세요." }, { status: 503 });
      }
      throw err;
    }
    input = await loadCourseMapInput(canonicalRegion, days);
  }
  if (!input) {
    // 지도를 못 만든 이유는 다양하다(Static Maps 키 미설정, 해당 지역에 스팟이 아예 없음, 422 코스 …) — 가짜 이미지를 만들 수는 없으니 정직하게 404.
    return NextResponse.json({ error: day != null ? "day map not available for this region yet" : "map not available for this region yet", ...(day != null ? { day } : {}) }, { status: 404 });
  }
  if (day != null && !(input.dayLengths[day - 1] > 0)) {
    return NextResponse.json({ error: "day map not available for this region yet", day }, { status: 404 });
  }

  // ETag = 지도 내용 해시(+일자) — 같으면 Static Maps 를 부르지 않고 304. CDN: 30일 캐시 + 하루 stale 허용(작업지시서 2026-10-13 §3②).
  const etag = `"${input.hash}${day != null ? `-d${day}` : ""}"`;
  const cacheHeaders = { "cache-control": "public, s-maxage=2592000, stale-while-revalidate=86400", etag };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: cacheHeaders });

  const png = await renderCourseMapPng(input, day);
  if (!png) {
    console.error(`[courseBrief] course-map render failed region=${region} days=${days} day=${day ?? "all"}`);
    return NextResponse.json({ error: "map_render_failed" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
  return new NextResponse(new Uint8Array(png), { status: 200, headers: { ...cacheHeaders, "content-type": "image/png" } });
});
