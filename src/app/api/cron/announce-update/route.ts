import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { sendPushToUser } from "@/lib/server/push";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { summarizeUpdateForAnnouncement } from "@/lib/server/updateAnnouncer";

const MAX_COMMITS = 50;

/**
 * main에 push(≈배포)될 때마다 GitHub Actions(.github/workflows/ci.yml의
 * announce job)가 이 push에 포함된 커밋 메시지 목록을 실어 호출한다.
 * purge-deleted-accounts와 같은 이유로 사람이 아닌 자동화가 호출하는
 * 라우트라 세션이 아니라 DEPLOY_ANNOUNCE_SECRET Bearer 토큰으로 인증한다
 * — 시크릿이 없으면(설정 전이거나 GitHub Actions 밖에서의 호출이면) 항상
 * 실패시켜, 의도치 않게 아무나 전체 공지를 발송할 수 있는 열린 엔드포인트가
 * 되지 않게 막는다.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const secret = process.env.DEPLOY_ANNOUNCE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "DEPLOY_ANNOUNCE_SECRET이 설정되지 않았어요" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 워크플로가 재실행되거나 짧은 시간에 연속으로 push돼도 전체 사용자
  // 발송이 폭주하지 않도록 — 관리자 수동 공지(announcements route)와
  // 같은 하한선.
  if (!(await checkRateLimit("announce:deploy", 3, 3600))) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { commits?: unknown } | null;
  const commits = Array.isArray(body?.commits)
    ? body.commits.filter((c): c is string => typeof c === "string" && c.trim().length > 0).slice(0, MAX_COMMITS)
    : [];
  if (commits.length === 0) {
    return NextResponse.json({ ok: true, notified: false, reason: "no commits" });
  }

  const result = await summarizeUpdateForAnnouncement(commits);
  if (!result?.notify || !result.message) {
    return NextResponse.json({ ok: true, notified: false });
  }

  const recipients = await pool.query<{ id: number }>(`select id from users where "isBanned" = false`);
  await pool.query(
    `insert into notifications ("recipientId", "actorId", type, message)
     select id, NULL, 'announcement', $1 from users where "isBanned" = false`,
    [result.message],
  );

  // 실패해도 응답을 막을 이유는 없다 — 알림은 이미 DB에 쌓였고, 설치앱
  // 푸시는 부가 채널일 뿐이다.
  void Promise.all(
    recipients.rows.map((r) => sendPushToUser(r.id, { title: "트레쥴 업데이트", body: result.message, url: "/" })),
  );

  return NextResponse.json({ ok: true, notified: true, count: recipients.rows.length, message: result.message });
});
