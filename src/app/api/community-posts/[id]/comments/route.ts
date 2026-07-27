import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { sendPushToUser } from "@/lib/server/push";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { canViewCommunityPost } from "@/lib/server/communityVisibility";

const MAX_COMMENT_LENGTH = 500;

/** 이 글을 볼 수 있는 사람만 댓글도 볼 수 있다 — 조회도 쓰기와 같은 공개범위 기준을 재검증한다. */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const postId = Number((await params).id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await auth();
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const postResult = await pool.query(`select "userId" as "authorId", visibility from community_posts where id = $1`, [postId]);
  if (postResult.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const post = postResult.rows[0];
  if (!(await canViewCommunityPost(postId, viewerId, post))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await pool.query(
    `select c.id, c."postId", c."userId", coalesce(u.nickname, '여행자') as "authorName", u.image as "authorImage",
            c.content, c.created_at as "createdAt"
     from community_post_comments c
     join users u on u.id = c."userId"
     where c."postId" = $1
     order by c.created_at asc`,
    [postId],
  );
  return NextResponse.json({ comments: result.rows });
});

/** 댓글을 남긴다 — 이 글을 볼 수 있는 사람만(같은 공개범위 기준). */
export const POST = withApiErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const postId = Number((await params).id);
  const viewerId = Number(session.user.id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await checkRateLimit(`community-comments:${viewerId}`, 20, 600))) {
    return NextResponse.json({ error: "너무 자주 작성했어요. 잠시 후 다시 시도해주세요" }, { status: 429 });
  }

  const postResult = await pool.query(`select "userId" as "authorId", visibility from community_posts where id = $1`, [postId]);
  if (postResult.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const post = postResult.rows[0];
  if (!(await canViewCommunityPost(postId, viewerId, post))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { content?: string };
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "댓글 내용을 입력해주세요" }, { status: 400 });
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: `댓글은 ${MAX_COMMENT_LENGTH}자 이하로 작성해주세요` }, { status: 400 });
  }

  const [inserted, author] = await Promise.all([
    pool.query(
      `insert into community_post_comments ("postId", "userId", content) values ($1, $2, $3)
       returning id, "postId", "userId", content, created_at as "createdAt"`,
      [postId, viewerId, content],
    ),
    pool.query(`select coalesce(nickname, '여행자') as nickname, image from users where id = $1`, [viewerId]),
  ]);
  const comment = inserted.rows[0];
  const authorRow = author.rows[0];

  if (post.authorId !== viewerId) {
    // 받는 사람이 댓글 알림을 꺼뒀으면 알림 자체를 남기지 않는다.
    const notified = await pool.query(
      `insert into notifications ("recipientId", "actorId", type, "communityPostId")
       select $1, $2, 'comment', $3 where exists (select 1 from users where id = $1 and "notifyComments")
       returning id`,
      [post.authorId, viewerId, postId],
    );
    if ((notified.rowCount ?? 0) > 0) {
      void sendPushToUser(post.authorId, {
        title: "새 댓글",
        body: `${authorRow?.nickname ?? "여행자"}님이 내 커뮤니티 글에 댓글을 남겼어요`,
        url: `/community/${postId}`,
      });
    }
  }

  return NextResponse.json({
    comment: { ...comment, authorName: authorRow?.nickname ?? "여행자", authorImage: authorRow?.image ?? null },
  });
});
