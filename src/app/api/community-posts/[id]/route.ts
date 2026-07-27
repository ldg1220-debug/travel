import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { canViewCommunityPost } from "@/lib/server/communityVisibility";
import { isCommunityCategory, type CommunityVisibility } from "@/lib/community";

const VISIBILITIES: CommunityVisibility[] = ["public", "members", "custom", "private"];

async function setVisibleTo(postId: number, visibility: CommunityVisibility, userIds: number[]) {
  await pool.query(`delete from community_post_visible_to where "postId" = $1`, [postId]);
  if (visibility !== "custom" || userIds.length === 0) return;
  const values = userIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await pool.query(`insert into community_post_visible_to ("postId", "userId") values ${values} on conflict do nothing`, [postId, ...userIds]);
}

/** 커뮤니티 글 하나 — 그 글의 공개범위를 볼 수 있는 사람만(비공개/특정인공개/회원공개/전체공개). */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const postId = Number((await params).id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await auth();
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const result = await pool.query(
    `select p.id, p.category, p.title, p.content, p.images, p.visibility, p.created_at as "createdAt",
            p."userId" as "authorId", coalesce(u.nickname, '여행자') as "authorName", u.image as "authorImage"
     from community_posts p
     join users u on u.id = p."userId"
     where p.id = $1`,
    [postId],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = result.rows[0];
  const isOwner = viewerId != null && viewerId === Number(row.authorId);

  if (!(await canViewCommunityPost(postId, viewerId, { authorId: Number(row.authorId), visibility: row.visibility }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isOwner && row.visibility === "custom") {
    const visibleTo = await pool.query(`select "userId" from community_post_visible_to where "postId" = $1`, [postId]);
    row.visibleToUserIds = visibleTo.rows.map((r) => r.userId);
  } else {
    row.visibleToUserIds = [];
  }

  const [likesCountRow, likedRow] = await Promise.all([
    pool.query(`select count(*)::int as count from community_post_likes where "postId" = $1`, [postId]),
    viewerId != null
      ? pool.query(`select 1 from community_post_likes where "postId" = $1 and "userId" = $2`, [postId, viewerId])
      : Promise.resolve({ rowCount: 0 }),
  ]);
  row.likesCount = likesCountRow.rows[0]?.count ?? 0;
  row.isLiked = (likedRow.rowCount ?? 0) > 0;

  return NextResponse.json({ post: row, isOwner });
});

/** 커뮤니티 글 수정 — 글쓴이 본인만. */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const postId = Number((await params).id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    category?: string;
    title?: string;
    content?: string;
    images?: string[];
    visibility?: CommunityVisibility;
    visibleToUserIds?: number[];
  };
  if (body.category !== undefined && !isCommunityCategory(body.category)) {
    return NextResponse.json({ error: "올바르지 않은 카테고리예요" }, { status: 400 });
  }
  if (body.title !== undefined && !body.title.trim()) {
    return NextResponse.json({ error: "제목을 입력해주세요" }, { status: 400 });
  }
  if (body.content !== undefined && !body.content.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });
  }

  const sets: string[] = [`updated_at = now()`];
  const values: (string | number)[] = [];
  if (body.category !== undefined) {
    values.push(body.category);
    sets.push(`category = $${values.length + 2}`);
  }
  if (body.title !== undefined) {
    values.push(body.title.trim());
    sets.push(`title = $${values.length + 2}`);
  }
  if (body.content !== undefined) {
    values.push(body.content.trim());
    sets.push(`content = $${values.length + 2}`);
  }
  if (body.images !== undefined) {
    values.push(JSON.stringify(body.images.slice(0, 5)));
    sets.push(`images = $${values.length + 2}`);
  }
  const visibility = body.visibility !== undefined && VISIBILITIES.includes(body.visibility) ? body.visibility : undefined;
  if (visibility !== undefined) {
    values.push(visibility);
    sets.push(`visibility = $${values.length + 2}`);
  }

  const updated = await pool.query(
    `update community_posts set ${sets.join(", ")} where id = $1 and "userId" = $2 returning id, visibility`,
    [postId, session.user.id, ...values],
  );
  if (updated.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (visibility !== undefined) {
    const visibleToUserIds = visibility === "custom" ? (body.visibleToUserIds ?? []).map(Number).filter(Boolean) : [];
    await setVisibleTo(postId, visibility, visibleToUserIds);
  }
  return NextResponse.json({ ok: true });
});

/** 커뮤니티 글 삭제 — 글쓴이 본인만. */
export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const postId = Number((await params).id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await pool.query(`delete from community_posts where id = $1 and "userId" = $2`, [postId, session.user.id]);
  return NextResponse.json({ ok: true });
});
