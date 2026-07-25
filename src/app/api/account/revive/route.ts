import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/**
 * "계정 살리기" — 유예기간 중인 탈퇴를 취소한다. 유예기간 중 재로그인만으로는
 * 자동 취소되지 않도록 일부러 만든 별도 진입점(명시적 의사 확인).
 */
export const POST = withApiErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await pool.query(
    `update users set "deletionRequestedAt" = null, "deletionToken" = null, "deletionTokenExpiresAt" = null where id = $1`,
    [session.user.id],
  );
  return NextResponse.json({ ok: true });
});
