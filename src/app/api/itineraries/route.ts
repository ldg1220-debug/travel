import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import type { ItineraryItem, Region } from "@/lib/types";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

// 작업지시서 2026-09-16 "계획 덮어쓰기가 재발했습니다" §3-③ — 되돌리기용
// 이력을 무한정 쌓지 않고 계획 하나당 최근 N개만 남긴다(id-기반 저장은
// 자동 저장도 거치는 흔한 경로라 무제한으로 두면 금방 불어난다).
const MAX_REVISIONS_PER_ITINERARY = 20;

interface SaveItineraryBody {
  /**
   * The specific server row to update (must belong to this user) — omit to
   * create a new row. Without this, every save/share from the same account
   * used to collide on "the user's one itinerary," so sharing a second,
   * unrelated plan silently overwrote and reused the same link the first
   * plan's recipients already had open.
   */
  id?: number;
  title?: string;
  region: Region;
  /** The frontend's `schedule` array — stored as-is in the placesData JSONB column. */
  placesData: ItineraryItem[];
  /** True for the one unnamed "진행 중인 계획" scratchpad row — kept out of the named "저장된 계획" list (see GET below). */
  isDraft?: boolean;
}

/**
 * Every itinerary the current user has ever saved/shared, most recent first
 * — split into the named "저장된 계획" list and the one (if any) unnamed
 * draft row, so the client never has to filter isDraft out itself.
 */
export const GET = withApiErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ itineraries: [], draft: null });
  }

  const result = await pool.query(
    `select id, title, region, "placesData", "shareToken", "isDraft" from itineraries where "userId" = $1 order by updated_at desc`,
    [session.user.id],
  );
  const draft = result.rows.find((r) => r.isDraft) ?? null;
  const itineraries = result.rows.filter((r) => !r.isDraft);
  return NextResponse.json({ itineraries, draft });
});

/**
 * Creates or updates one of the current user's itineraries. Passing `id`
 * updates that specific row (a re-save or re-share of an already-known
 * plan, reusing its existing shareToken); omitting it always inserts a new
 * row with a fresh shareToken, so two different plans never end up
 * aliasing the same link.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SaveItineraryBody;
  const title = body.title?.trim() || "My Trip";
  const placesDataJson = JSON.stringify(body.placesData ?? []);

  if (body.id) {
    const existing = await pool.query(
      `select id, "shareToken", origin, title, region, "placesData" from itineraries where id = $1 and "userId" = $2`,
      [body.id, session.user.id],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      // 작업지시서 2026-09-16 "계획 덮어쓰기가 재발했습니다" §3-③ — 방어
      // 계층. origin='content'(course-open이 만든 콘텐츠 사본)인 행은
      // 시스템 계정(CONTENT_OWNER_EMAIL) 소유라 위 "userId" = $2 조건이
      // 이미 실제 로그인 사용자와 걸러내지만, 그 전제가 어떤 이유로든
      // 깨지는 경우를 대비해 명시적으로 한 번 더 막는다. origin='copy'
      // (담아가기로 복사된 행)는 막지 않는다 — 복사된 뒤로는 평범한
      // 사용자 계획이라 정상적으로 계속 편집·저장돼야 한다(막으면
      // "담아가기" 기능 자체가 무의미해진다 — 지시서가 이 값도 같이
      // 막자고 했지만, 그건 기존 설계와 충돌해 적용하지 않았다).
      if (row.origin === "content") {
        return NextResponse.json({ error: "cannot update a content-owned plan" }, { status: 403 });
      }

      // §3-③ — 덮어쓰기 직전 내용을 이력에 남긴다("이번 사고"의 핵심
      // 문제: 이력이 없어 원본을 복구할 방법이 없었다). 한 행당 최근
      // MAX_REVISIONS개만 남기고 오래된 것부터 정리한다.
      await pool.query(
        `insert into itinerary_revisions ("itineraryId", title, region, "placesData") values ($1, $2, $3, $4)`,
        [row.id, row.title, row.region, JSON.stringify(row.placesData)],
      );
      await pool.query(
        `delete from itinerary_revisions where "itineraryId" = $1 and id not in (
           select id from itinerary_revisions where "itineraryId" = $1 order by created_at desc limit $2
         )`,
        [row.id, MAX_REVISIONS_PER_ITINERARY],
      );

      const shareToken = row.shareToken ?? randomUUID();
      await pool.query(
        `update itineraries set title = $2, region = $3, "placesData" = $4, "shareToken" = $5, updated_at = now() where id = $1`,
        [body.id, title, body.region, placesDataJson, shareToken],
      );
      return NextResponse.json({ id: body.id, shareToken });
    }
    // Given id doesn't exist or belongs to someone else — fall through and
    // create a fresh row rather than erroring, so a stale client-side id
    // (e.g. after a local reset) degrades to "just make a new plan".
  }

  const shareToken = randomUUID();
  const inserted = await pool.query(
    `insert into itineraries ("userId", title, region, "placesData", "shareToken", "isDraft") values ($1, $2, $3, $4, $5, $6) returning id`,
    [session.user.id, title, body.region, placesDataJson, shareToken, Boolean(body.isDraft)],
  );
  return NextResponse.json({ id: inserted.rows[0].id, shareToken });
});

/**
 * Deletes one of the current user's itineraries — used when 저장된 계획 is
 * removed locally, so the server-side row doesn't outlive it and get pulled
 * back in as a "new" plan by the next cross-device hydration.
 */
export const DELETE = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  await pool.query(`delete from itineraries where id = $1 and "userId" = $2`, [id, session.user.id]);
  return NextResponse.json({ ok: true });
});
