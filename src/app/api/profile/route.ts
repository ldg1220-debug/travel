import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

interface ProfileBody {
  nickname?: string;
  /** null clears the avatar back to the initial-letter fallback. */
  image?: string | null;
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
  const params: (string | null)[] = [];

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
