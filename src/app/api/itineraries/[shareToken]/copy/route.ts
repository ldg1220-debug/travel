import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { rescheduleItemsToToday } from "@/lib/timeline";
import type { ItineraryItem, Region } from "@/lib/types";

/**
 * "내 계획으로 담아가기" — 공유 링크(/planner/{shareToken})를 받은 사람이
 * 그 계획을 자기 것으로 복사한다. 작업지시서 2026-09-14 "공유 링크에도
 * 담아가기 (유입 루프)" §2 — `/api/trip-posts/[id]/copy`(작업지시서
 * 2026-09-14 "후기에 코스 스냅샷 저장 + 담아가기")를 그대로 본뜬
 * 설계다.
 *
 * ★ "항상 새 행이 핵심입니다" — 이 라우트는 오직 INSERT만 한다. id를
 * 받지도, ON CONFLICT도 쓰지 않는다 — 어떤 경우에도 원본 계획(공유
 * 링크로 열람 중인 그 행)이나 다른 기존 계획을 수정할 방법 자체가
 * 코드에 없다. course-open의 과거 실수(작업지시서 2026-09-14
 * "course-open이 저장된 계획을 덮어씁니다")를 반복하지 않기 위한
 * 구조적 안전장치다.
 *
 * 원본은 shareToken으로 찾는다 — 공유 링크 모델 자체가 "이 토큰을 아는
 * 사람은 볼 수 있다"이므로, 원본의 소유자와 무관하게(자기 자신의 계획을
 * 다시 담아가는 것도 막지 않는다 — trip-posts copy와 같은 관례) 그
 * 스냅샷 시점의 내용을 그대로 복사한다. 공유 링크는 이제 "스냅샷"이라
 * (PlannerBoard.tsx 상단 주석 "Task 3: shared-link viewing" 참고, 실시간
 * 편집 반영이 아니라 최초 로드 시점 고정) 원본이 그 뒤에 어떻게
 * 바뀌든 이 복사본엔 영향이 없다.
 */
export const POST = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { shareToken } = await params;
  const viewerId = Number(session.user.id);

  const result = await pool.query<{ id: number; title: string; region: Region; placesData: ItineraryItem[] }>(
    `select id, title, region, "placesData" from itineraries where "shareToken" = $1`,
    [shareToken],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = result.rows[0];
  if (!Array.isArray(row.placesData) || row.placesData.length === 0) {
    return NextResponse.json({ error: "이 계획엔 담아갈 일정이 없어요" }, { status: 400 });
  }

  // 날짜만 오늘 기준으로 재배치 — 시각·체류시간은 원본 그대로
  // (trip-posts copy와 같은 정책, src/lib/timeline.ts).
  const placesData = rescheduleItemsToToday(row.placesData);
  const newShareToken = randomUUID();
  const title = `${row.title} (복사)`;

  const inserted = await pool.query<{ id: number; shareToken: string }>(
    `insert into itineraries ("userId", title, region, "placesData", "shareToken", "isDraft", origin, "sourceItineraryId")
     values ($1, $2, $3, $4, $5, false, 'copy', $6)
     returning id, "shareToken"`,
    [viewerId, title, row.region, JSON.stringify(placesData), newShareToken, row.id],
  );

  return NextResponse.json({ id: inserted.rows[0].id, shareToken: inserted.rows[0].shareToken });
});
