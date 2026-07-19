import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

const DEFAULT_LIMIT = 10;

/**
 * Public feed of visible trip posts across every user — the blog/Instagram-
 * style overall write-ups, not individual place ratings. Most recently
 * written/edited first, paginated. Browsable without logging in, but only
 * "public" posts show up for an anonymous viewer — "friends" (맞팔로우) and
 * "custom" (선택된 팔로워) posts only appear for a signed-in viewer who
 * actually qualifies.
 *
 * Optional `region` (`domestic`|`international`) filters to posts linked to
 * a plan in that region — a plan-less post has no region and is excluded
 * once a specific region is picked. Optional `q` full-text-ish searches the
 * post's own title/content, its linked trip's title, and the visited
 * places' names (via the author's per-place reviews for that trip) — lets
 * "후기 보기" answer "누가 오사카성 후기 썼지?" without a dedicated search
 * index.
 *
 * Optional `scope=following` narrows the feed to only posts by people the
 * signed-in viewer follows (still gated by each post's own visibility —
 * a followed-but-not-mutual author's "friends" posts stay hidden). Requires
 * login; returns an empty page for an anonymous viewer.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  const region = request.nextUrl.searchParams.get("region");
  const q = request.nextUrl.searchParams.get("q")?.trim() || null;
  const scope = request.nextUrl.searchParams.get("scope");

  if (scope === "following" && viewerId == null) {
    return NextResponse.json({ posts: [], pagination: { page, limit, total: 0, hasMore: false } });
  }

  const params: (string | number)[] = [];
  const visibilityChecks = [`p.visibility = 'public'`];
  if (viewerId != null) {
    params.push(viewerId);
    const viewerParam = `$${params.length}`;
    visibilityChecks.push(
      `(p.visibility = 'friends' and exists (
         select 1 from follows f1 where f1."followerId" = ${viewerParam} and f1."followingId" = p."userId"
       ) and exists (
         select 1 from follows f2 where f2."followerId" = p."userId" and f2."followingId" = ${viewerParam}
       ))`,
      `(p.visibility = 'custom' and exists (
         select 1 from trip_post_visible_to v where v."postId" = p.id and v."userId" = ${viewerParam}
       ))`,
    );
  }
  const conditions = [`(${visibilityChecks.join(" or ")})`];

  if (scope === "following" && viewerId != null) {
    params.push(viewerId);
    conditions.push(`exists (select 1 from follows f where f."followerId" = $${params.length} and f."followingId" = p."userId")`);
  }

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
            p."userId" as "authorId", coalesce(u.nickname, '여행자') as "authorName", u.image as "authorImage",
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
