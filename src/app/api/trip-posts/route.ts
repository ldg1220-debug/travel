import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

type Visibility = "public" | "friends" | "custom" | "private";
const VISIBILITIES: Visibility[] = ["public", "friends", "custom", "private"];

interface TripPostBody {
  /** Update this specific post directly — the only way to target a post that isn't tied to any plan (itineraryId null), since there's nothing else to upsert against. */
  id?: number;
  /** Omit (or null) for a 여행 후기 written with "완전 새로 작성" — not tied to a saved plan. */
  itineraryId?: number | null;
  title: string;
  content: string;
  images: string[];
  visibility: Visibility;
  /** Required (and only meaningful) when visibility is "custom" — the allowed viewers' user ids, from the author's own followers. */
  visibleToUserIds?: number[];
}

export interface TripPostRow {
  id: number;
  itineraryId: number | null;
  title: string;
  content: string;
  images: string[];
  visibility: Visibility;
  visibleToUserIds: number[];
  createdAt: string;
  updatedAt: string;
}

/** The current user's own trip posts — optionally scoped to one trip, used to prefill 여행 보관함's 여행 후기 쓰기 editor. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ posts: [] });
  }

  const itineraryId = request.nextUrl.searchParams.get("itineraryId");
  const params: (string | number)[] = [session.user.id];
  let where = `"userId" = $1`;
  if (itineraryId) {
    params.push(Number(itineraryId));
    where += ` and "itineraryId" = $2`;
  }

  const result = await pool.query(
    `select p.id, p."itineraryId", p.title, p.content, p.images, p.visibility,
            coalesce((select array_agg(v."userId") from trip_post_visible_to v where v."postId" = p.id), '{}') as "visibleToUserIds",
            p.created_at as "createdAt", p.updated_at as "updatedAt"
     from trip_posts p where ${where} order by p.updated_at desc`,
    params,
  );
  return NextResponse.json({ posts: result.rows });
}

/** Replaces the "custom" visibility allow-list for a post with exactly `userIds` — a no-op empty list when visibility isn't "custom". */
async function setVisibleTo(postId: number, visibility: Visibility, userIds: number[]) {
  await pool.query(`delete from trip_post_visible_to where "postId" = $1`, [postId]);
  if (visibility !== "custom" || userIds.length === 0) return;
  const values = userIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await pool.query(`insert into trip_post_visible_to ("postId", "userId") values ${values} on conflict do nothing`, [postId, ...userIds]);
}

/**
 * Creates or updates the current user's overall write-up for a trip.
 *  - `id` given: updates that specific post directly (required once a post
 *    isn't tied to any plan — a NULL itineraryId never matches another NULL
 *    in the unique constraint below, so there'd be nothing to upsert against).
 *  - `id` omitted, `itineraryId` given: upserts the one post for that plan.
 *  - both omitted: a wholly fresh, plan-less post ("완전 새로 작성").
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as TripPostBody;
  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const visibility: Visibility = VISIBILITIES.includes(body.visibility) ? body.visibility : "private";
  const visibleToUserIds = visibility === "custom" ? (body.visibleToUserIds ?? []).map(Number).filter(Boolean) : [];
  const images = JSON.stringify((body.images ?? []).slice(0, 10));
  const itineraryId = body.itineraryId ?? null;
  const isPublic = visibility === "public";

  if (body.id) {
    const updated = await pool.query(
      `update trip_posts set title = $3, content = $4, images = $5, visibility = $6, "isPublic" = $7, "itineraryId" = $8, updated_at = now()
       where id = $1 and "userId" = $2
       returning id`,
      [body.id, session.user.id, body.title.trim(), body.content.trim(), images, visibility, isPublic, itineraryId],
    );
    if (updated.rowCount) {
      await setVisibleTo(updated.rows[0].id, visibility, visibleToUserIds);
      return NextResponse.json({ id: updated.rows[0].id });
    }
    // Given id doesn't exist or belongs to someone else — fall through and
    // create a fresh row rather than erroring, same as itineraries' POST.
  }

  if (itineraryId != null) {
    const result = await pool.query(
      `insert into trip_posts ("userId", "itineraryId", title, content, images, visibility, "isPublic")
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict ("userId", "itineraryId")
       do update set title = $3, content = $4, images = $5, visibility = $6, "isPublic" = $7, updated_at = now()
       returning id`,
      [session.user.id, itineraryId, body.title.trim(), body.content.trim(), images, visibility, isPublic],
    );
    await setVisibleTo(result.rows[0].id, visibility, visibleToUserIds);
    return NextResponse.json({ id: result.rows[0].id });
  }

  const result = await pool.query(
    `insert into trip_posts ("userId", "itineraryId", title, content, images, visibility, "isPublic")
     values ($1, null, $2, $3, $4, $5, $6)
     returning id`,
    [session.user.id, body.title.trim(), body.content.trim(), images, visibility, isPublic],
  );
  await setVisibleTo(result.rows[0].id, visibility, visibleToUserIds);
  return NextResponse.json({ id: result.rows[0].id });
}

/** Deletes one of the current user's trip posts. */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  await pool.query(`delete from trip_posts where id = $1 and "userId" = $2`, [id, session.user.id]);
  return NextResponse.json({ ok: true });
}
