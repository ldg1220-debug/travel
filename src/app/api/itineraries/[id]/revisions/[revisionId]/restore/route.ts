import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { snapshotItineraryRevision } from "@/lib/server/itineraryRevisions";

/**
 * "이 시점으로 되돌리기" — 작업지시서 2026-09-16 "남은 작업 + 데이터
 * 안전장치" §3. 고른 이력의 (title, region, placesData)를 그대로
 * itineraries 행에 되쓴다 — shareToken은 바꾸지 않는다(이미 공유해둔
 * 링크가 그대로 유효해야 한다).
 *
 * 복원 자체도 실수일 수 있으므로, 덮어쓰기 전 "지금" 내용을 먼저 이력에
 * 남긴다(snapshotItineraryRevision — POST /api/itineraries의 id 갱신
 * 경로와 정확히 같은 규칙) — 되돌리기를 되돌릴 수 있다.
 */
export const POST = withApiErrorHandling(
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

    const current = await pool.query(
      `select id, title, region, "placesData", "shareToken" from itineraries where id = $1 and "userId" = $2`,
      [id, session.user.id],
    );
    if (current.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = current.rows[0];

    const revision = await pool.query(
      `select title, region, "placesData" from itinerary_revisions where id = $1 and "itineraryId" = $2`,
      [revisionId, id],
    );
    if (revision.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const rev = revision.rows[0];

    await snapshotItineraryRevision(row.id, row.title, row.region, row.placesData, "restore");

    await pool.query(`update itineraries set title = $2, region = $3, "placesData" = $4, updated_at = now() where id = $1`, [
      id,
      rev.title,
      rev.region,
      JSON.stringify(rev.placesData),
    ]);

    return NextResponse.json({ id, title: rev.title, region: rev.region, placesData: rev.placesData, shareToken: row.shareToken });
  },
);
