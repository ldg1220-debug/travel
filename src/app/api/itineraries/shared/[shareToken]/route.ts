import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/**
 * 공유 링크(/planner/{shareToken})가 읽는 스냅샷 — 최초 로드 시점의
 * 내용을 그대로 돌려준다("Task 3: shared-link viewing", PlannerBoard.tsx
 * 상단 주석 참고. 예전엔 PUT으로 실시간 되쓰기도 지원했지만, 누구나
 * 편집·저장할 수 있는 구조라 한 사람의 실수(비우기)가 모두에게 영구
 * 반영되는 사고가 있어 읽기 전용 스냅샷으로 바뀌었다 — 지금 클라이언트
 * 어디서도 이 라우트에 PUT을 보내지 않는다, 그래서 그 핸들러를
 * 제거한다(작업지시서 2026-09-14 "공유 링크에도 담아가기" §4 점검 중
 * 발견 — 아무도 안 쓰는데 인증 없이 임의 계획을 통째로 덮어쓸 수 있는
 * 엔드포인트가 남아 있었다).
 *
 * `authorName`/`isOwner`는 작업지시서 2026-09-14 "공유 링크에도
 * 담아가기" §2/§4용으로 추가했다 — 지금까지 이 화면은 누구 계획인지
 * 전혀 표시하지 않았다(§4가 지적한 "첫인상"이 그냥 빈 계획판이었던
 * 부분). `isOwner`는 이 계획의 원래 주인이 지금 보고 있는 사람인지를
 * 서버에서 판정해, 클라이언트가 "내 계획으로 담아가기" 버튼을 자기
 * 자신에게는 보여주지 않게 한다.
 */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) => {
  const { shareToken } = await params;
  const session = await auth();
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const result = await pool.query(
    `select i.title, i.region, i."placesData", i.updated_at, i."userId" as "authorId", coalesce(u.nickname, '여행자') as "authorName"
     from itineraries i
     join users u on u.id = i."userId"
     where i."shareToken" = $1`,
    [shareToken],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = result.rows[0];
  return NextResponse.json({
    title: row.title,
    region: row.region,
    placesData: row.placesData,
    updatedAt: row.updated_at,
    authorName: row.authorName,
    isOwner: viewerId != null && viewerId === Number(row.authorId),
  });
});
