import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { getSpotMetrics, refreshStaleSpotMetrics } from "@/lib/server/getSpotMetrics";

export const dynamic = "force-dynamic";

/**
 * /discover의 큐레이션 카드(SpotCard)가 마운트 시 한 번 불러서, 미리
 * 만들어둔 discoverData.ts 배열 위에 spot_id 기준으로 rating/reviewCount를
 * 얹는다 — discoverData.ts는 "use client" 트리에서 그대로 번들되는 정적
 * 데이터라 여기서 직접 Postgres를 조회할 수 없어서(브라우저에 DB 접근을
 * 노출하게 됨) 이 라우트를 하나 두고 클라이언트가 병합한다.
 *
 * 작업지시서 2026-10-14 "Places 호출 비용" §2④ — 월 배치가 아니라 요청 시 조회다: 오래된(26시간) 지표 몇 개를 월 예산 가드 안에서 새로 조회하고,
 * 26시간 안에 갱신된 지표만 돌려준다(한도에 닿으면 지표 없음 — 카드는 평점 없이 보인다). 응답은 CDN 이 1시간 캐시해 반복 마운트가 DB·Places 를 치지 않는다.
 */
export const GET = withApiErrorHandling(async () => {
  await refreshStaleSpotMetrics();
  const metrics = await getSpotMetrics();
  return NextResponse.json(
    { metrics },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
});
