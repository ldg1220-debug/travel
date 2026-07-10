import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import type { ItineraryItem, Region } from "@/lib/types";

interface SaveItineraryBody {
  /**
   * The specific server row to update (must belong to this user) — omit to
   * create a new row. Without this, every save/share from the same account
   * used to collide on "the user's one itinerary," so sharing a second,
   * unrelated plan silently overwrote and reused the same link the first
   * plan's recipients already had open.
   */
  id?: number;
  title?: string;
  region: Region;
  /** The frontend's `schedule` array — stored as-is in the placesData JSONB column. */
  placesData: ItineraryItem[];
}

/** Every itinerary the current user has ever saved/shared, most recent first. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ itineraries: [] });
  }

  const result = await pool.query(
    `select id, title, region, "placesData", "shareToken" from itineraries where "userId" = $1 order by updated_at desc`,
    [session.user.id],
  );
  return NextResponse.json({ itineraries: result.rows });
}

/**
 * Creates or updates one of the current user's itineraries. Passing `id`
 * updates that specific row (a re-save or re-share of an already-known
 * plan, reusing its existing shareToken); omitting it always inserts a new
 * row with a fresh shareToken, so two different plans never end up
 * aliasing the same link.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SaveItineraryBody;
  const title = body.title?.trim() || "My Trip";
  const placesDataJson = JSON.stringify(body.placesData ?? []);

  if (body.id) {
    const existing = await pool.query(
      `select id, "shareToken" from itineraries where id = $1 and "userId" = $2`,
      [body.id, session.user.id],
    );
    if (existing.rowCount) {
      const shareToken = existing.rows[0].shareToken ?? randomUUID();
      await pool.query(
        `update itineraries set title = $2, region = $3, "placesData" = $4, "shareToken" = $5, updated_at = now() where id = $1`,
        [body.id, title, body.region, placesDataJson, shareToken],
      );
      return NextResponse.json({ id: body.id, shareToken });
    }
    // Given id doesn't exist or belongs to someone else — fall through and
    // create a fresh row rather than erroring, so a stale client-side id
    // (e.g. after a local reset) degrades to "just make a new plan".
  }

  const shareToken = randomUUID();
  const inserted = await pool.query(
    `insert into itineraries ("userId", title, region, "placesData", "shareToken") values ($1, $2, $3, $4, $5) returning id`,
    [session.user.id, title, body.region, placesDataJson, shareToken],
  );
  return NextResponse.json({ id: inserted.rows[0].id, shareToken });
}
