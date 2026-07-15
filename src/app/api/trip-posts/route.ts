import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

interface TripPostBody {
  /** Update this specific post directly — the only way to target a post that isn't tied to any plan (itineraryId null), since there's nothing else to upsert against. */
  id?: number;
  /** Omit (or null) for a 여행 후기 written with "완전 새로 작성" — not tied to a saved plan. */
  itineraryId?: number | null;
  title: string;
  content: string;
  images: string[];
  isPublic: boolean;
}

export interface TripPostRow {
  id: number;
  itineraryId: number | null;
  title: string;
  content: string;
  images: string[];
  isPublic: boolean;
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
    `select id, "itineraryId", title, content, images, "isPublic", created_at as "createdAt", updated_at as "updatedAt"
     from trip_posts where ${where} order by updated_at desc`,
    params,
  );
  return NextResponse.json({ posts: result.rows });
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
  const images = JSON.stringify((body.images ?? []).slice(0, 10));
  const itineraryId = body.itineraryId ?? null;

  if (body.id) {
    const updated = await pool.query(
      `update trip_posts set title = $3, content = $4, images = $5, "isPublic" = $6, "itineraryId" = $7, updated_at = now()
       where id = $1 and "userId" = $2
       returning id`,
      [body.id, session.user.id, body.title.trim(), body.content.trim(), images, Boolean(body.isPublic), itineraryId],
    );
    if (updated.rowCount) return NextResponse.json({ id: updated.rows[0].id });
    // Given id doesn't exist or belongs to someone else — fall through and
    // create a fresh row rather than erroring, same as itineraries' POST.
  }

  if (itineraryId != null) {
    const result = await pool.query(
      `insert into trip_posts ("userId", "itineraryId", title, content, images, "isPublic")
       values ($1, $2, $3, $4, $5, $6)
       on conflict ("userId", "itineraryId")
       do update set title = $3, content = $4, images = $5, "isPublic" = $6, updated_at = now()
       returning id`,
      [session.user.id, itineraryId, body.title.trim(), body.content.trim(), images, Boolean(body.isPublic)],
    );
    return NextResponse.json({ id: result.rows[0].id });
  }

  const result = await pool.query(
    `insert into trip_posts ("userId", "itineraryId", title, content, images, "isPublic")
     values ($1, null, $2, $3, $4, $5)
     returning id`,
    [session.user.id, body.title.trim(), body.content.trim(), images, Boolean(body.isPublic)],
  );
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
