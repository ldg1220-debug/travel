import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { sendDeletionConfirmEmail } from "@/lib/server/mail";
import { generateDeletionToken, DELETION_TOKEN_TTL_MS } from "@/lib/server/accountDeletion";

/**
 * 회원 탈퇴 1단계 — 프로필 시트에서 "탈퇴하기"를 누르면 즉시 삭제되는 대신
 * 여기로 온다. 확인 토큰을 발급해 가입 이메일로 보내고, 사용자가 그 메일의
 * 링크를 눌러야만(GET /api/account/confirm-deletion) 실제 유예기간이
 * 시작된다 — 이 단계만으로는 아무것도 지워지지 않는다.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  if (!(await checkRateLimit(`deletion-request:${userId}`, 5, 3600))) {
    return NextResponse.json({ error: "너무 자주 요청했어요. 잠시 후 다시 시도해주세요" }, { status: 429 });
  }

  const result = await pool.query<{ email: string | null; deletionRequestedAt: string | null }>(
    `select email, "deletionRequestedAt" from users where id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row?.email) {
    return NextResponse.json({ error: "가입된 이메일이 없어 확인 메일을 보낼 수 없어요" }, { status: 400 });
  }
  if (row.deletionRequestedAt) {
    return NextResponse.json({ error: "이미 탈퇴가 진행 중이에요" }, { status: 400 });
  }

  const token = generateDeletionToken();
  await pool.query(
    `update users set "deletionToken" = $1, "deletionTokenExpiresAt" = $2 where id = $3`,
    [token, new Date(Date.now() + DELETION_TOKEN_TTL_MS), userId],
  );

  const confirmUrl = `${new URL(request.url).origin}/api/account/confirm-deletion?token=${token}`;
  try {
    await sendDeletionConfirmEmail(row.email, confirmUrl);
  } catch (err) {
    console.error("Failed to send deletion confirmation email", err);
    return NextResponse.json({ error: "확인 메일 발송에 실패했어요. 잠시 후 다시 시도해주세요" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
});
