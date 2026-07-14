import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";

const DEFAULT_LIMIT = 10;

/** Public feed of published (`isPublic`) trip posts across every user — the blog/Instagram-style overall write-ups, not individual place ratings. Most recently written/edited first, paginated. No auth required to browse. */
export async function GET(request: NextRequest) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `select p.id, p.title, p.content, p.images, p.created_at as "createdAt",
            u.name as "authorName", u.image as "authorImage",
            i.title as "tripTitle"
     from trip_posts p
     join users u on u.id = p."userId"
     left join itineraries i on i.id = p."itineraryId"
     where p."isPublic" = true
     order by p.updated_at desc
     limit $1 offset $2`,
    [limit, offset],
  );

  const countResult = await pool.query(`select count(*)::int as count from trip_posts where "isPublic" = true`);
  const total = countResult.rows[0]?.count ?? 0;

  return NextResponse.json({
    posts: result.rows,
    pagination: { page, limit, total, hasMore: offset + limit < total },
  });
}
