import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

export interface FollowUser {
  id: number;
  name: string | null;
  image: string | null;
}

export interface FollowStatus {
  /** I follow them (accepted). */
  isFollowing: boolean;
  /** They follow me (accepted). */
  isFollowedBy: boolean;
  /** Both directions — what "트메공개" gates on. */
  isFriend: boolean;
  /** I've sent them a 트메 신청 that they haven't responded to yet. */
  isPendingOutgoing: boolean;
  /** They've sent me a 트메 신청 I haven't responded to yet. */
  isPendingIncoming: boolean;
  followerCount: number;
  followingCount: number;
}

/**
 * Two modes, both scoped to the current session:
 *  - `?targetUserId=` — follow status + counts for that one user (used by a
 *    follow button, e.g. on /trip/[id] when viewing someone else's post).
 *  - `?list=followers|following` — the current user's own follower/following
 *    list (used by TripPostComposer's "특정인 선택" picker for a "custom"
 *    visibility post). Only accepted (수락된) relationships count.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const targetUserId = request.nextUrl.searchParams.get("targetUserId");
  const list = request.nextUrl.searchParams.get("list");

  if (list === "followers" || list === "following" || list === "received" || list === "sent") {
    if (!session?.user?.id) {
      return NextResponse.json({ users: [] });
    }
    // followers/following = 수락된 관계, received/sent = 아직 대기 중인 신청
    // (받은 것 = 나에게 온 pending, 보낸 것 = 내가 보낸 pending).
    const queries: Record<string, string> = {
      followers: `select u.id, u.nickname as name, u.image from follows f join users u on u.id = f."followerId" where f."followingId" = $1 and f.status = 'accepted' order by f.created_at desc`,
      following: `select u.id, u.nickname as name, u.image from follows f join users u on u.id = f."followingId" where f."followerId" = $1 and f.status = 'accepted' order by f.created_at desc`,
      received: `select u.id, u.nickname as name, u.image from follows f join users u on u.id = f."followerId" where f."followingId" = $1 and f.status = 'pending' order by f.created_at desc`,
      sent: `select u.id, u.nickname as name, u.image from follows f join users u on u.id = f."followingId" where f."followerId" = $1 and f.status = 'pending' order by f.created_at desc`,
    };
    const result = await pool.query(queries[list], [session.user.id]);
    return NextResponse.json({ users: result.rows as FollowUser[] });
  }

  const targetId = Number(targetUserId);
  if (!targetId) {
    return NextResponse.json({ error: "missing targetUserId" }, { status: 400 });
  }

  const viewerId = session?.user?.id ? Number(session.user.id) : null;
  const [followingRow, followedByRow, followerCountRow, followingCountRow] = await Promise.all([
    viewerId
      ? pool.query(`select status from follows where "followerId" = $1 and "followingId" = $2`, [viewerId, targetId])
      : Promise.resolve({ rows: [] as { status: string }[] }),
    viewerId
      ? pool.query(`select status from follows where "followerId" = $1 and "followingId" = $2`, [targetId, viewerId])
      : Promise.resolve({ rows: [] as { status: string }[] }),
    pool.query(`select count(*)::int as count from follows where "followingId" = $1 and status = 'accepted'`, [targetId]),
    pool.query(`select count(*)::int as count from follows where "followerId" = $1 and status = 'accepted'`, [targetId]),
  ]);

  const outgoingStatus = followingRow.rows[0]?.status as string | undefined;
  const incomingStatus = followedByRow.rows[0]?.status as string | undefined;
  const isFollowing = outgoingStatus === "accepted";
  const isFollowedBy = incomingStatus === "accepted";
  const status: FollowStatus = {
    isFollowing,
    isFollowedBy,
    isFriend: isFollowing && isFollowedBy,
    isPendingOutgoing: outgoingStatus === "pending",
    isPendingIncoming: incomingStatus === "pending",
    followerCount: followerCountRow.rows[0]?.count ?? 0,
    followingCount: followingCountRow.rows[0]?.count ?? 0,
  };
  return NextResponse.json(status);
}

/** Sends a 트메 신청 — idempotent (requesting again while pending/accepted is a no-op). Requires the recipient's acceptance before it counts as a real connection. */
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
  const inserted = await pool.query(
    `insert into follows ("followerId", "followingId", status) values ($1, $2, 'pending') on conflict ("followerId", "followingId") do nothing returning id`,
    [session.user.id, targetId],
  );
  if ((inserted.rowCount ?? 0) > 0) {
    await pool.query(`insert into notifications ("recipientId", "actorId", type) values ($1, $2, 'follow_request')`, [targetId, session.user.id]);
  }
  return NextResponse.json({ ok: true });
}

/** Accepts a pending 트메 신청 sent TO the current user. Body: { requesterId }. */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { requesterId?: number };
  const requesterId = Number(body.requesterId);
  if (!requesterId) {
    return NextResponse.json({ error: "missing requesterId" }, { status: 400 });
  }
  const accepted = await pool.query(
    `update follows set status = 'accepted' where "followerId" = $1 and "followingId" = $2 and status = 'pending' returning id`,
    [requesterId, session.user.id],
  );
  if ((accepted.rowCount ?? 0) > 0) {
    await pool.query(`insert into notifications ("recipientId", "actorId", type) values ($1, $2, 'follow_accept')`, [requesterId, session.user.id]);
  }
  return NextResponse.json({ ok: true });
}

/**
 * Two modes, both scoped to the current session:
 *  - `?targetUserId=` — removes MY OWN outgoing edge toward that user,
 *    whatever its status: cancels my pending request, or unfollows an
 *    already-accepted connection.
 *  - `?requesterId=` — rejects a pending 트메 신청 sent TO me by that user.
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const targetUserId = request.nextUrl.searchParams.get("targetUserId");
  const requesterUserId = request.nextUrl.searchParams.get("requesterId");

  if (requesterUserId) {
    const requesterId = Number(requesterUserId);
    if (!requesterId) {
      return NextResponse.json({ error: "missing requesterId" }, { status: 400 });
    }
    await pool.query(`delete from follows where "followerId" = $1 and "followingId" = $2 and status = 'pending'`, [
      requesterId,
      session.user.id,
    ]);
    return NextResponse.json({ ok: true });
  }

  const targetId = Number(targetUserId);
  if (!targetId) {
    return NextResponse.json({ error: "missing targetUserId" }, { status: 400 });
  }
  await pool.query(`delete from follows where "followerId" = $1 and "followingId" = $2`, [session.user.id, targetId]);
  return NextResponse.json({ ok: true });
}
