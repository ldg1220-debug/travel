import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { MAX_REVISIONS_PER_ITINERARY } from "@/lib/server/itineraryRevisions";

/**
 * "변경 내역" 목록 — 작업지시서 2026-09-16 "남은 작업 + 데이터 안전장치"
 * §3: itinerary_revisions(#258에서 추가)가 그동안 쌓이기만 하고 사용자가
 * 꺼내 볼 방법이 없었다("오늘 같은 일이 또 나면 여전히 제가 수동으로
 * 되살려야 합니다"). placesData 전체를 목록에 실으면 계획당 최대
 * MAX_REVISIONS_PER_ITINERARY(20)개의 전체 일정을 한 번에 내려받게 되니,
 * 목록엔 고르는 데 필요한 최소한(제목·지역·스팟 수·시각)만 준다 — 실제
 * 복원은 이 id로 POST .../restore를 부르면 서버가 알아서 한다.
 */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const owner = await pool.query(`select id from itineraries where id = $1 and "userId" = $2`, [id, session.user.id]);
  if (owner.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await pool.query(
    `select id, title, region, jsonb_array_length("placesData") as "itemCount", created_at as "createdAt", "createdBy"
     from itinerary_revisions where "itineraryId" = $1 order by created_at desc limit $2`,
    [id, MAX_REVISIONS_PER_ITINERARY],
  );
  return NextResponse.json({ revisions: result.rows });
});
