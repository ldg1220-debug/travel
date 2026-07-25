import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { ROOT_ADMIN_EMAIL } from "@/lib/server/rootAdmin";

/**
 * "관리자에게 문의하기" 진입점이 쪽지 대화를 열 대상(root admin)의 userId를
 * 알아내는 데 쓴다 — 로그인만 하면 누구나 조회할 수 있고(관리자 여부와
 * 무관), 노출되는 정보도 "관리자 계정의 id 하나"뿐이라 민감하지 않다.
 * 루트 관리자가 아직 가입 전이면(로컬 개발 등) null을 돌려준다.
 */
export const GET = withApiErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await pool.query<{ id: number }>(`select id from users where email = $1 limit 1`, [ROOT_ADMIN_EMAIL]);
  return NextResponse.json({ userId: result.rows[0]?.id ?? null });
});
