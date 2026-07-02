import { NextResponse } from "next/server";
import { TREND_CARDS } from "@/lib/mockTrends";

/**
 * Mock trend-curation endpoint for the /planner screen.
 *
 * Named `/api/planner/trends` rather than `/api/trends` on purpose —
 * that path is already the main app's real, pipeline-backed, ISR-cached
 * international trend list (src/app/api/trends/route.ts) and this route
 * must not collide with or replace it.
 *
 * Pretends to read from a self-hosted cache DB the way the real pipeline
 * (src/server/pipeline) does; here it just returns fixed mock data.
 */
export async function GET() {
  return NextResponse.json({ trends: TREND_CARDS });
}
