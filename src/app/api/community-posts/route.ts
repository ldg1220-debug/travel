import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isCommunityCategory, type CommunityVisibility } from "@/lib/community";

const DEFAULT_LIMIT = 15;
const VISIBILITIES: CommunityVisibility[] = ["public", "members", "custom", "private"];

interface CommunityPostBody {
  category: string;
  title: string;
  content: string;
  images: string[];
  visibility: CommunityVisibility;
  /** Required (and only meaningful) when visibility is "custom" — from the author's own followers. */
  visibleToUserIds?: number[];
}

/**
 * 카테고리별 커뮤니티 글 목록 — 여행 후기(trip_posts)와 별개인 게시판.
 * `category`가 없으면(또는 "all") 전체 카테고리를 섞어서 최신순으로 준다.
 * 열람 범위는 SQL에서 바로 걸러낸다: "public"은 누구나, "members"는
 * 로그인한 사람 누구나, "custom"은 허용 목록에 든 사람만, "private"은
 * 글쓴이 본인만(글쓴이 본인 글은 범위와 무관하게 항상 자기 목록에 보임).
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  const category = request.nextUrl.searchParams.get("category");
  const q = request.nextUrl.searchParams.get("q")?.trim() || null;

  const params: (string | number)[] = [];
  const visibilityChecks = [`p.visibility = 'public'`];
  if (viewerId != null) {
    params.push(viewerId);
    const viewerParam = `$${params.length}`;
    visibilityChecks.push(
      `p."userId" = ${viewerParam}`,
      `p.visibility = 'members'`,
      `(p.visibility = 'custom' and exists (
         select 1 from community_post_visible_to v where v."postId" = p.id and v."userId" = ${viewerParam}
       ))`,
    );
  }
  const conditions = [`(${visibilityChecks.join(" or ")})`];

  if (category && category !== "all") {
    params.push(category);
    conditions.push(`p.category = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const qParam = `$${params.length}`;
    conditions.push(`(p.title ilike ${qParam} or p.content ilike ${qParam})`);
  }

  const where = conditions.join(" and ");

  const [result, countResult] = await Promise.all([
    pool.query(
      `select p.id, p.category, p.title, p.content, p.images, p.created_at as "createdAt",
              p."userId" as "authorId", coalesce(u.nickname, '여행자') as "authorName", u.image as "authorImage",
              (select count(*)::int from community_post_comments c where c."postId" = p.id) as "commentCount"
       from community_posts p
       join users u on u.id = p."userId"
       where ${where}
       order by p.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset],
    ),
    pool.query(`select count(*)::int as count from community_posts p where ${where}`, params),
  ]);
  const total = countResult.rows[0]?.count ?? 0;

  return NextResponse.json({
    posts: result.rows,
    pagination: { page, limit, total, hasMore: offset + limit < total },
  });
});

/** Replaces the "custom" visibility allow-list for a post with exactly `userIds` — a no-op empty list when visibility isn't "custom". */
async function setVisibleTo(postId: number, visibility: CommunityVisibility, userIds: number[]) {
  await pool.query(`delete from community_post_visible_to where "postId" = $1`, [postId]);
  if (visibility !== "custom" || userIds.length === 0) return;
  const values = userIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await pool.query(`insert into community_post_visible_to ("postId", "userId") values ${values} on conflict do nothing`, [postId, ...userIds]);
}

/** 새 커뮤니티 글 작성 — 로그인한 회원만 쓸 수 있다. */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await checkRateLimit(`community-post:${session.user.id}`, 10, 3600))) {
    return NextResponse.json({ error: "너무 자주 작성했어요. 잠시 후 다시 시도해주세요" }, { status: 429 });
  }

  const body = (await request.json()) as CommunityPostBody;
  if (!isCommunityCategory(body.category)) {
    return NextResponse.json({ error: "올바르지 않은 카테고리예요" }, { status: 400 });
  }
  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }
  const visibility: CommunityVisibility = VISIBILITIES.includes(body.visibility) ? body.visibility : "public";
  const visibleToUserIds = visibility === "custom" ? (body.visibleToUserIds ?? []).map(Number).filter(Boolean) : [];
  const images = JSON.stringify((body.images ?? []).slice(0, 5));

  const result = await pool.query(
    `insert into community_posts ("userId", category, title, content, images, visibility)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [session.user.id, body.category, body.title.trim(), body.content.trim(), images, visibility],
  );
  await setVisibleTo(result.rows[0].id, visibility, visibleToUserIds);
  return NextResponse.json({ id: result.rows[0].id });
});
