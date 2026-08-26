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
 * one after a couple weeks. `placement` ("header" | "timeline" | "course" |
 * "card") lets the CTA locations be compared against each other —
 * `spotCategory` (only ever set from "card", the one placement tied to a
 * specific spot) lets category-based provider gating (affiliates.ts
 * isCampgroundType) be verified against real clicks.
 */
interface LodgingCtaBody {
  kind: "open" | "click";
  placement: string;
  city: string;
  region: string;
  provider?: string;
  isAffiliate?: boolean;
  /** discover 카드처럼 특정 스팟에 묶인 이벤트일 때의 그 스팟 카테고리 — 카테고리 게이팅(affiliates.ts isCampgroundType)이 실제로 맞게 작동하는지 클릭 데이터로 검증하기 위함. 도시 단위 CTA(header/timeline/course)는 특정 스팟이 없어 계속 비워둠. */
  spotCategory?: string;
  /** 작업지시서 2026-08-26 A-4 — 숙박 외 제휴(eSIM 등)가 붙으면서 상품군
   * 구분이 필요해졌다. 생략하면 DB DEFAULT('lodging')로 채워져 기존
   * 호출부(숙박 CTA)는 전혀 안 바뀐다. */
  product?: "lodging" | "esim" | "activity";
}
const VALID_PRODUCTS = new Set(["lodging", "esim", "activity"]);

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = (await request.json()) as Partial<LodgingCtaBody>;
  if (body.kind !== "open" && body.kind !== "click") {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (!body.placement || !body.city || !body.region) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (body.product !== undefined && !VALID_PRODUCTS.has(body.product)) {
    return NextResponse.json({ error: "invalid product" }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id != null ? Number(session.user.id) : null;

  // 방문자 집계와 같은 이유의 최소한의 오남용 방지 — 개인 식별 정보는 안 씀.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`lodging-cta:${ip}`, 40, 3600))) {
    return NextResponse.json({ ok: true });
  }

  await pool.query(
    `insert into lodging_cta_events ("userId", kind, placement, city, region, provider, is_affiliate, spot_category, product)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId,
      body.kind,
      body.placement.slice(0, 40),
      body.city.slice(0, 100),
      body.region,
      body.provider?.slice(0, 40) ?? null,
      body.isAffiliate ?? null,
      body.spotCategory?.slice(0, 60) ?? null,
      body.product ?? "lodging",
    ],
  );
  return NextResponse.json({ ok: true });
});
