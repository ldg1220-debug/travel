import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

interface ReviewBody {
  itineraryId: number | null;
  tripPostId?: number | null;
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
  isPublic: boolean;
}

export interface ReviewRow {
  id: number;
  itineraryId: number | null;
  tripPostId: number | null;
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The current user's own reviews — optionally scoped to one trip (`itineraryId`), used to prefill 여행 보관함's per-place 후기 작성 sheet and show "N개 장소 리뷰 작성됨" progress on a trip card. */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ reviews: [] });
  }

  const itineraryId = request.nextUrl.searchParams.get("itineraryId");
  const params: (string | number)[] = [session.user.id];
  let where = `"userId" = $1`;
  if (itineraryId) {
    params.push(Number(itineraryId));
    where += ` and "itineraryId" = $2`;
  }

  const result = await pool.query(
    `select id, "itineraryId", "tripPostId", "placeId", "placeName", rating, content, images, "isPublic", created_at as "createdAt", updated_at as "updatedAt"
     from reviews where ${where} order by updated_at desc`,
    params,
  );
  return NextResponse.json({ reviews: result.rows });
});

/**
 * Creates or updates the current user's review for a place. A plan-linked
 * review (itineraryId set) is scoped one-per-(user, trip, place). A
 * plan-less review ("완전 새로 작성") has no trip to scope by, so it must
 * instead belong to a specific trip_posts row (tripPostId) — the composer
 * always saves the post itself first to get an id before letting the user
 * add any place review, so tripPostId is required here whenever
 * itineraryId is null (never silently falls back to a global, unscoped
 * review shared across every plan-less post the user has ever written).
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ReviewBody;
  if (!body.placeId || !body.content?.trim() || !body.rating) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const rating = Math.min(5, Math.max(1, body.rating));
  const images = JSON.stringify((body.images ?? []).slice(0, 5));
  const itineraryId = body.itineraryId ?? null;
  const tripPostId = body.tripPostId ?? null;
  if (itineraryId == null && tripPostId == null) {
    return NextResponse.json({ error: "글을 먼저 저장해주세요" }, { status: 400 });
  }

  // Postgres never matches NULL = NULL for conflict detection, so a
  // plan-less review (itineraryId null) has to target the partial unique
  // index scoped to those rows (by tripPostId now, not just userId+placeId)
  // instead of the (userId, itineraryId, placeId) index — targeting the
  // wrong one for a NULL itineraryId would silently fall through to a plain
  // INSERT and duplicate the row.
  const conflictTarget =
    itineraryId == null
      ? `("userId", "tripPostId", "placeId") where "itineraryId" is null and "tripPostId" is not null`
      : `("userId", "itineraryId", "placeId")`;

  const result = await pool.query(
    `insert into reviews ("userId", "itineraryId", "tripPostId", "placeId", "placeName", rating, content, images, "isPublic")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict ${conflictTarget}
     do update set rating = $6, content = $7, images = $8, "isPublic" = $9, updated_at = now()
     returning id`,
    [session.user.id, itineraryId, tripPostId, body.placeId, body.placeName ?? "", rating, body.content.trim(), images, Boolean(body.isPublic)],
  );
  return NextResponse.json({ id: result.rows[0].id });
});

/** Deletes one of the current user's reviews. */
export const DELETE = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  await pool.query(`delete from reviews where id = $1 and "userId" = $2`, [id, session.user.id]);
  return NextResponse.json({ ok: true });
});
