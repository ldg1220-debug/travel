import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

/**
 * Public profile snapshot for any user — nickname/avatar + follower/트메(트래블메이트,
 * 이 앱에서 "팔로잉"과 "친구"(맞팔로우)를 통틀어 부르는 이름) 수, 그리고 현재 뷰어의
 * 팔로우 상태(연결됨/신청 보냄/신청 받음/없음). 닉네임을 탭하면 뜨는 프로필 팝업
 * (UserProfileSheet)의 데이터 소스.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const targetId = Number((await params).id);
  if (!targetId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await auth();
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const userResult = await pool.query(`select id, coalesce(nickname, '여행자') as nickname, image from users where id = $1`, [targetId]);
  if (userResult.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = userResult.rows[0];

  const [followerCountRow, followingCountRow, followingRow, followedByRow] = await Promise.all([
    pool.query(`select count(*)::int as count from follows where "followingId" = $1 and status = 'accepted'`, [targetId]),
    pool.query(`select count(*)::int as count from follows where "followerId" = $1 and status = 'accepted'`, [targetId]),
    viewerId != null
      ? pool.query(`select status from follows where "followerId" = $1 and "followingId" = $2`, [viewerId, targetId])
      : Promise.resolve({ rows: [] as { status: string }[] }),
    viewerId != null
      ? pool.query(`select status from follows where "followerId" = $1 and "followingId" = $2`, [targetId, viewerId])
      : Promise.resolve({ rows: [] as { status: string }[] }),
  ]);

  const outgoingStatus = followingRow.rows[0]?.status as string | undefined;
  const incomingStatus = followedByRow.rows[0]?.status as string | undefined;
  const isFollowing = outgoingStatus === "accepted";
  const isFollowedBy = incomingStatus === "accepted";

  return NextResponse.json({
    id: user.id,
    nickname: user.nickname,
    image: user.image,
    followerCount: followerCountRow.rows[0]?.count ?? 0,
    followingCount: followingCountRow.rows[0]?.count ?? 0,
    isFollowing,
    isFollowedBy,
    isFriend: isFollowing && isFollowedBy,
    isPendingOutgoing: outgoingStatus === "pending",
    isPendingIncoming: incomingStatus === "pending",
  });
}
