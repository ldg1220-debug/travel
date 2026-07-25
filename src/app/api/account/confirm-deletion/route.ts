import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/**
 * 회원 탈퇴 2단계 — 확인 메일의 링크를 눌러 도착하는 곳. 세션 없이도
 * 동작해야 한다(메일 클라이언트가 로그인 세션 없는 브라우저에서 열 수도
 * 있으므로) — 토큰 자체가 32바이트 난수라 브루트포스가 사실상 불가능해
 * 인증 대신 토큰 매치+미만료를 검증 근거로 쓴다. 성공하면 여기서부터
 * 유예기간이 시작된다.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const token = new URL(request.url).searchParams.get("token");
  const origin = new URL(request.url).origin;
  if (!token) {
    return NextResponse.redirect(`${origin}/account-deletion?status=invalid`);
  }

  const result = await pool.query<{ id: number }>(
    `update users set "deletionRequestedAt" = now(), "deletionToken" = null, "deletionTokenExpiresAt" = null
     where "deletionToken" = $1 and "deletionTokenExpiresAt" > now()
     returning id`,
    [token],
  );

  if (result.rowCount === 0) {
    return NextResponse.redirect(`${origin}/account-deletion?status=expired`);
  }
  return NextResponse.redirect(`${origin}/account-deletion?status=confirmed`);
});
