import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

const TARGET_TYPES = new Set(["trip_post", "message", "user"]);
const REASONS = new Set(["spam", "abuse", "sexual", "illegal", "other"]);
const MAX_DETAIL_LENGTH = 500;

export interface Report {
  id: number;
  reporterId: number | null;
  reporterNickname: string | null;
  reportedUserId: number | null;
  reportedNickname: string | null;
  targetType: string;
  targetId: number;
  reason: string;
  detail: string;
  status: string;
  adminNote: string;
  createdAt: string;
}

/** targetType별로 신고 대상 콘텐츠의 작성자(신고당하는 사용자) id를 찾는다. */
async function resolveReportedUserId(targetType: string, targetId: number): Promise<number | null> {
  if (targetType === "user") return targetId;
  if (targetType === "trip_post") {
    const r = await pool.query(`select "userId" from trip_posts where id = $1`, [targetId]);
    return r.rows[0]?.userId ?? null;
  }
  if (targetType === "message") {
    const r = await pool.query(`select "senderId" from messages where id = $1`, [targetId]);
    return r.rows[0]?.senderId ?? null;
  }
  return null;
}

/** 신고 접수 — 로그인한 누구나 여행 후기·메시지·사용자 프로필을 신고할 수 있다. */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await checkRateLimit(`reports:${session.user.id}`, 10, 3600))) {
    return NextResponse.json({ error: "신고를 너무 많이 접수했어요. 잠시 후 다시 시도해주세요" }, { status: 429 });
  }
  const body = (await request.json()) as { targetType?: string; targetId?: number; reason?: string; detail?: string };
  const targetType = body.targetType ?? "";
  const targetId = Number(body.targetId);
  const reason = body.reason ?? "";
  const detail = (body.detail ?? "").trim().slice(0, MAX_DETAIL_LENGTH);

  if (!TARGET_TYPES.has(targetType) || !targetId || !REASONS.has(reason)) {
    return NextResponse.json({ error: "invalid report" }, { status: 400 });
  }

  const reportedUserId = await resolveReportedUserId(targetType, targetId);
  if (reportedUserId == null) {
    return NextResponse.json({ error: "신고 대상을 찾을 수 없어요" }, { status: 404 });
  }
  if (reportedUserId === Number(session.user.id)) {
    return NextResponse.json({ error: "자신의 콘텐츠는 신고할 수 없어요" }, { status: 400 });
  }

  await pool.query(
    `insert into reports ("reporterId", "reportedUserId", "targetType", "targetId", reason, detail)
     values ($1, $2, $3, $4, $5, $6)`,
    [session.user.id, reportedUserId, targetType, targetId, reason, detail],
  );
  return NextResponse.json({ ok: true });
});

/** 신고 목록 — 관리자만. 최근 접수 순. */
export const GET = withApiErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await pool.query(
    `select r.id, r."reporterId", reporter.nickname as "reporterNickname",
            r."reportedUserId", reported.nickname as "reportedNickname",
            r."targetType", r."targetId", r.reason, r.detail, r.status, r."adminNote",
            r.created_at as "createdAt"
     from reports r
     left join users reporter on reporter.id = r."reporterId"
     left join users reported on reported.id = r."reportedUserId"
     order by r.created_at desc
     limit 200`,
  );
  return NextResponse.json({ reports: result.rows as Report[] });
});
