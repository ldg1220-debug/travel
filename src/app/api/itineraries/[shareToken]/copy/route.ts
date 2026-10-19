import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { courseSpanLabel, nextSaturday, rescheduleItemsToToday, shiftISODate, daysBetweenInclusive } from "@/lib/timeline";
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
export const POST = withApiErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { shareToken } = await params;
  const viewerId = Number(session.user.id);

  const result = await pool.query<{ id: number; title: string; region: Region; placesData: ItineraryItem[]; origin: string | null }>(
    `select id, title, region, "placesData", origin from itineraries where "shareToken" = $1`,
    [shareToken],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = result.rows[0];
  if (!Array.isArray(row.placesData) || row.placesData.length === 0) {
    return NextResponse.json({ error: "이 계획엔 담아갈 일정이 없어요" }, { status: 400 });
  }

  // 작업지시서 2026-10-19 "담아갈 때 여행 시작일 고르기" — 본문에 시작일(startDate) 또는 날짜 미정(undated)이 오면 그에 맞춰 옮긴다. 시각·체류시간·일차 간격은
  // 그대로. 본문이 없으면(옛 호출) 예전처럼 오늘 기준. 서버 시계는 UTC 라 하루 어긋날 수 있어 과거 검사는 어제까지 허용한다.
  const body = (await request.json().catch(() => ({}))) as { startDate?: unknown; undated?: unknown };
  const startDate = typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ? body.startDate : null;
  if (startDate && startDate < shiftISODate(new Date().toISOString().slice(0, 10), -1)) {
    return NextResponse.json({ error: "지난 날짜는 고를 수 없어요" }, { status: 400 });
  }
  let placesData: ItineraryItem[];
  if (body.undated === true) {
    // 날짜 필드는 정렬·렌더링용 임시 값(다음 토요일부터) — dayNumber 가 있으면 화면은 "N일차"로 표시하고, "날짜 정하기"로 나중에 지정한다.
    const base = rescheduleItemsToToday(row.placesData, nextSaturday());
    const minDate = [...base].map((i) => i.date).sort()[0];
    placesData = base.map((i) => ({ ...i, dayNumber: daysBetweenInclusive(minDate, i.date) }));
  } else {
    // 날짜만 기준일(선택한 시작일, 없으면 오늘)로 재배치 — 시각·체류시간은 원본 그대로 (trip-posts copy와 같은 정책, src/lib/timeline.ts).
    placesData = rescheduleItemsToToday(row.placesData, startDate ?? undefined).map(({ dayNumber: _d, ...rest }) => {
      void _d;
      return rest;
    });
  }
  const newShareToken = randomUUID();
  // 원본이 course-open 콘텐츠 일정("하노이 여행 코스")이면 "하노이 2박3일"처럼 짧고 날짜 없는 제목으로 — 작업지시서 2026-10-19 "담아간 계획의 상단 제목" §4④.
  const contentBase = row.origin === "content" && row.title.endsWith(" 여행 코스") ? row.title.slice(0, -" 여행 코스".length) : null;
  const title = contentBase ? `${contentBase} ${courseSpanLabel(new Set(placesData.map((i) => i.date)).size)}` : `${row.title} (복사)`;

  const inserted = await pool.query<{ id: number; shareToken: string }>(
    `insert into itineraries ("userId", title, region, "placesData", "shareToken", "isDraft", origin, "sourceItineraryId")
     values ($1, $2, $3, $4, $5, false, 'copy', $6)
     returning id, "shareToken"`,
    [viewerId, title, row.region, JSON.stringify(placesData), newShareToken, row.id],
  );

  // 클라이언트가 방금 만든 복사본을 현재 계획으로 바로 전환할 수 있게 내용도 돌려준다(작업지시서 2026-10-19 §4②).
  return NextResponse.json({ id: inserted.rows[0].id, shareToken: inserted.rows[0].shareToken, title, region: row.region, placesData });
});
