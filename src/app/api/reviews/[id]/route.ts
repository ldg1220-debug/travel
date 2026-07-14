import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

/**
 * A single review, with enough context (trip title, author) to render a
 * standalone public share page — visible to anyone if it's published to
 * the feed (`isPublic`), otherwise only to its own author.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reviewId = Number(id);
  if (!reviewId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await auth();

  const result = await pool.query(
    `select r.id, r."placeId", r."placeName", r.rating, r.content, r.images, r."isPublic", r.created_at as "createdAt",
            r."userId", u.name as "authorName", u.image as "authorImage",
            i.title as "tripTitle", i.id as "itineraryId"
     from reviews r
     join users u on u.id = r."userId"
     left join itineraries i on i.id = r."itineraryId"
     where r.id = $1`,
    [reviewId],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = result.rows[0];
  const isOwner = session?.user?.id != null && String(session.user.id) === String(row.userId);
  if (!row.isPublic && !isOwner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ review: row, isOwner });
}
