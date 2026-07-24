import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { isRootAdmin } from "@/lib/server/rootAdmin";

const SEARCH_LIMIT = 20;

export interface AdminUserRow {
  id: number;
  name: string;
  email: string | null;
  image: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
}

/** 관리자 지정/해제 화면(/admin/users)의 사용자 검색 — 루트 관리자만. 닉네임으로 찾는다(이 앱의 유일한 공개 식별자). */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!isRootAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const query = (request.nextUrl.searchParams.get("query") ?? "").trim().slice(0, 40);

  const result = await pool.query<{ id: number; name: string | null; nickname: string | null; email: string | null; image: string | null; isAdmin: boolean; isBanned: boolean; createdAt: string }>(
    query
      ? `select id, name, nickname, email, image, "isAdmin", "isBanned", "createdAt" from users where nickname ilike $1 order by "createdAt" desc limit ${SEARCH_LIMIT}`
      : `select id, name, nickname, email, image, "isAdmin", "isBanned", "createdAt" from users order by "createdAt" desc limit ${SEARCH_LIMIT}`,
    query ? [`%${query}%`] : [],
  );

  const users: AdminUserRow[] = result.rows.map((r) => ({
    id: r.id,
    name: r.nickname || r.name || "이름 없음",
    email: r.email,
    image: r.image,
    isAdmin: r.isAdmin,
    isBanned: r.isBanned,
    createdAt: r.createdAt,
  }));
  return NextResponse.json({ users });
});
