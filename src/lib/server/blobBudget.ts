import { pool } from "./db";

/**
 * Vercel Blob(Hobby)의 월 Advanced Operations(put · list · copy …) 2,000회 사용량 추정 카운터 — 작업지시서 2026-10-13
 * "긴급: Vercel Blob 한도 초과" §3⑥. 한도를 넘으면 스토어 전체(후기 사진 조회·업로드 포함)가 30일간 막히므로, 우리가 부르는
 * put 마다 DB(place_candidate_cache, 키 `blob-ops:{YYYY-MM}`)에 1씩 센다. 대시보드 수치와 정확히 같지는 않다(대시보드 열람도 집계되고,
 * 빌링 주기가 달력 월과 다를 수 있다) — 가드용 추정치다. DB 오류는 삼킨다(업로드 자체를 막지 않는다).
 */
export const BLOB_ADVANCED_MONTHLY_LIMIT = 2000;
/** 이 값을 넘으면 후기 업로드 외의 put 을 금지한다(지금은 지도 계열을 Blob 에 쓰지 않으므로 사실상 경고용). */
export const BLOB_NON_REVIEW_PUT_CAP = 1500;
/** 후기 업로드도 이 값부터는 막는다 — 한도(2,000)를 정확히 소진해 스토어가 잠기는 걸 피한다. */
export const BLOB_REVIEW_PUT_CAP = 1950;

export function blobOpsKey(now = new Date()): string {
  return `blob-ops:${now.toISOString().slice(0, 7)}`;
}

/** 이번 달 추정 Advanced 사용량. 조회 실패면 null. */
export async function getBlobAdvancedOps(now = new Date()): Promise<number | null> {
  try {
    const r = await pool.query<{ n: number | null }>(`select (payload->>'advanced')::int as n from place_candidate_cache where cache_key = $1`, [blobOpsKey(now)]);
    return r.rows[0]?.n ?? 0;
  } catch (err) {
    console.error("[blobBudget] read failed:", err);
    return null;
  }
}

/** put 직전에 부른다 — 사용량을 n 만큼 올리고, 허용 여부(kind 별 상한)와 현재 추정치를 돌려준다. DB 오류면 허용(추정 불가). */
export async function reserveBlobPut(kind: "review" | "other", n = 1, now = new Date()): Promise<{ allowed: boolean; used: number | null }> {
  try {
    const r = await pool.query<{ n: number }>(
      `insert into place_candidate_cache (cache_key, payload) values ($1, jsonb_build_object('advanced', $2::int))
       on conflict (cache_key) do update
         set payload = jsonb_build_object('advanced', coalesce((place_candidate_cache.payload->>'advanced')::int, 0) + $2::int), created_at = now()
       returning (payload->>'advanced')::int as n`,
      [blobOpsKey(now), n],
    );
    const used = r.rows[0]?.n ?? n;
    const cap = kind === "review" ? BLOB_REVIEW_PUT_CAP : BLOB_NON_REVIEW_PUT_CAP;
    if (used > BLOB_NON_REVIEW_PUT_CAP) console.warn(`[blobBudget] Advanced ops estimate ${used}/${BLOB_ADVANCED_MONTHLY_LIMIT} (kind=${kind})`);
    if (used > cap) {
      console.error(`[blobBudget] put refused kind=${kind} used=${used} cap=${cap}`);
      return { allowed: false, used };
    }
    return { allowed: true, used };
  } catch (err) {
    console.error("[blobBudget] reserve failed:", err);
    return { allowed: true, used: null };
  }
}

/**
 * Vercel Blob 의 한도 초과·정지 오류인가. 대시보드: "You have reached your usage limits for this store …", SDK: "This store has been suspended.",
 * 읽기는 정지 중 "Vercel Blob: Failed to fetch blob: 403 Forbidden"(작업지시서 2026-10-13 "#314 검증" §2① 실측)로 온다.
 */
export function isBlobLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b403\b|forbidden|store has been suspended|suspended|usage limit|reached your usage|limits for this store|exceeded.*(?:limit|quota)/i.test(message);
}
