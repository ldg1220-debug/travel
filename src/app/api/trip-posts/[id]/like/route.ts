import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { sendPushToUser } from "@/lib/server/push";

/** Can `viewerId` see this post? Mirrors the GET /api/trip-posts/[id] visibility gate — liking requires the same access as reading. */
async function canView(postId: number, viewerId: number, row: { authorId: number; visibility: string }): Promise<boolean> {
  if (viewerId === row.authorId || row.visibility === "public") return true;
  if (row.visibility === "friends") {
    const mutual = await pool.query(
      `select 1 from follows where "followerId" = $1 and "followingId" = $2 and status = 'accepted'
       and exists (select 1 from follows where "followerId" = $2 and "followingId" = $1 and status = 'accepted')`,
      [viewerId, row.authorId],
    );
    return (mutual.rowCount ?? 0) > 0;
  }
  if (row.visibility === "custom") {
    const allowed = await pool.query(`select 1 from trip_post_visible_to where "postId" = $1 and "userId" = $2`, [postId, viewerId]);
    return (allowed.rowCount ?? 0) > 0;
  }
  return false;
}

/** Likes a trip post — idempotent, and notifies the author (unless liking your own post). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const postId = Number((await params).id);
  const viewerId = Number(session.user.id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const postResult = await pool.query(`select "userId" as "authorId", visibility from trip_posts where id = $1`, [postId]);
  if (postResult.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = postResult.rows[0];
  if (!(await canView(postId, viewerId, row))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const inserted = await pool.query(
    `insert into trip_post_likes ("postId", "userId") values ($1, $2) on conflict ("postId", "userId") do nothing returning id`,
    [postId, viewerId],
  );
  if ((inserted.rowCount ?? 0) > 0 && row.authorId !== viewerId) {
    // 받는 사람이 좋아요 알림을 꺼뒀으면 알림 자체를 남기지 않는다.
    const notified = await pool.query(
      `insert into notifications ("recipientId", "actorId", type, "postId")
       select $1, $2, 'like', $3 where exists (select 1 from users where id = $1 and "notifyLikes")
       returning id`,
      [row.authorId, viewerId, postId],
    );
    if ((notified.rowCount ?? 0) > 0) {
      const liker = await pool.query(`select coalesce(nickname, '여행자') as nickname from users where id = $1`, [viewerId]);
      void sendPushToUser(row.authorId, {
        title: "좋아요",
        body: `${liker.rows[0]?.nickname ?? "여행자"}님이 내 여행 후기를 좋아해요`,
        url: `/trip/${postId}`,
      });
    }
  }
  return NextResponse.json({ ok: true });
}

/** Unlikes a trip post — idempotent. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const postId = Number((await params).id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await pool.query(`delete from trip_post_likes where "postId" = $1 and "userId" = $2`, [postId, session.user.id]);
  return NextResponse.json({ ok: true });
}
