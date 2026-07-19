import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

interface ProfileBody {
  name?: string;
  /** null clears the avatar back to the initial-letter fallback. */
  image?: string | null;
}

/** Updates the current user's display name and/or avatar (OAuth-provided email is never editable here). */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ProfileBody;
  const sets: string[] = [];
  const params: (string | null)[] = [];

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
    }
    if (name.length > 50) {
      return NextResponse.json({ error: "이름은 50자 이내로 입력해주세요" }, { status: 400 });
    }
    params.push(name);
    sets.push(`name = $${params.length}`);
  }
  if (body.image !== undefined) {
    params.push(body.image);
    sets.push(`image = $${params.length}`);
  }
  if (sets.length === 0) {
    return NextResponse.json({ ok: true });
  }

  params.push(String(session.user.id));
  await pool.query(`update users set ${sets.join(", ")} where id = $${params.length}`, params);
  return NextResponse.json({ ok: true });
}
