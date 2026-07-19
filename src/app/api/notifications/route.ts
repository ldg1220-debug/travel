import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

const LIST_LIMIT = 30;

/** Latest notifications (팔로우/좋아요) for the current user, newest first, plus the unread count for the bell badge. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  const [listResult, unreadResult] = await Promise.all([
    pool.query(
      `select n.id, n.type, n."actorId", coalesce(u.nickname, '여행자') as "actorName", u.image as "actorImage",
              n."postId", p.title as "postTitle", n.read, n.created_at as "createdAt"
       from notifications n
       join users u on u.id = n."actorId"
       left join trip_posts p on p.id = n."postId"
       where n."recipientId" = $1
       order by n.created_at desc
       limit ${LIST_LIMIT}`,
      [session.user.id],
    ),
    pool.query(`select count(*)::int as count from notifications where "recipientId" = $1 and read = false`, [session.user.id]),
  ]);

  return NextResponse.json({ notifications: listResult.rows, unreadCount: unreadResult.rows[0]?.count ?? 0 });
}

/** Marks all of the current user's notifications as read (called when the bell panel opens). */
export async function PATCH() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await pool.query(`update notifications set read = true where "recipientId" = $1 and read = false`, [session.user.id]);
  return NextResponse.json({ ok: true });
}
