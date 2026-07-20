import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

export interface ChatMessage {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  createdAt: string;
}

/**
 * A conversation's messages with one specific user, oldest first — and marks
 * every unread message from them as read as a side effect of opening it.
 * Message history stays readable even after the two are no longer 트래블
 * 메이트 (only sending new ones is gated on that, in POST /api/messages).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
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
       select id, "senderId", "recipientId", content, created_at as "createdAt"
       from messages
       where ("senderId" = $1 and "recipientId" = $2) or ("senderId" = $2 and "recipientId" = $1)
       order by created_at desc
       limit 100
     ) t order by "createdAt" asc`,
    [viewerId, otherId],
  );

  await pool.query(`update messages set read = true where "senderId" = $1 and "recipientId" = $2 and read = false`, [otherId, viewerId]);

  return NextResponse.json({ messages: result.rows as ChatMessage[] });
}
