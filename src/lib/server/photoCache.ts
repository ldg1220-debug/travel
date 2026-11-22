import { pool } from "./db";

/**
 * 사진 URL(photoUri)·사진 참조의 DB 캐시 — 작업지시서 2026-11-22 "사진 사용량" §1⑤⑥.
 * Google 사진 콘텐츠는 1일을 넘겨 저장하지 않는다(2026-10-14 보관 기간 점검). 읽을 때 created_at 으로 1일 TTL 을 검사하고,
 * 만료된 행은 다음 쓰기가 덮어쓴다. 메모리 캐시와 달리 콜드스타트·배포 뒤에도 남아 같은 사진을 Google 에 다시 묻지 않는다.
 * (place_candidate_cache 의 payload jsonb 를 그대로 쓴다 — 스키마 변경 없음.)
 */
export const PHOTO_CACHE_TTL_SECONDS = 86_400;

export type PhotoCacheValue = { uri: string | null; photoName?: string | null };

export async function readPhotoCache(key: string): Promise<PhotoCacheValue | undefined> {
  try {
    const r = await pool.query<{ payload: PhotoCacheValue }>(
      `select payload from place_candidate_cache where cache_key = $1 and created_at > now() - ($2::int * interval '1 second')`,
      [key, PHOTO_CACHE_TTL_SECONDS],
    );
    return r.rows[0]?.payload;
  } catch (err) {
    console.error("[photoCache] read failed:", err);
    return undefined;
  }
}

export async function writePhotoCache(key: string, value: PhotoCacheValue): Promise<void> {
  try {
    await pool.query(
      `insert into place_candidate_cache (cache_key, payload) values ($1, $2::jsonb)
       on conflict (cache_key) do update set payload = excluded.payload, created_at = now()`,
      [key, JSON.stringify(value)],
    );
  } catch (err) {
    console.error("[photoCache] write failed:", err);
  }
}
