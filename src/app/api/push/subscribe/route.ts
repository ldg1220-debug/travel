import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Registers this device's push subscription for the current user — re-subscribing (same endpoint) just updates the owner, in case a shared/handed-down device previously belonged to someone else. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as SubscribeBody;
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  await pool.query(
    `insert into push_subscriptions ("userId", endpoint, p256dh, auth)
     values ($1, $2, $3, $4)
     on conflict (endpoint) do update set "userId" = $1, p256dh = $3, auth = $4`,
    [session.user.id, body.endpoint, body.keys.p256dh, body.keys.auth],
  );
  return NextResponse.json({ ok: true });
}
