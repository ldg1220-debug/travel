import { pool } from "@/lib/server/db";

/**
 * 어떤 viewer가 이 trip_post를 볼 수 있는지 — 조회(GET)·좋아요·댓글이 전부
 * 같은 기준을 따라야 해서 한 곳에 모아둔다(각자 따로 구현하면 한 곳만
 * 고치고 나머지를 놓치는 사고가 나기 쉬운, 공개범위를 다루는 로직이라).
 *  - "public": 누구나
 *  - "friends": 서로 팔로우(상호 트래블 메이트)인 viewer만
 *  - "custom": 글쓴이가 지정한 허용 목록(trip_post_visible_to)에 있는 viewer만
 *  - "private": 글쓴이 본인만
 */
export async function canViewTripPost(
  postId: number,
  viewerId: number | null,
  row: { authorId: number; visibility: string },
): Promise<boolean> {
  if (viewerId != null && viewerId === row.authorId) return true;
  if (row.visibility === "public") return true;
  if (viewerId == null) return false;
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
