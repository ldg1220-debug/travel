import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

/**
 * A single trip post with author/trip context plus its author's per-place
 * reviews for the same trip (the "다녀온 장소" section embedded read-only
 * on the /trip/[id] page). Visibility gates who can see it:
 *  - "public": anyone
 *  - "friends": only viewers who *mutually* follow the author
 *  - "custom": only viewers on the author's explicit allow-list for this post
 *  - "private": only the author
 * The owner can always see their own post regardless of visibility.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await auth();
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const result = await pool.query(
    `select p.id, p.title, p.content, p.images, p.visibility, p.created_at as "createdAt",
            p."userId" as "authorId", p."itineraryId", u.name as "authorName", u.image as "authorImage",
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
  const isOwner = viewerId != null && viewerId === Number(row.authorId);

  let canView = isOwner || row.visibility === "public";
  if (!canView && viewerId != null && row.visibility === "friends") {
    const mutual = await pool.query(
      `select 1 from follows where "followerId" = $1 and "followingId" = $2
       and exists (select 1 from follows where "followerId" = $2 and "followingId" = $1)`,
      [viewerId, row.authorId],
    );
    canView = (mutual.rowCount ?? 0) > 0;
  }
  if (!canView && viewerId != null && row.visibility === "custom") {
    const allowed = await pool.query(`select 1 from trip_post_visible_to where "postId" = $1 and "userId" = $2`, [postId, viewerId]);
    canView = (allowed.rowCount ?? 0) > 0;
  }
  if (!canView) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isOwner && row.visibility === "custom") {
    const visibleTo = await pool.query(`select "userId" from trip_post_visible_to where "postId" = $1`, [postId]);
    row.visibleToUserIds = visibleTo.rows.map((r) => r.userId);
  } else {
    row.visibleToUserIds = [];
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
      row.itineraryId ? [row.authorId, row.itineraryId] : [row.authorId],
    )
  ).rows;

  return NextResponse.json({ post: row, placeReviews, isOwner });
}
