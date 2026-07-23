import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

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
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const postId = Number(id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await auth();
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const result = await pool.query(
    `select p.id, p.title, p.content, p.images, p.visibility, p.created_at as "createdAt",
            p."userId" as "authorId", p."itineraryId", coalesce(u.nickname, '여행자') as "authorName", u.image as "authorImage",
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
      `select 1 from follows where "followerId" = $1 and "followingId" = $2 and status = 'accepted'
       and exists (select 1 from follows where "followerId" = $2 and "followingId" = $1 and status = 'accepted')`,
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

  const [likesCountRow, likedRow] = await Promise.all([
    pool.query(`select count(*)::int as count from trip_post_likes where "postId" = $1`, [postId]),
    viewerId != null
      ? pool.query(`select 1 from trip_post_likes where "postId" = $1 and "userId" = $2`, [postId, viewerId])
      : Promise.resolve({ rowCount: 0 }),
  ]);
  row.likesCount = likesCountRow.rows[0]?.count ?? 0;
  row.isLiked = (likedRow.rowCount ?? 0) > 0;

  // A plan-linked post's "다녀온 장소" is every review left for that same
  // trip (itineraryId). A plan-less ("완전 새로 작성") post has no
  // itineraryId to scope by, so it scopes by tripPostId instead — every
  // place review the composer saves for a plan-less post is tagged with
  // this post's own id (see POST /api/reviews), so two different plan-less
  // posts no longer bleed into each other's "다녀온 장소" list. distinct on
  // "placeId" defensively collapses any pre-existing duplicate rows down to
  // each place's most recently updated review.
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
             from reviews where "userId" = $1 and "tripPostId" = $2
             order by "placeId", updated_at desc
           ) t order by created_at asc`,
      [row.authorId, row.itineraryId ?? postId],
    )
  ).rows;

  return NextResponse.json({ post: row, placeReviews, isOwner });
});
