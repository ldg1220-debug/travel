import { pool } from "./db";
import { allSpots } from "@/lib/discoverData";
import { chooseGuardedMask, settleGuarded } from "./mapsBudget";
import { PLACES_CONTENT_TTL_MS } from "./placesRetention";

export interface SpotMetrics {
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
}

/**
 * /discover 큐레이션 카드용 실제 Google 지표 (spot_place_metrics). 작업지시서 2026-10-14 "긴급: #319 이후 Places 호출 비용" §2④ —
 * 월 1회 배치(/api/cron/refresh-spot-metrics, 삭제)가 아니라 **카드 요청 시** 조회한다: 26시간(PLACES_CONTENT_TTL_MS)보다 오래된 지표는 숨기고,
 * 요청마다 오래된 스팟 몇 개(REFRESH_PER_REQUEST)를 월 예산 가드(Place Details Enterprise, 무료 월 1,000회의 90%) 안에서만 새로 조회한다.
 * 한도에 닿으면 지표를 숨긴다(옛 값을 쓰지 않는다 — Places 약관상 평점은 단기 캐시만 허용). place_id 는 무기한 보관 가능해 행의 place_id 는 남긴다.
 * 큐레이션 카탈로그(discoverData.ts)의 rating/reviewCount 는 삭제했다 — 이 테이블을 통해서만 화면에 나간다.
 */
const REFRESH_PER_REQUEST = 5;
const DETAILS_FIELD_MASK = "rating,userRatingCount,priceLevel";

/** 26시간 안에 갱신된 지표만 spot_id → 지표 맵으로 돌려준다(없는 spot_id 는 키가 없다). */
export async function getSpotMetrics(): Promise<Record<string, SpotMetrics>> {
  const result = await pool.query<{
    spot_id: string;
    rating: number | null;
    review_count: number | null;
    price_level: number | null;
  }>(
    `select spot_id, rating, review_count, price_level
     from spot_place_metrics
     where updated_at > now() - ($1 || ' milliseconds')::interval`,
    [String(PLACES_CONTENT_TTL_MS)],
  );
  const out: Record<string, SpotMetrics> = {};
  for (const row of result.rows) {
    out[row.spot_id] = { rating: row.rating, reviewCount: row.review_count, priceLevel: row.price_level };
  }
  return out;
}

/**
 * 오래됐거나 아직 없는 지표를 최대 limit 개 새로 조회해 spot_place_metrics 에 upsert 한다(place_id 가 확정된 스팟만).
 * 예산 가드가 막으면 조용히 건너뛴다. 실패는 삼킨다 — 지표가 없으면 카드는 평점 없이 보인다.
 * 반환: 실제로 갱신한 개수.
 */
export async function refreshStaleSpotMetrics(limit = REFRESH_PER_REQUEST): Promise<number> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || limit <= 0) return 0;
  try {
    const fresh = await pool.query<{ spot_id: string }>(
      `select spot_id from spot_place_metrics where updated_at > now() - ($1 || ' milliseconds')::interval`,
      [String(PLACES_CONTENT_TTL_MS)],
    );
    const freshIds = new Set(fresh.rows.map((r) => r.spot_id));
    const stale = [...allSpots("domestic"), ...allSpots("overseas")]
      .filter((spot): spot is typeof spot & { placeId: string } => Boolean(spot.placeId) && !freshIds.has(spot.id))
      .slice(0, limit);
    let updated = 0;
    for (const spot of stale) {
      const guarded = await chooseGuardedMask("details", DETAILS_FIELD_MASK);
      if (!guarded || guarded.degraded) break; // 한도에 닿음 — 더 시도하지 않는다
      const res = await fetch(`https://places.googleapis.com/v1/places/${spot.placeId}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": guarded.mask },
        cache: "no-store",
      });
      await settleGuarded(guarded, res.status);
      if (!res.ok) continue;
      const data = (await res.json()) as { rating?: number; userRatingCount?: number; priceLevel?: string };
      await pool.query(
        `insert into spot_place_metrics (spot_id, place_id, rating, review_count, price_level, opening_hours, updated_at)
         values ($1, $2, $3, $4, $5, null, now())
         on conflict (spot_id) do update set place_id = excluded.place_id, rating = excluded.rating, review_count = excluded.review_count,
           price_level = excluded.price_level, opening_hours = null, updated_at = now()`,
        [spot.id, spot.placeId, data.rating ?? null, data.userRatingCount ?? null, priceLevelToNumber(data.priceLevel)],
      );
      updated++;
    }
    return updated;
  } catch (err) {
    console.error("[getSpotMetrics] refresh failed:", err);
    return 0;
  }
}

/** Places (New) priceLevel enum → 0~4 (없거나 모르면 null). */
export function priceLevelToNumber(level: string | undefined): number | null {
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return level != null && level in map ? map[level] : null;
}
