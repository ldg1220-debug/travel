import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";

const DEFAULT_LIMIT = 10;

/**
 * Public feed of published (`isPublic`) trip posts across every user — the
 * blog/Instagram-style overall write-ups, not individual place ratings.
 * Most recently written/edited first, paginated. No auth required to browse.
 *
 * Optional `region` (`domestic`|`international`) filters to posts linked to
 * a plan in that region — a plan-less post has no region and is excluded
 * once a specific region is picked. Optional `q` full-text-ish searches the
 * post's own title/content, its linked trip's title, and the visited
 * places' names (via the author's per-place reviews for that trip) — lets
 * "후기 보기" answer "누가 오사카성 후기 썼지?" without a dedicated search
 * index.
 */
export async function GET(request: NextRequest) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  const region = request.nextUrl.searchParams.get("region");
  const q = request.nextUrl.searchParams.get("q")?.trim() || null;

  const params: (string | number)[] = [];
  const conditions = [`p."isPublic" = true`];

  if (region === "domestic" || region === "international") {
    params.push(region);
    conditions.push(`i.region = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const qParam = `$${params.length}`;
    conditions.push(
      `(p.title ilike ${qParam} or p.content ilike ${qParam} or i.title ilike ${qParam} or exists (
         select 1 from reviews r
         where r."userId" = p."userId" and r."itineraryId" = p."itineraryId" and r."placeName" ilike ${qParam}
       ))`,
    );
  }

  const where = conditions.join(" and ");

  const result = await pool.query(
    `select p.id, p.title, p.content, p.images, p.created_at as "createdAt",
            u.name as "authorName", u.image as "authorImage",
            i.title as "tripTitle", i.region as "region"
     from trip_posts p
     join users u on u.id = p."userId"
     left join itineraries i on i.id = p."itineraryId"
     where ${where}
     order by p.updated_at desc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, limit, offset],
  );

  const countResult = await pool.query(
    `select count(*)::int as count
     from trip_posts p
     left join itineraries i on i.id = p."itineraryId"
     where ${where}`,
    params,
  );
  const total = countResult.rows[0]?.count ?? 0;

  return NextResponse.json({
    posts: result.rows,
    pagination: { page, limit, total, hasMore: offset + limit < total },
  });
}
