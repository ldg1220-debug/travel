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

  const placeReviews = row.itineraryId
    ? (
        await pool.query(
          `select "placeId", "placeName", rating, content, images
           from reviews where "userId" = $1 and "itineraryId" = $2
           order by created_at asc`,
          [row.userId, row.itineraryId],
        )
      ).rows
    : [];

  return NextResponse.json({ post: row, placeReviews, isOwner });
}
