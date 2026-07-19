import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

/**
 * A single trip post with author/trip context plus its author's per-place
 * reviews for the same trip (the "다녀온 장소" section embedded read-only
 * on the /trip/[id] page) — visible to anyone if published (`isPublic`),
 * otherwise only to its own author.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await auth();

  const result = await pool.query(
    `select p.id, p.title, p.content, p.images, p."isPublic", p.created_at as "createdAt",
            p."userId", p."itineraryId", u.name as "authorName", u.image as "authorImage",
            i.title as "tripTitle"
     from trip_posts p
     join users u on u.id = p."userId"
     left join itineraries i on i.id = p."itineraryId"
     where p.id = $1`,
    [postId],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = result.rows[0];
  const isOwner = session?.user?.id != null && String(session.user.id) === String(row.userId);
  if (!row.isPublic && !isOwner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A plan-linked post's "다녀온 장소" is every review left for that same
  // trip. A plan-less ("완전 새로 작성") post has no itineraryId to scope
  // by — its ad-hoc place reviews were saved with itineraryId null too, so
  // this falls back to all of the author's plan-less reviews. Imprecise if
  // someone's written more than one plan-less post (reviews aren't tied to
  // a specific trip_posts row), but still the best available signal, and
  // consistent with how TripPostComposer itself already reads plan-less
  // reviews back (fetchMyReviews with no itineraryId = "all of them").
  // distinct on "placeId" defensively collapses any pre-existing duplicate
  // rows (from before the reviews table's plan-less unique index was added)
  // down to each place's most recently updated review, so an old duplicate
  // can't still show a place twice here even before that cleanup runs.
  const placeReviews = (
    await pool.query(
      row.itineraryId
        ? `select "placeId", "placeName", rating, content, images from (
             select distinct on ("placeId") "placeId", "placeName", rating, content, images, created_at
             from reviews where "userId" = $1 and "itineraryId" = $2
             order by "placeId", updated_at desc
           ) t order by created_at asc`
        : `select "placeId", "placeName", rating, content, images from (
             select distinct on ("placeId") "placeId", "placeName", rating, content, images, created_at
             from reviews where "userId" = $1 and "itineraryId" is null
             order by "placeId", updated_at desc
           ) t order by created_at asc`,
      row.itineraryId ? [row.userId, row.itineraryId] : [row.userId],
    )
  ).rows;

  return NextResponse.json({ post: row, placeReviews, isOwner });
}
