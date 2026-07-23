import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/** 사용자 정지/정지 해제 — 관리자만. 정지된 계정은 다음 로그인부터 막힌다(src/auth.ts signIn 콜백). */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const body = (await request.json()) as { isBanned?: boolean };
  if (typeof body.isBanned !== "boolean") {
    return NextResponse.json({ error: "missing isBanned" }, { status: 400 });
  }
  await pool.query(`update users set "isBanned" = $1 where id = $2`, [body.isBanned, id]);
  return NextResponse.json({ ok: true });
});
