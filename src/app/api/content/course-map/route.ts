import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { getCourseBrief } from "@/lib/server/courseBrief";

/**
 * 트레쥴 콘텐츠 API — 동선 지도 이미지 전용 엔드포인트. 작업지시서
 * 2026-09-05 "AutoPipeline 통합" §B-1/§D-2 반영: 블로그가 직접 지도
 * API를 부르면 지도 키가 파이프라인 쪽으로 새고 브랜딩도 제각각이
 * 되니, 트레쥴이 이미지를 만들어 하나의 URL로 내려준다.
 *
 * 새 이미지 생성 로직을 따로 만들지 않는다 — course-brief가 이미
 * best-effort로 만들어 Blob에 올려두는 imageUrl(courseBrief.ts의
 * generateCourseMapImage, 트레쥴 워터마크 포함)을 그대로 재사용한다.
 * course-brief와 완전히 같은 캐시(getCourseBrief)를 타므로 별도 비용이
 * 거의 없다 — "course-brief와 같은 캐시 키를 쓰면 추가 비용이 거의
 * 없습니다"(지시서 §B-1)를 그대로 만족한다.
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
  const days: 1 | 2 = request.nextUrl.searchParams.get("days") === "2" ? 2 : 1;

  const brief = await getCourseBrief(region, days);
  if (!brief.imageUrl) {
    // 지도를 못 만든 이유는 다양하다(Google Static Maps API 미설정,
    // Blob 저장소 미설정, 해당 지역에 스팟이 아예 없음, 생성 자체
    // 실패 등) — 이미지 엔드포인트에서 가짜 이미지를 만들어 낼 수는
    // 없으므로 정직하게 404를 준다. <img> 태그에서는 깨진 이미지
    // 아이콘으로 보이는 정도다.
    return NextResponse.json({ error: "map not available for this region yet" }, { status: 404 });
  }
  return NextResponse.redirect(brief.imageUrl, 302);
});
