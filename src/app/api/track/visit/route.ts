import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/**
 * Anonymous (non-logged-in) visit counter for the admin dashboard.
 * Logged-in activity is already tracked via users."lastActiveAt" — this
 * fills the gap the dashboard otherwise has no visibility into. Stores no
 * per-visitor identifier at all (no IP, no cookie), just a same-day
 * increment, so it carries none of the privacy weight real visitor
 * tracking would. Called once per app load from VisitorPing.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (session?.user) {
    // Logged-in visits are already covered by lastActiveAt — no-op instead
    // of erroring, so the client doesn't need to branch on auth state.
    return NextResponse.json({ ok: true });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`visit-ping:${ip}`, 1, 20))) {
    return NextResponse.json({ ok: true });
  }

  await pool.query(
    `insert into visitor_counts (day, count) values (current_date, 1)
     on conflict (day) do update set count = visitor_counts.count + 1`,
  );
  return NextResponse.json({ ok: true });
});
