import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { flatRegions } from "@/lib/discoverData";

/**
 * 트레쥴 콘텐츠 API — AutoPipeline이 블로그 시드(지역 × 코스 패턴)를
 * 만들 때 쓸 지역 목록. 작업지시서 2026-09-05 "트레쥴 다음 작업" §1 —
 * AutoPipeline이 지역 목록 API가 없어 35개 지역을 하드코딩해 쓰고
 * 있었고, 나머지 170여 곳은 글이 아예 안 나오는 상태였다.
 *
 * 실제 평탄화 로직(discoverData.ts의 flatRegions)은 워밍 크론
 * (/api/cron/warm-course-brief)과 공유한다 — "같은 소스"를 쓰라는
 * 지시서 요건대로, 이 API가 "쓸 수 있다"고 알려주는 지역과 워밍
 * 크론이 실제로 미리 채우는 지역이 어긋나지 않게 한다.
 *
 * 지시서 요건대로 스팟이 적거나 없는 지역도 거르지 않는다 —
 * regionHierarchy() 자체가 이미 "데이터가 아직 없어도 안전한" 정본
 * 목록(regions.ts DOMESTIC_CANONICAL, discoverData.ts WORLD_CITIES)이라
 * 별도 필터가 필요 없다. 부실 지역(스팟 3개 미만) 스킵은 AutoPipeline
 * 쪽 책임으로 남긴다.
 */

export const revalidate = 86400; // 지시서 요건 "캐시 24시간 이상" — 정본 카탈로그 기반이라 사실상 정적에 가깝다.

export const GET = withApiErrorHandling(async () => {
  return NextResponse.json(
    { domestic: flatRegions("domestic"), overseas: flatRegions("overseas") },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
});
