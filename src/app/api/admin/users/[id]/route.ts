import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { isRootAdmin } from "@/lib/server/rootAdmin";

/**
 * 사용자 정지/정지 해제(isBanned) — 관리자만.
 * 관리자 지정/해제(isAdmin) — 루트 관리자만 (src/lib/server/rootAdmin.ts).
 * 정지된 계정은 다음 로그인부터 막힌다(src/auth.ts signIn 콜백).
 */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const body = (await request.json()) as { isBanned?: boolean; isAdmin?: boolean };

  const sets: string[] = [];
  const values: (boolean | number)[] = [];
  if (typeof body.isBanned === "boolean") {
    values.push(body.isBanned);
    sets.push(`"isBanned" = $${values.length}`);
  }
  if (typeof body.isAdmin === "boolean") {
    if (!isRootAdmin(session.user.email)) {
      return NextResponse.json({ error: "관리자 지정은 대표 계정만 할 수 있어요" }, { status: 403 });
    }
    // 루트 관리자 본인의 관리자 권한은 이 경로로 스스로 뺏을 수 없게 막는다 —
    // 실수로 자기 자신을 해제해 아무도 관리자를 못 만드는 상태를 방지.
    const target = await pool.query(`select email from users where id = $1`, [id]);
    if (isRootAdmin(target.rows[0]?.email) && body.isAdmin === false) {
      return NextResponse.json({ error: "루트 관리자 권한은 해제할 수 없어요" }, { status: 400 });
    }
    values.push(body.isAdmin);
    sets.push(`"isAdmin" = $${values.length}`);
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }
  values.push(id);
  await pool.query(`update users set ${sets.join(", ")} where id = $${values.length}`, values);
  return NextResponse.json({ ok: true });
});
