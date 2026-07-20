import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";

/** Removes this device's push subscription — no auth required so it still works from a logout flow that's already cleared the session. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) {
    return NextResponse.json({ error: "missing endpoint" }, { status: 400 });
  }
  await pool.query(`delete from push_subscriptions where endpoint = $1`, [body.endpoint]);
  return NextResponse.json({ ok: true });
}
