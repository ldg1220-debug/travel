import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import type { ItineraryItem, Region } from "@/lib/types";

interface PushBody {
  region: Region;
  placesData: ItineraryItem[];
}

/**
 * Capability-URL sharing: anyone holding the shareToken can view or edit —
 * there's no per-collaborator identity, so neither handler here checks
 * `auth()`. Polled every 3s by /travel-scheduler/[shareToken] as the
 * "fastest reliable given current infra" sync mechanism (no WebSocket
 * server / Supabase in this stack).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  const result = await pool.query(
    `select title, region, "placesData", updated_at from itineraries where "shareToken" = $1`,
    [shareToken],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = result.rows[0];
  return NextResponse.json({
    title: row.title,
    region: row.region,
    placesData: row.placesData,
    updatedAt: row.updated_at,
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  const body = (await request.json()) as PushBody;

  const result = await pool.query(
    `update itineraries set region = $2, "placesData" = $3, updated_at = now() where "shareToken" = $1 returning id`,
    [shareToken, body.region, JSON.stringify(body.placesData ?? [])],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
