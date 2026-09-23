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

// 작업지시서 2026-09-23 "#267 검증: 새 지역은 잘 됩니다 / 지역 목록이
// 24시간 옛것으로 나갑니다 / '발리'가 404" §2 — 24시간 캐시는 "목록이
// 자주 안 바뀐다"는 전제엔 맞았지만, 배포 자체가 이 캐시를 비우지
// 않는다는 걸 놓쳤다. 실측: #267(지역 60여 곳 추가) 배포 뒤 몇 시간이
// 지나도 쿼리 없는 요청은 옛 목록(137곳)을 그대로 받았다. 이 주소를
// 쿼리 없이 그대로 부르는 AutoPipeline이 "코타키나발루가 미지원"이라고
// 오판한 사고로 이어졌다 — 실제로는 이미 지원 중이었다. 1시간으로
// 줄인다 — 목록이 자주 바뀌진 않지만, 바뀌었을 때 하루 늦게 반영되면
// 안 된다.
export const revalidate = 3600;

export const GET = withApiErrorHandling(async () => {
  return NextResponse.json(
    { domestic: flatRegions("domestic"), overseas: flatRegions("overseas") },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
});
