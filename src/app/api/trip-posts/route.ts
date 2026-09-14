import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { computeCourseSnapshot, shouldRefreshSnapshot } from "@/lib/server/tripPostSnapshot";
import type { CourseSnapshot } from "@/lib/types";

type Visibility = "public" | "friends" | "custom" | "private";
const VISIBILITIES: Visibility[] = ["public", "friends", "custom", "private"];

interface TripPostBody {
  /** Update this specific post directly — the only way to target a post that isn't tied to any plan (itineraryId null), since there's nothing else to upsert against. */
  id?: number;
  /** Omit (or null) for a 여행 후기 written with "완전 새로 작성" — not tied to a saved plan. */
  itineraryId?: number | null;
  title: string;
  content: string;
  images: string[];
  visibility: Visibility;
  /** Required (and only meaningful) when visibility is "custom" — the allowed viewers' user ids, from the author's own followers. */
  visibleToUserIds?: number[];
}

export interface TripPostRow {
  id: number;
  itineraryId: number | null;
  title: string;
  content: string;
  images: string[];
  visibility: Visibility;
  visibleToUserIds: number[];
  createdAt: string;
  updatedAt: string;
}

/** The current user's own trip posts — optionally scoped to one trip, used to prefill 여행 보관함's 여행 후기 쓰기 editor. */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ posts: [] });
  }

  const itineraryId = request.nextUrl.searchParams.get("itineraryId");
  const params: (string | number)[] = [session.user.id];
  let where = `"userId" = $1`;
  if (itineraryId) {
    params.push(Number(itineraryId));
    where += ` and "itineraryId" = $2`;
  }

  const result = await pool.query(
    `select p.id, p."itineraryId", p.title, p.content, p.images, p.visibility,
            coalesce((select array_agg(v."userId") from trip_post_visible_to v where v."postId" = p.id), '{}') as "visibleToUserIds",
            p.created_at as "createdAt", p.updated_at as "updatedAt"
     from trip_posts p where ${where} order by p.updated_at desc`,
    params,
  );
  return NextResponse.json({ posts: result.rows });
});

/** Replaces the "custom" visibility allow-list for a post with exactly `userIds` — a no-op empty list when visibility isn't "custom". */
async function setVisibleTo(postId: number, visibility: Visibility, userIds: number[]) {
  await pool.query(`delete from trip_post_visible_to where "postId" = $1`, [postId]);
  if (visibility !== "custom" || userIds.length === 0) return;
  const values = userIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await pool.query(`insert into trip_post_visible_to ("postId", "userId") values ${values} on conflict do nothing`, [postId, ...userIds]);
}

/**
 * Creates or updates the current user's overall write-up for a trip.
 *  - `id` given: updates that specific post directly (required once a post
 *    isn't tied to any plan — a NULL itineraryId never matches another NULL
 *    in the unique constraint below, so there'd be nothing to upsert against).
 *  - `id` omitted, `itineraryId` given: upserts the one post for that plan.
 *  - both omitted: a wholly fresh, plan-less post ("완전 새로 작성").
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as TripPostBody;
  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const visibility: Visibility = VISIBILITIES.includes(body.visibility) ? body.visibility : "private";
  const visibleToUserIds = visibility === "custom" ? (body.visibleToUserIds ?? []).map(Number).filter(Boolean) : [];
  const images = JSON.stringify((body.images ?? []).slice(0, 10));
  const itineraryId = body.itineraryId ?? null;
  const isPublic = visibility === "public";

  const viewerId = Number(session.user.id);

  if (body.id) {
    // 먼저 현재 상태(itineraryId·스냅샷 유무)를 봐야 스냅샷을 새로 찍을지
    // 그대로 지킬지 정할 수 있다 — shouldRefreshSnapshot 참고. 이 SELECT
    // 자체가 소유권 확인도 겸한다(아래 rowCount===0이면 폴백).
    const existing = await pool.query<{ itineraryId: number | null; coursesSnapshot: CourseSnapshot | null }>(
      `select "itineraryId", "coursesSnapshot" from trip_posts where id = $1 and "userId" = $2`,
      [body.id, viewerId],
    );
    if (existing.rowCount) {
      const prior = existing.rows[0];
      let coursesSnapshot: CourseSnapshot | null = prior.coursesSnapshot;
      if (itineraryId == null) {
        coursesSnapshot = null; // 계획 연결을 뗐다 — 스냅샷도 같이 비운다
      } else if (shouldRefreshSnapshot(prior.itineraryId, itineraryId, prior.coursesSnapshot != null)) {
        coursesSnapshot = await computeCourseSnapshot(viewerId, itineraryId);
      }
      const updated = await pool.query(
        `update trip_posts set title = $3, content = $4, images = $5, visibility = $6, "isPublic" = $7, "itineraryId" = $8, "coursesSnapshot" = $9, updated_at = now()
         where id = $1 and "userId" = $2
         returning id`,
        [body.id, viewerId, body.title.trim(), body.content.trim(), images, visibility, isPublic, itineraryId, coursesSnapshot ? JSON.stringify(coursesSnapshot) : null],
      );
      await setVisibleTo(updated.rows[0].id, visibility, visibleToUserIds);
      return NextResponse.json({ id: updated.rows[0].id });
    }
    // Given id doesn't exist or belongs to someone else — fall through and
    // create a fresh row rather than erroring, same as itineraries' POST.
  }

  if (itineraryId != null) {
    // 이 (userId, itineraryId) 조합 행이 이미 있으면 on conflict가 그
    // 행을 갱신하는 것뿐이라 itineraryId 자체는 "안 바뀐" 경우다 —
    // 스냅샷이 아직 없을 때만 채운다(shouldRefreshSnapshot과 같은 정책).
    const existing = await pool.query<{ coursesSnapshot: CourseSnapshot | null }>(
      `select "coursesSnapshot" from trip_posts where "userId" = $1 and "itineraryId" = $2`,
      [viewerId, itineraryId],
    );
    const priorSnapshot = existing.rows[0]?.coursesSnapshot ?? null;
    const coursesSnapshot = priorSnapshot ?? (await computeCourseSnapshot(viewerId, itineraryId));
    const result = await pool.query(
      `insert into trip_posts ("userId", "itineraryId", title, content, images, visibility, "isPublic", "coursesSnapshot")
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict ("userId", "itineraryId")
       do update set title = $3, content = $4, images = $5, visibility = $6, "isPublic" = $7, "coursesSnapshot" = $8, updated_at = now()
       returning id`,
      [viewerId, itineraryId, body.title.trim(), body.content.trim(), images, visibility, isPublic, coursesSnapshot ? JSON.stringify(coursesSnapshot) : null],
    );
    await setVisibleTo(result.rows[0].id, visibility, visibleToUserIds);
    return NextResponse.json({ id: result.rows[0].id });
  }

  const result = await pool.query(
    `insert into trip_posts ("userId", "itineraryId", title, content, images, visibility, "isPublic")
     values ($1, null, $2, $3, $4, $5, $6)
     returning id`,
    [session.user.id, body.title.trim(), body.content.trim(), images, visibility, isPublic],
  );
  await setVisibleTo(result.rows[0].id, visibility, visibleToUserIds);
  return NextResponse.json({ id: result.rows[0].id });
});

/** Deletes one of the current user's trip posts. */
export const DELETE = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  await pool.query(`delete from trip_posts where id = $1 and "userId" = $2`, [id, session.user.id]);
  return NextResponse.json({ ok: true });
});
