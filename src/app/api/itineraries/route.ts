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
  /** True for the one unnamed "진행 중인 계획" scratchpad row — kept out of the named "저장된 계획" list (see GET below). */
  isDraft?: boolean;
}

/**
 * Every itinerary the current user has ever saved/shared, most recent first
 * — split into the named "저장된 계획" list and the one (if any) unnamed
 * draft row, so the client never has to filter isDraft out itself.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ itineraries: [], draft: null });
  }

  const result = await pool.query(
    `select id, title, region, "placesData", "shareToken", "isDraft" from itineraries where "userId" = $1 order by updated_at desc`,
    [session.user.id],
  );
  const draft = result.rows.find((r) => r.isDraft) ?? null;
  const itineraries = result.rows.filter((r) => !r.isDraft);
  return NextResponse.json({ itineraries, draft });
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
    `insert into itineraries ("userId", title, region, "placesData", "shareToken", "isDraft") values ($1, $2, $3, $4, $5, $6) returning id`,
    [session.user.id, title, body.region, placesDataJson, shareToken, Boolean(body.isDraft)],
  );
  return NextResponse.json({ id: inserted.rows[0].id, shareToken });
}

/**
 * Deletes one of the current user's itineraries — used when 저장된 계획 is
 * removed locally, so the server-side row doesn't outlive it and get pulled
 * back in as a "new" plan by the next cross-device hydration.
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  await pool.query(`delete from itineraries where id = $1 and "userId" = $2`, [id, session.user.id]);
  return NextResponse.json({ ok: true });
}
