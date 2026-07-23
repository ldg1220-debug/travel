import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

const LIST_LIMIT = 30;

/** Latest notifications (팔로우/좋아요) for the current user, newest first, plus the unread count for the bell badge. */
export const GET = withApiErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  const [listResult, unreadResult] = await Promise.all([
    pool.query(
      `select n.id, n.type, n."actorId", coalesce(u.nickname, '여행자') as "actorName", u.image as "actorImage",
              n."postId", p.title as "postTitle", n.read, n.created_at as "createdAt",
              -- 'follow_request' 알림의 수락/거절 버튼은 실제 신청이 아직 대기 중일
              -- 때만 보여준다 — 이미 처리됐거나(수락/취소·거절로 행이 사라짐) 지난
              -- 알림이면 매번 조회 시점의 실제 상태를 그대로 반영한다.
              case when n.type = 'follow_request' then coalesce(f.status, 'none') else null end as "requestStatus"
       from notifications n
       join users u on u.id = n."actorId"
       left join trip_posts p on p.id = n."postId"
       left join follows f on f."followerId" = n."actorId" and f."followingId" = n."recipientId" and n.type = 'follow_request'
       where n."recipientId" = $1
       order by n.created_at desc
       limit $2`,
      [session.user.id, LIST_LIMIT],
    ),
    pool.query(`select count(*)::int as count from notifications where "recipientId" = $1 and read = false`, [session.user.id]),
  ]);

  return NextResponse.json({ notifications: listResult.rows, unreadCount: unreadResult.rows[0]?.count ?? 0 });
});

/** Marks all of the current user's notifications as read (called when the bell panel opens). */
export const PATCH = withApiErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await pool.query(`update notifications set read = true where "recipientId" = $1 and read = false`, [session.user.id]);
  return NextResponse.json({ ok: true });
});
