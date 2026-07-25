import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { purgeUserAccount, DELETION_GRACE_PERIOD_MS } from "@/lib/server/accountDeletion";

/**
 * 매일 실행되는 Vercel Cron(vercel.json)이 유예기간(2주)이 지난 탈퇴
 * 계정을 영구 삭제한다. Vercel은 CRON_SECRET이 설정돼 있으면 크론 호출에
 * 그 값을 Authorization 헤더로 실어 보낸다 — 파괴적인 작업이라 시크릿이
 * 아예 설정 안 된 경우엔(원치 않는 오픈 엔드포인트가 되므로) 열어주는 대신
 * 실패시킨다.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았어요" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - DELETION_GRACE_PERIOD_MS);
  const result = await pool.query<{ id: number }>(
    `select id from users where "deletionRequestedAt" is not null and "deletionRequestedAt" < $1`,
    [cutoff],
  );

  let purged = 0;
  for (const row of result.rows) {
    try {
      await purgeUserAccount(row.id);
      purged += 1;
    } catch (err) {
      console.error(`Failed to purge user ${row.id}`, err);
    }
  }

  return NextResponse.json({ ok: true, purged, candidates: result.rows.length });
});
