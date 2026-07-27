import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

const LIST_LIMIT = 20;

/**
 * 이 장소(placeId)에 달린 트레쥴 회원들의 리뷰를 전부 모아 최신순으로
 * 준다. 리뷰 자체엔 공개범위가 없고, 그 리뷰가 속한 여행 후기(trip_post)의
 * 공개범위를 그대로 물려받는다 — /api/feed와 같은 기준(전체공개/본인 글/
 * 맞팔로우만 보는 친구공개/글쓴이가 지정한 특정인공개)을 재사용한다.
 * 계획 연동 리뷰는 (userId, itineraryId)로, 완전 새로 작성한 후기의
 * 리뷰는 tripPostId로 그 후기 글에 연결한다(POST /api/reviews와 동일한
 * 두 갈래 스코프).
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const placeId = (request.nextUrl.searchParams.get("placeId") ?? "").trim();
  if (!placeId) {
    return NextResponse.json({ reviews: [] });
  }
  const session = await auth();
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const params: (string | number)[] = [placeId];
  const visibilityChecks = [`p.visibility = 'public'`];
  if (viewerId != null) {
    params.push(viewerId);
    const viewerParam = `$${params.length}`;
    visibilityChecks.push(
      `p."userId" = ${viewerParam}`,
      `(p.visibility = 'friends' and exists (
         select 1 from follows f1 where f1."followerId" = ${viewerParam} and f1."followingId" = p."userId" and f1.status = 'accepted'
       ) and exists (
         select 1 from follows f2 where f2."followerId" = p."userId" and f2."followingId" = ${viewerParam} and f2.status = 'accepted'
       ))`,
      `(p.visibility = 'custom' and exists (
         select 1 from trip_post_visible_to v where v."postId" = p.id and v."userId" = ${viewerParam}
       ))`,
    );
  }

  const result = await pool.query(
    `select r.id, r.rating, r.content, r.images, r.created_at as "createdAt",
            r."userId" as "authorId", coalesce(u.nickname, '여행자') as "authorName", u.image as "authorImage",
            p.id as "tripPostId"
     from reviews r
     join trip_posts p on (
       (r."tripPostId" is not null and p.id = r."tripPostId")
       or (r."tripPostId" is null and r."itineraryId" is not null and p."userId" = r."userId" and p."itineraryId" = r."itineraryId")
     )
     join users u on u.id = r."userId"
     where r."placeId" = $1 and (${visibilityChecks.join(" or ")})
     order by r.created_at desc
     limit ${LIST_LIMIT}`,
    params,
  );

  return NextResponse.json({ reviews: result.rows });
});
