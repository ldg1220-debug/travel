import crypto from "node:crypto";
import { list, del } from "@vercel/blob";
import { pool } from "@/lib/server/db";

/** 유예기간 — 이후 재설정 가능하도록 상수 하나로만 관리한다. */
export const DELETION_GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

/** 확인 이메일 링크의 유효시간 — 유예기간과 별개로, 링크 자체가 오래 방치되는 것만 막는다. */
export const DELETION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function generateDeletionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * 탈퇴 확정된(유예기간이 끝난) 계정 하나를 영구 삭제한다. `users` 행을
 * 지우면 accounts/sessions/itineraries/reviews/trip_posts/follows/
 * notifications 등 사용자를 참조하는 테이블이 전부 `ON DELETE CASCADE`로
 * 함께 정리된다(schema.sql) — 별도로 지울 테이블이 없다. 업로드한
 * 사진(Vercel Blob)만 예외적으로 별도 정리가 필요하다.
 */
export async function purgeUserAccount(userId: number): Promise<void> {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
    try {
      const { blobs } = await list({ prefix: `reviews/${userId}/` });
      if (blobs.length > 0) {
        await del(blobs.map((b) => b.url));
      }
    } catch (err) {
      // 사진 정리 실패는 계정 삭제 자체를 막지 않는다 — orphan 파일이 남는 게
      // 탈퇴를 거부하는 것보다 낫다.
      console.error("Failed to clean up blobs for deleted account", err);
    }
  }
  await pool.query(`delete from users where id = $1`, [userId]);
}
