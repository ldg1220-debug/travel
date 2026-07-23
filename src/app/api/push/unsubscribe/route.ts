import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/** Removes this device's push subscription — no auth required so it still works from a logout flow that's already cleared the session. */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) {
    return NextResponse.json({ error: "missing endpoint" }, { status: 400 });
  }
  await pool.query(`delete from push_subscriptions where endpoint = $1`, [body.endpoint]);
  return NextResponse.json({ ok: true });
});
