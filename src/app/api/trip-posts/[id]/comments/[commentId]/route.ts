import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/** 댓글 삭제 — 작성자 본인 또는 그 글의 주인(모더레이션 목적)만 지울 수 있다. */
export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, commentId: commentIdParam } = await params;
    const postId = Number(id);
    const commentId = Number(commentIdParam);
    const viewerId = Number(session.user.id);
    if (!postId || !commentId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await pool.query(
      `select c."userId" as "commentAuthorId", p."userId" as "postAuthorId"
       from trip_post_comments c
       join trip_posts p on p.id = c."postId"
       where c.id = $1 and c."postId" = $2`,
      [commentId, postId],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = result.rows[0];
    if (viewerId !== row.commentAuthorId && viewerId !== row.postAuthorId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await pool.query(`delete from trip_post_comments where id = $1`, [commentId]);
    return NextResponse.json({ ok: true });
  },
);
