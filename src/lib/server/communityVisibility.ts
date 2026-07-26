import { pool } from "@/lib/server/db";

/**
 * 어떤 viewer가 이 community_post를 볼 수 있는지 — 조회·댓글이 같은 기준을
 * 따라야 해서 한 곳에 모아둔다.
 *  - "public": 누구나(비로그인 포함)
 *  - "members": 로그인한 회원이면 누구나(팔로우 관계 무관)
 *  - "custom": 글쓴이가 지정한 허용 목록(community_post_visible_to)만
 *  - "private": 글쓴이 본인만
 */
export async function canViewCommunityPost(
  postId: number,
  viewerId: number | null,
  row: { authorId: number; visibility: string },
): Promise<boolean> {
  if (viewerId != null && viewerId === row.authorId) return true;
  if (row.visibility === "public") return true;
  if (viewerId == null) return false;
  if (row.visibility === "members") return true;
  if (row.visibility === "custom") {
    const allowed = await pool.query(`select 1 from community_post_visible_to where "postId" = $1 and "userId" = $2`, [postId, viewerId]);
    return (allowed.rowCount ?? 0) > 0;
  }
  return false;
}
