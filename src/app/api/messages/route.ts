import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { sendPushToUser } from "@/lib/server/push";

const MAX_CONTENT_LENGTH = 2000;

export interface Conversation {
  userId: number;
  nickname: string | null;
  image: string | null;
  lastMessage: string;
  lastMessageDeleted: boolean;
  lastSenderId: number;
  lastMessageAt: string;
  unreadCount: number;
}

/** Every conversation the current user is part of, most recently active first. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ conversations: [] });
  }
  const viewerId = session.user.id;

  const result = await pool.query(
    `select
       other.id as "userId", other.nickname, other.image,
       latest.content as "lastMessage", latest.deleted as "lastMessageDeleted",
       latest."senderId" as "lastSenderId", latest.created_at as "lastMessageAt",
       coalesce(unread.count, 0) as "unreadCount"
     from (
       select distinct case when "senderId" = $1 then "recipientId" else "senderId" end as "otherId"
       from messages
       where "senderId" = $1 or "recipientId" = $1
     ) c
     join users other on other.id = c."otherId"
     join lateral (
       select content, deleted, "senderId", created_at
       from messages
       where ("senderId" = $1 and "recipientId" = c."otherId") or ("senderId" = c."otherId" and "recipientId" = $1)
       order by created_at desc
       limit 1
     ) latest on true
     left join lateral (
       select count(*)::int as count
       from messages
       where "senderId" = c."otherId" and "recipientId" = $1 and read = false and deleted = false
     ) unread on true
     order by latest.created_at desc`,
    [viewerId],
  );
  return NextResponse.json({ conversations: result.rows as Conversation[] });
}

/** Sends a message — only allowed between mutual 트래블 메이트 (both directions accepted). */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { recipientId?: number; content?: string };
  const recipientId = Number(body.recipientId);
  const content = body.content?.trim();
  if (!recipientId || !content) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (recipientId === Number(session.user.id)) {
    return NextResponse.json({ error: "cannot message yourself" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `메시지는 ${MAX_CONTENT_LENGTH}자 이하로 보내주세요` }, { status: 400 });
  }

  const mutual = await pool.query(
    `select 1 from follows where "followerId" = $1 and "followingId" = $2 and status = 'accepted'
     and exists (select 1 from follows where "followerId" = $2 and "followingId" = $1 and status = 'accepted')`,
    [session.user.id, recipientId],
  );
  if ((mutual.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "트래블 메이트에게만 메시지를 보낼 수 있어요" }, { status: 403 });
  }

  const inserted = await pool.query(
    `insert into messages ("senderId", "recipientId", content) values ($1, $2, $3)
     returning id, "senderId", "recipientId", content, created_at as "createdAt", read, deleted`,
    [session.user.id, recipientId, content],
  );

  const recipient = await pool.query(`select "notifyMessages" from users where id = $1`, [recipientId]);
  if (recipient.rows[0]?.notifyMessages) {
    const sender = await pool.query(`select coalesce(nickname, '여행자') as nickname from users where id = $1`, [session.user.id]);
    void sendPushToUser(recipientId, {
      title: sender.rows[0]?.nickname ?? "여행자",
      body: content.length > 80 ? `${content.slice(0, 80)}…` : content,
      url: `/messages/${session.user.id}`,
    });
  }

  return NextResponse.json({ message: inserted.rows[0] });
}
