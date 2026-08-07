import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/**
 * Conversion tracking for the planner's "숙소 예약" CTA (src/lib/affiliates.ts).
 * There's no way to know if a click ever became a real booking (the deep
 * link just opens each provider's own search results page), so this is the
 * best available signal: how many people open the picker (`kind: "open"`)
 * vs. how many actually click through to a provider (`kind: "click"`) —
 * enough to replace the revenue model's assumed conversion rate with a real
 * one after a couple weeks. `placement` ("header" | "timeline") lets the
 * two CTA locations be compared against each other.
 */
interface LodgingCtaBody {
  kind: "open" | "click";
  placement: string;
  city: string;
  region: string;
  provider?: string;
  isAffiliate?: boolean;
}

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = (await request.json()) as Partial<LodgingCtaBody>;
  if (body.kind !== "open" && body.kind !== "click") {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (!body.placement || !body.city || !body.region) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id != null ? Number(session.user.id) : null;

  // 방문자 집계와 같은 이유의 최소한의 오남용 방지 — 개인 식별 정보는 안 씀.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`lodging-cta:${ip}`, 40, 3600))) {
    return NextResponse.json({ ok: true });
  }

  await pool.query(
    `insert into lodging_cta_events ("userId", kind, placement, city, region, provider, is_affiliate)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, body.kind, body.placement.slice(0, 40), body.city.slice(0, 100), body.region, body.provider?.slice(0, 40) ?? null, body.isAffiliate ?? null],
  );
  return NextResponse.json({ ok: true });
});
