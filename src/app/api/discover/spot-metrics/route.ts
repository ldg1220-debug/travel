import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { getSpotMetrics } from "@/lib/server/getSpotMetrics";

export const dynamic = "force-dynamic";

/**
 * /discover의 큐레이션 카드(SpotCard)가 마운트 시 한 번 불러서, 미리
 * 만들어둔 discoverData.ts 배열 위에 spot_id 기준으로 rating/reviewCount를
 * 얹는다 — discoverData.ts는 "use client" 트리에서 그대로 번들되는 정적
 * 데이터라 여기서 직접 Postgres를 조회할 수 없어서(브라우저에 DB 접근을
 * 노출하게 됨) 이 라우트를 하나 두고 클라이언트가 병합한다.
 *
 * DB 자체가 이미 월 1회 배치로만 채워지므로(Places 실시간 호출 없음) 이
 * 라우트는 매 요청마다 가벼운 Postgres 조회 하나뿐 — 응답도 짧게
 * 캐시해서 같은 세션 안에서 반복 마운트돼도 매번 DB를 치지 않게 한다.
 */
export const GET = withApiErrorHandling(async () => {
  const metrics = await getSpotMetrics();
  return NextResponse.json(
    { metrics },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
});
