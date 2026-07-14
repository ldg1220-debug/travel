import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";

const DEFAULT_LIMIT = 10;

/** Public feed of published (`isPublic`) reviews across every user — most recently written/edited first, paginated. No auth required to browse, same as any other public feed. */
export async function GET(request: NextRequest) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `select r.id, r."placeId", r."placeName", r.rating, r.content, r.images, r.created_at as "createdAt",
            u.name as "authorName", u.image as "authorImage",
            i.title as "tripTitle"
     from reviews r
     join users u on u.id = r."userId"
     left join itineraries i on i.id = r."itineraryId"
     where r."isPublic" = true
     order by r.updated_at desc
     limit $1 offset $2`,
    [limit, offset],
  );

  const countResult = await pool.query(`select count(*)::int as count from reviews where "isPublic" = true`);
  const total = countResult.rows[0]?.count ?? 0;

  return NextResponse.json({
    reviews: result.rows,
    pagination: { page, limit, total, hasMore: offset + limit < total },
  });
}
