import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/**
 * 특정 이력 하나의 전체 내용 — 작업지시서 2026-09-18 "뷰어 모드를
 * 우회하는 저장 경로" §7: "되돌리기 전에 '무엇으로 돌아가는지' 볼 수
 * 있어야 합니다". 목록(GET .../revisions)엔 고르는 데 필요한 최소한만
 * 실어(제목·지역·스팟 수·시각) 계획당 최대 20개를 한 번에 무겁게
 * 내려받지 않게 했는데, 이 라우트는 사용자가 실제로 하나를 눌러
 * "미리보기"할 때만 그 하나의 placesData를 내려준다.
 */
export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string; revisionId: string }> }) => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: idParam, revisionId: revisionIdParam } = await params;
    const id = Number(idParam);
    const revisionId = Number(revisionIdParam);
    if (!id || !revisionId) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }

    const owner = await pool.query(`select id from itineraries where id = $1 and "userId" = $2`, [id, session.user.id]);
    if (owner.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await pool.query(
      `select id, title, region, "placesData", created_at as "createdAt", "createdBy"
       from itinerary_revisions where id = $1 and "itineraryId" = $2`,
      [revisionId, id],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  },
);
