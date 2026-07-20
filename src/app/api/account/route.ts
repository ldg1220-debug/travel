import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";

/**
 * 회원 탈퇴 — 계정과 모든 데이터를 영구 삭제한다. `users` 행을 지우면
 * accounts/sessions/itineraries/reviews/trip_posts/follows/notifications 등
 * 사용자를 참조하는 테이블이 전부 `ON DELETE CASCADE`로 함께 정리된다
 * (schema.sql 참고) — 별도로 지울 테이블이 없다. 업로드한 사진(Vercel Blob)만
 * 예외적으로 별도 정리가 필요하다.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
    try {
      const { blobs } = await list({ prefix: `reviews/${userId}/` });
      if (blobs.length > 0) {
        await del(blobs.map((b) => b.url));
      }
    } catch (err) {
      // 사진 정리 실패는 계정 삭제 자체를 막지 않는다 — orphan 파일이 남는 게
      // 탈퇴 요청을 거부하는 것보다 낫다.
      console.error("Failed to clean up blobs for deleted account", err);
    }
  }

  await pool.query(`delete from users where id = $1`, [userId]);
  return NextResponse.json({ ok: true });
}
