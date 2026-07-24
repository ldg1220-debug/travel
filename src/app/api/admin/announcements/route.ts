import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { sendPushToUser } from "@/lib/server/push";
import { checkRateLimit } from "@/lib/server/rateLimit";

const MAX_MESSAGE_LENGTH = 300;

/**
 * 관리자 전체 공지 발송 — 신고 처리·정지와 같은 급의 일반 관리자 권한이라
 * isRootAdmin이 아니라 isAdmin으로 충분하다(부관리자도 쓸 수 있어야 함).
 * 정지된 계정은 어차피 로그인이 막혀 있으니 알림을 쌓아둘 이유가 없어 제외.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id || !session.user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 실수로 전체 사용자에게 반복 발송하는 사고를 막기 위한 방어선 — 정상
  // 운영 중엔 시간당 몇 건이면 충분하다.
  if (!(await checkRateLimit(`announce:${session.user.id}`, 5, 3600))) {
    return NextResponse.json({ error: "너무 자주 발송했어요. 잠시 후 다시 시도해주세요" }, { status: 429 });
  }

  const body = (await request.json()) as { message?: string };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "공지 내용을 입력해주세요" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `공지는 ${MAX_MESSAGE_LENGTH}자 이내로 작성해주세요` }, { status: 400 });
  }

  const recipients = await pool.query<{ id: number }>(`select id from users where "isBanned" = false`);
  await pool.query(
    `insert into notifications ("recipientId", "actorId", type, message)
     select id, $1, 'announcement', $2 from users where "isBanned" = false`,
    [session.user.id, message],
  );

  // 실패해도 응답을 막을 이유는 없다 — 알림은 이미 DB에 쌓였고, 설치앱
  // 푸시는 부가 채널일 뿐이다.
  void Promise.all(
    recipients.rows.map((r) => sendPushToUser(r.id, { title: "트레쥴 공지", body: message, url: "/" })),
  );

  return NextResponse.json({ ok: true, count: recipients.rows.length });
});
