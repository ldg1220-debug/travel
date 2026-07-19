import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

export interface FollowUser {
  id: number;
  name: string | null;
  image: string | null;
}

export interface FollowStatus {
  /** I follow them. */
  isFollowing: boolean;
  /** They follow me. */
  isFollowedBy: boolean;
  /** Both directions — what "친구공개" gates on. */
  isFriend: boolean;
  followerCount: number;
  followingCount: number;
}

/**
 * Two modes, both scoped to the current session:
 *  - `?targetUserId=` — follow status + counts for that one user (used by a
 *    follow button, e.g. on /trip/[id] when viewing someone else's post).
 *  - `?list=followers|following` — the current user's own follower/following
 *    list (used by TripPostComposer's "특정인 선택" picker for a "custom"
 *    visibility post).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const targetUserId = request.nextUrl.searchParams.get("targetUserId");
  const list = request.nextUrl.searchParams.get("list");

  if (list === "followers" || list === "following") {
    if (!session?.user?.id) {
      return NextResponse.json({ users: [] });
    }
    const result =
      list === "followers"
        ? await pool.query(
            `select u.id, u.nickname as name, u.image from follows f join users u on u.id = f."followerId" where f."followingId" = $1 order by f.created_at desc`,
            [session.user.id],
          )
        : await pool.query(
            `select u.id, u.nickname as name, u.image from follows f join users u on u.id = f."followingId" where f."followerId" = $1 order by f.created_at desc`,
            [session.user.id],
          );
    return NextResponse.json({ users: result.rows as FollowUser[] });
  }

  const targetId = Number(targetUserId);
  if (!targetId) {
    return NextResponse.json({ error: "missing targetUserId" }, { status: 400 });
  }

  const viewerId = session?.user?.id ? Number(session.user.id) : null;
  const [followingRow, followedByRow, followerCountRow, followingCountRow] = await Promise.all([
    viewerId
      ? pool.query(`select 1 from follows where "followerId" = $1 and "followingId" = $2`, [viewerId, targetId])
      : Promise.resolve({ rowCount: 0 }),
    viewerId
      ? pool.query(`select 1 from follows where "followerId" = $1 and "followingId" = $2`, [targetId, viewerId])
      : Promise.resolve({ rowCount: 0 }),
    pool.query(`select count(*)::int as count from follows where "followingId" = $1`, [targetId]),
    pool.query(`select count(*)::int as count from follows where "followerId" = $1`, [targetId]),
  ]);

  const isFollowing = (followingRow.rowCount ?? 0) > 0;
  const isFollowedBy = (followedByRow.rowCount ?? 0) > 0;
  const status: FollowStatus = {
    isFollowing,
    isFollowedBy,
    isFriend: isFollowing && isFollowedBy,
    followerCount: followerCountRow.rows[0]?.count ?? 0,
    followingCount: followingCountRow.rows[0]?.count ?? 0,
  };
  return NextResponse.json(status);
}

/** Follows a user — idempotent (following again is a no-op, not an error). */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { targetUserId?: number };
  const targetId = Number(body.targetUserId);
  if (!targetId) {
    return NextResponse.json({ error: "missing targetUserId" }, { status: 400 });
  }
  if (targetId === Number(session.user.id)) {
    return NextResponse.json({ error: "cannot follow yourself" }, { status: 400 });
  }
  await pool.query(
    `insert into follows ("followerId", "followingId") values ($1, $2) on conflict ("followerId", "followingId") do nothing`,
    [session.user.id, targetId],
  );
  return NextResponse.json({ ok: true });
}

/** Unfollows a user. */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const targetId = Number(request.nextUrl.searchParams.get("targetUserId"));
  if (!targetId) {
    return NextResponse.json({ error: "missing targetUserId" }, { status: 400 });
  }
  await pool.query(`delete from follows where "followerId" = $1 and "followingId" = $2`, [session.user.id, targetId]);
  return NextResponse.json({ ok: true });
}
