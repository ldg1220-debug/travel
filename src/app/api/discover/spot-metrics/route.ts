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
 * 작업지시서 2026-10-20 "평점은 장소를 눌렀을 때만" — /discover 카드는 더 이상 이 라우트를 부르지 않고, Places 갱신(Enterprise)도 없앴다. 남은 행 중 26시간 안의 것만 읽어 돌려준다.
 */
export const GET = withApiErrorHandling(async () => {
  const metrics = await getSpotMetrics();
  return NextResponse.json(
    { metrics },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
});
