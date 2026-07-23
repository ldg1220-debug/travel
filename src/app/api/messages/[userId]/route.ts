import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

export interface ChatMessage {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  createdAt: string;
  read: boolean;
  deleted: boolean;
}

/**
 * A conversation's messages with one specific user, oldest first — and marks
 * every unread message from them as read as a side effect of opening it.
 * Message history stays readable even after the two are no longer 트래블
 * 메이트 (only sending new ones is gated on that, in POST /api/messages).
 */
export const GET = withApiErrorHandling(async (_request: Request, { params }: { params: Promise<{ userId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const otherId = Number((await params).userId);
  if (!otherId) {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  }
  const viewerId = Number(session.user.id);

  const result = await pool.query(
    `select * from (
       select id, "senderId", "recipientId", content, created_at as "createdAt", read, deleted
       from messages
       where ("senderId" = $1 and "recipientId" = $2) or ("senderId" = $2 and "recipientId" = $1)
       order by created_at desc
       limit 100
     ) t order by "createdAt" asc`,
    [viewerId, otherId],
  );

  await pool.query(`update messages set read = true where "senderId" = $1 and "recipientId" = $2 and read = false`, [otherId, viewerId]);

  return NextResponse.json({ messages: result.rows as ChatMessage[] });
});

/** 보낸 사람 본인만 자기 메시지를 삭제할 수 있다 — 행을 지우는 대신 content를 비우고 deleted를 세워, 대화 양쪽 모두에 "삭제된 메시지"로 보이게 한다. */
export const DELETE = withApiErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ userId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const otherId = Number((await params).userId);
  const messageId = Number(new URL(request.url).searchParams.get("messageId"));
  if (!otherId || !messageId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const viewerId = Number(session.user.id);

  const result = await pool.query(
    `update messages set content = '', deleted = true
     where id = $1 and "senderId" = $2 and "recipientId" = $3 and deleted = false`,
    [messageId, viewerId, otherId],
  );
  if ((result.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "삭제할 수 없는 메시지예요" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
});
