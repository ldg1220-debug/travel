import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

interface ReviewBody {
  itineraryId: number;
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
  isPublic: boolean;
}

export interface ReviewRow {
  id: number;
  itineraryId: number | null;
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The current user's own reviews — optionally scoped to one trip (`itineraryId`), used to prefill 여행 보관함's per-place 후기 작성 sheet and show "N개 장소 리뷰 작성됨" progress on a trip card. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ reviews: [] });
  }

  const itineraryId = request.nextUrl.searchParams.get("itineraryId");
  const params: (string | number)[] = [session.user.id];
  let where = `"userId" = $1`;
  if (itineraryId) {
    params.push(Number(itineraryId));
    where += ` and "itineraryId" = $2`;
  }

  const result = await pool.query(
    `select id, "itineraryId", "placeId", "placeName", rating, content, images, "isPublic", created_at as "createdAt", updated_at as "updatedAt"
     from reviews where ${where} order by updated_at desc`,
    params,
  );
  return NextResponse.json({ reviews: result.rows });
}

/** Creates or updates the current user's review for a place within a trip — one review per (user, trip, place), so writing again just edits it in place. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ReviewBody;
  if (!body.placeId || !body.content?.trim() || !body.rating) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const rating = Math.min(5, Math.max(1, body.rating));
  const images = JSON.stringify((body.images ?? []).slice(0, 6));

  const result = await pool.query(
    `insert into reviews ("userId", "itineraryId", "placeId", "placeName", rating, content, images, "isPublic")
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict ("userId", "itineraryId", "placeId")
     do update set rating = $5, content = $6, images = $7, "isPublic" = $8, updated_at = now()
     returning id`,
    [session.user.id, body.itineraryId ?? null, body.placeId, body.placeName ?? "", rating, body.content.trim(), images, Boolean(body.isPublic)],
  );
  return NextResponse.json({ id: result.rows[0].id });
}

/** Deletes one of the current user's reviews. */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  await pool.query(`delete from reviews where id = $1 and "userId" = $2`, [id, session.user.id]);
  return NextResponse.json({ ok: true });
}
