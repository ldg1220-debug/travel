import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import type { ItineraryItem, Region } from "@/lib/types";

interface SaveItineraryBody {
  title?: string;
  region: Region;
  /** The frontend's `schedule` array — stored as-is in the placesData JSONB column. */
  placesData: ItineraryItem[];
}

/** The current user's most recently saved itinerary, if any. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ itinerary: null });
  }

  const result = await pool.query(
    `select id, title, region, "placesData", "shareToken" from itineraries where "userId" = $1 order by updated_at desc limit 1`,
    [session.user.id],
  );
  return NextResponse.json({ itinerary: result.rows[0] ?? null });
}

/**
 * Upserts the current user's itinerary (one saved trip per user for now).
 * Always ensures a shareToken exists and returns it, so both a plain
 * "저장" and an "초대하기" (which also saves first) can reuse this route.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SaveItineraryBody;
  const title = body.title?.trim() || "My Trip";
  const placesDataJson = JSON.stringify(body.placesData ?? []);

  const existing = await pool.query(
    `select id, "shareToken" from itineraries where "userId" = $1 limit 1`,
    [session.user.id],
  );

  if (existing.rowCount) {
    const shareToken = existing.rows[0].shareToken ?? randomUUID();
    await pool.query(
      `update itineraries set title = $2, region = $3, "placesData" = $4, "shareToken" = $5, updated_at = now() where id = $1`,
      [existing.rows[0].id, title, body.region, placesDataJson, shareToken],
    );
    return NextResponse.json({ id: existing.rows[0].id, shareToken });
  }

  const shareToken = randomUUID();
  const inserted = await pool.query(
    `insert into itineraries ("userId", title, region, "placesData", "shareToken") values ($1, $2, $3, $4, $5) returning id`,
    [session.user.id, title, body.region, placesDataJson, shareToken],
  );
  return NextResponse.json({ id: inserted.rows[0].id, shareToken });
}
