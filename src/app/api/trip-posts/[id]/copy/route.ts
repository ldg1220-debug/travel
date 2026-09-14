import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { canViewTripPost } from "@/lib/server/tripPostVisibility";
import { rescheduleItemsToToday } from "@/lib/timeline";
import type { CourseSnapshot } from "@/lib/types";

/**
 * "내 계획으로 담아가기" — 후기(trip_posts)에 얼려둔 코스 스냅샷을 로그인한
 * 사용자의 새 계획으로 복사한다. 작업지시서 2026-09-14 "후기에 코스
 * 스냅샷 저장 + 담아가기" §4.
 *
 * ★ "항상 새 행이 핵심입니다" — 이 라우트는 오직 INSERT만 한다. id를
 * 받지도, ON CONFLICT도 쓰지 않는다 — 어떤 경우에도 기존 계획(누구의
 * 것이든)을 수정할 방법 자체가 코드에 없다. course-open의 "빈 계획
 * 멱등 재사용" 같은 실수를 반복하지 않기 위한 구조적 안전장치다.
 */
export const POST = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const postId = Number((await params).id);
  if (!postId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const viewerId = Number(session.user.id);

  const result = await pool.query<{ authorId: number; visibility: string; coursesSnapshot: CourseSnapshot | null }>(
    `select "userId" as "authorId", visibility, "coursesSnapshot" from trip_posts where id = $1`,
    [postId],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = result.rows[0];
  if (!(await canViewTripPost(postId, viewerId, row))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!row.coursesSnapshot || row.coursesSnapshot.items.length === 0) {
    return NextResponse.json({ error: "이 후기엔 담아갈 코스가 없어요" }, { status: 400 });
  }

  // 날짜만 오늘 기준으로 재배치 — 시각·체류시간은 스냅샷 그대로.
  const placesData = rescheduleItemsToToday(row.coursesSnapshot.items);
  const shareToken = randomUUID();
  const title = `${row.coursesSnapshot.title} (복사)`;

  const inserted = await pool.query<{ id: number; shareToken: string }>(
    `insert into itineraries ("userId", title, region, "placesData", "shareToken", "isDraft", origin, "sourceReviewId")
     values ($1, $2, $3, $4, $5, false, 'copy', $6)
     returning id, "shareToken"`,
    [viewerId, title, row.coursesSnapshot.region, JSON.stringify(placesData), shareToken, postId],
  );

  return NextResponse.json({ id: inserted.rows[0].id, shareToken: inserted.rows[0].shareToken });
});
