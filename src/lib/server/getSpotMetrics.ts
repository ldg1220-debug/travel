import { pool } from "./db";

const STALE_AFTER_DAYS = 30;

export interface SpotMetrics {
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
}

/**
 * Reads /discover 큐레이션 카드용 실제 Google 지표 (spot_place_metrics,
 * scripts/match-spot-place-ids.ts로 확정한 place_id 기준으로
 * /api/cron/refresh-spot-metrics가 채운다). spot_id → 지표 맵으로
 * 리턴한다 — 없는 spot_id는 아예 키가 없다(placeId 미확정이거나 아직
 * 배치가 안 돈 것).
 *
 * 30일 넘게 갱신 안 된 로우는 여기서 걸러 빈 값처럼 취급한다 — Google
 * ToS상 rating 같은 콘텐츠는 30일 초과 보관이 제한돼 있어서다. 로우
 * 자체는 지우지 않는다(다음 배치가 돌면 그대로 다시 채워지므로).
 */
export async function getSpotMetrics(): Promise<Record<string, SpotMetrics>> {
  const result = await pool.query<{
    spot_id: string;
    rating: number | null;
    review_count: number | null;
    price_level: number | null;
  }>(
    `select spot_id, rating, review_count, price_level
     from spot_place_metrics
     where updated_at > now() - ($1 || ' days')::interval`,
    [STALE_AFTER_DAYS],
  );
  const out: Record<string, SpotMetrics> = {};
  for (const row of result.rows) {
    out[row.spot_id] = { rating: row.rating, reviewCount: row.review_count, priceLevel: row.price_level };
  }
  return out;
}
