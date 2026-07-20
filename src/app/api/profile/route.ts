import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

interface ProfileBody {
  nickname?: string;
  /** null clears the avatar back to the initial-letter fallback. */
  image?: string | null;
  /** true = 이용약관·개인정보처리방침 동의 기록 (최초 가입 게이트에서 전송). */
  agreeTerms?: boolean;
  /** 알림 종류별 on/off. */
  notifyMateRequests?: boolean;
  notifyLikes?: boolean;
  notifyMessages?: boolean;
}

const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9_]{2,20}$/;

/** Updates the current user's nickname and/or avatar (OAuth-provided name/email are never editable here — nickname is the sole public display identity). */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ProfileBody;
  const sets: string[] = [];
  const params: (string | boolean | null)[] = [];

  if (body.nickname !== undefined) {
    const nickname = body.nickname.trim();
    if (!NICKNAME_PATTERN.test(nickname)) {
      return NextResponse.json({ error: "닉네임은 한글·영문·숫자·_ 2~20자로 입력해주세요" }, { status: 400 });
    }
    params.push(nickname);
    sets.push(`nickname = $${params.length}`);
  }
  if (body.image !== undefined) {
    params.push(body.image);
    sets.push(`image = $${params.length}`);
  }
  if (body.agreeTerms === true) {
    // 최초 동의 시각만 기록 — 재저장으로 동의일이 덮이지 않게 coalesce.
    sets.push(`"termsAgreedAt" = coalesce("termsAgreedAt", now())`);
  }
  if (body.notifyMateRequests !== undefined) {
    params.push(body.notifyMateRequests);
    sets.push(`"notifyMateRequests" = $${params.length}`);
  }
  if (body.notifyLikes !== undefined) {
    params.push(body.notifyLikes);
    sets.push(`"notifyLikes" = $${params.length}`);
  }
  if (body.notifyMessages !== undefined) {
    params.push(body.notifyMessages);
    sets.push(`"notifyMessages" = $${params.length}`);
  }
  if (sets.length === 0) {
    return NextResponse.json({ ok: true });
  }

  params.push(String(session.user.id));
  try {
    await pool.query(`update users set ${sets.join(", ")} where id = $${params.length}`, params);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505") {
      return NextResponse.json({ error: "이미 사용 중인 닉네임이에요" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
