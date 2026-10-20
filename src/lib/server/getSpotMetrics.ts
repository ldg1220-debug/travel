import { pool } from "./db";
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
 *
 * 작업지시서 2026-10-20 "평점은 장소를 눌렀을 때만" §1⑤ — 카드 목록에서 지표를 보이지 않게 되면서 요청 시 갱신(Place Details Enterprise)을 없앴다. 이 함수는 남은 행(26시간 이내)을 읽기만 하고
 * Google 을 부르지 않는다. 평점은 카드를 눌러 여는 상세 시트(/api/places/details)에서만 조회한다.
 */

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
