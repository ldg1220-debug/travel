import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { sendPushToUser } from "@/lib/server/push";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { canViewCommunityPost } from "@/lib/server/communityVisibility";

/** Likes a community post — idempotent, and notifies the author (unless liking your own post). */
export const POST = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const postId = Number((await params).id);
  const viewerId = Number(session.user.id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const postResult = await pool.query(`select "userId" as "authorId", visibility from community_posts where id = $1`, [postId]);
  if (postResult.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = postResult.rows[0];
  if (!(await canViewCommunityPost(postId, viewerId, row))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const inserted = await pool.query(
    `insert into community_post_likes ("postId", "userId") values ($1, $2) on conflict ("postId", "userId") do nothing returning id`,
    [postId, viewerId],
  );
  if ((inserted.rowCount ?? 0) > 0 && row.authorId !== viewerId) {
    // 받는 사람이 좋아요 알림을 꺼뒀으면 알림 자체를 남기지 않는다.
    const notified = await pool.query(
      `insert into notifications ("recipientId", "actorId", type, "communityPostId")
       select $1, $2, 'like', $3 where exists (select 1 from users where id = $1 and "notifyLikes")
       returning id`,
      [row.authorId, viewerId, postId],
    );
    if ((notified.rowCount ?? 0) > 0) {
      const liker = await pool.query(`select coalesce(nickname, '여행자') as nickname from users where id = $1`, [viewerId]);
      void sendPushToUser(row.authorId, {
        title: "좋아요",
        body: `${liker.rows[0]?.nickname ?? "여행자"}님이 내 커뮤니티 글을 좋아해요`,
        url: `/community/${postId}`,
      });
    }
  }
  return NextResponse.json({ ok: true });
});

/** Unlikes a community post — idempotent. */
export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const postId = Number((await params).id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await pool.query(`delete from community_post_likes where "postId" = $1 and "userId" = $2`, [postId, session.user.id]);
  return NextResponse.json({ ok: true });
});
