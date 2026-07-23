import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

const STATUSES = new Set(["pending", "reviewing", "resolved", "dismissed"]);

/** 신고 처리 상태/메모 갱신 — 관리자만. */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const body = (await request.json()) as { status?: string; adminNote?: string };

  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    values.push(body.status);
    sets.push(`status = $${values.length}`);
  }
  if (body.adminNote !== undefined) {
    values.push(body.adminNote.slice(0, 1000));
    sets.push(`"adminNote" = $${values.length}`);
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }
  sets.push(`updated_at = now()`);
  values.push(id);

  await pool.query(`update reports set ${sets.join(", ")} where id = $${values.length}`, values);
  return NextResponse.json({ ok: true });
});
