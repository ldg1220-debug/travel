import { pool } from "./db";

/**
 * Google Maps Platform 월 무료 한도 가드 — 작업지시서 2026-10-14 "긴급: #319 이후 Places 호출 비용 — 무료 한도 안으로 막는 가드" §2①②.
 * Places API (New)는 요청 필드 마스크에 따라 SKU 가 갈린다(rating · userRatingCount · priceLevel · 영업시간 · 리뷰 = Enterprise,
 * displayName · 주소 · 좌표 · 타입 · 사진 · googleMapsUri = Pro, id 만 = Essentials IDs Only). 호출 직전에 DB 카운터
 * (`maps-ops:{sku}:YYYY-MM`)를 +1 하고, 월 무료 한도의 90% 에 닿으면 그 SKU 호출을 하지 않는다 — 옛 값을 쓰는 게 아니라
 * 평점 없이(Enterprise → Pro 필드로 강등) 또는 해당 기능 없이(사진 플레이스홀더 · 지도 없음 · 경로 직선 추정) 보여준다.
 * 카운터는 달력 월 기준 추정치다(Google 청구 주기와 다를 수 있다). DB 오류면 막지 않는다(추정 불가 — 호출은 허용).
 * 한도를 임시로 바꾸려면 환경 변수 MAPS_BUDGET_OVERRIDE='{"text-enterprise":0}' (가드 테스트용).
 */
export type MapsSku =
  | "text-enterprise"
  | "text-pro"
  | "details-enterprise"
  | "details-pro"
  | "photos"
  | "static"
  | "routes";

/** 월 무료 한도(Google 가격표, 2026-10-08 갱신본) */
export const MAPS_FREE_LIMITS: Readonly<Record<MapsSku, number>> = {
  "text-enterprise": 1000,
  "text-pro": 5000,
  "details-enterprise": 1000,
  "details-pro": 5000,
  photos: 1000,
  static: 10000,
  routes: 10000,
};
/** 상한 = 무료 한도의 90% */
export const MAPS_BUDGET_RATIO = 0.9;

export function mapsBudgetLimit(sku: MapsSku): number {
  const raw = process.env.MAPS_BUDGET_OVERRIDE;
  if (raw) {
    try {
      const override = (JSON.parse(raw) as Partial<Record<MapsSku, number>>)[sku];
      if (typeof override === "number" && Number.isFinite(override) && override >= 0) return Math.floor(override);
    } catch {
      // 잘못된 JSON 은 무시한다(기본 한도)
    }
  }
  return Math.floor(MAPS_FREE_LIMITS[sku] * MAPS_BUDGET_RATIO);
}

export function mapsOpsKey(sku: MapsSku, now = new Date()): string {
  return `maps-ops:${sku}:${now.toISOString().slice(0, 7)}`;
}

/**
 * 호출 직전에 부른다. 한도 미만이면 카운터를 +1 하고 허용, 한도에 닿았으면 증가시키지 않고 거절한다(건너뛴 호출은 세지 않는다).
 * 거절하면 로그 `[mapsBudget] sku= count= limit= action=skip`.
 */
export async function reserveMapsOp(sku: MapsSku, now = new Date()): Promise<{ allowed: boolean; count: number | null; limit: number }> {
  const limit = mapsBudgetLimit(sku);
  if (limit <= 0) {
    console.warn(`[mapsBudget] sku=${sku} count=0 limit=0 action=skip`);
    return { allowed: false, count: 0, limit };
  }
  try {
    const r = await pool.query<{ n: number }>(
      `insert into place_candidate_cache (cache_key, payload) values ($1, jsonb_build_object('count', 1))
       on conflict (cache_key) do update
         set payload = jsonb_build_object('count', coalesce((place_candidate_cache.payload->>'count')::int, 0) + 1), created_at = now()
         where coalesce((place_candidate_cache.payload->>'count')::int, 0) < $2
       returning (payload->>'count')::int as n`,
      [mapsOpsKey(sku, now), limit],
    );
    if (r.rows.length > 0) return { allowed: true, count: r.rows[0].n, limit };
    const count = await readMapsOps(sku, now);
    console.warn(`[mapsBudget] sku=${sku} count=${count ?? "?"} limit=${limit} action=skip`);
    return { allowed: false, count, limit };
  } catch (err) {
    console.error("[mapsBudget] reserve failed:", err);
    return { allowed: true, count: null, limit };
  }
}

/** 이번 달 호출 수(없으면 0, 조회 실패면 null). */
export async function readMapsOps(sku: MapsSku, now = new Date()): Promise<number | null> {
  try {
    const r = await pool.query<{ n: number | null }>(`select (payload->>'count')::int as n from place_candidate_cache where cache_key = $1`, [mapsOpsKey(sku, now)]);
    return r.rows[0]?.n ?? 0;
  } catch (err) {
    console.error("[mapsBudget] read failed:", err);
    return null;
  }
}

/** 한도에 닿았는가(읽기 전용 — 카운터를 올리지 않는다). 조회 실패면 false. */
export async function isMapsBudgetExhausted(sku: MapsSku, now = new Date()): Promise<boolean> {
  const limit = mapsBudgetLimit(sku);
  if (limit <= 0) return true;
  const count = await readMapsOps(sku, now);
  return count != null && count >= limit;
}

/** SKU 별 이번 달 사용량·상한 — /api/health. */
export async function getMapsUsage(now = new Date()): Promise<Record<MapsSku, { count: number | null; limit: number; freeLimit: number }>> {
  const skus = Object.keys(MAPS_FREE_LIMITS) as MapsSku[];
  const counts = await Promise.all(skus.map((s) => readMapsOps(s, now)));
  return Object.fromEntries(skus.map((s, i) => [s, { count: counts[i], limit: mapsBudgetLimit(s), freeLimit: MAPS_FREE_LIMITS[s] }])) as Record<MapsSku, { count: number | null; limit: number; freeLimit: number }>;
}

// ------------------------------------------------------------------------------------------------
// 필드 마스크 → SKU

/** Enterprise 필드(평점 · 리뷰 수 · 가격대 · 영업시간 · 리뷰 · 연락처/웹사이트). 이 중 하나라도 있으면 Enterprise. */
const ENTERPRISE_FIELD = /(^|[.,])(rating|userRatingCount|priceLevel|priceRange|regularOpeningHours|currentOpeningHours|reviews|websiteUri|nationalPhoneNumber|internationalPhoneNumber)\b/;
const IDS_ONLY_FIELD = /^(places\.)?(id|name)$/;

export type PlacesCallKind = "text" | "details";

/** 필드 마스크의 SKU 등급 — "ids"(무료·무제한) · "pro" · "enterprise". */
export function placesFieldTier(mask: string): "ids" | "pro" | "enterprise" {
  if (ENTERPRISE_FIELD.test(mask)) return "enterprise";
  const fields = mask.split(",").map((f) => f.trim()).filter(Boolean);
  // nextPageToken 은 응답 페이징 필드라 등급에 영향을 주지 않는다.
  const rest = fields.filter((f) => f !== "nextPageToken");
  return rest.every((f) => IDS_ONLY_FIELD.test(f)) ? "ids" : "pro";
}

/** Enterprise 필드를 뺀 마스크(평점 없이 보여주는 강등). */
export function stripEnterpriseFields(mask: string): string {
  return mask
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f && !ENTERPRISE_FIELD.test(f))
    .join(",");
}

/**
 * Places 호출 한 건에 쓸 필드 마스크를 정한다 — 한도 안이면 요청한 마스크 그대로, Enterprise 한도에 닿았으면 평점 등을 뺀 Pro 마스크로
 * 강등, 그것도 한도에 닿았으면 null(호출하지 않는다). 반환의 `degraded` 가 true 면 평점 없이 받는 중이다.
 */
export async function chooseGuardedMask(kind: PlacesCallKind, mask: string): Promise<{ mask: string; degraded: boolean } | null> {
  const tier = placesFieldTier(mask);
  if (tier === "ids") return { mask, degraded: false };
  if (tier === "enterprise") {
    if ((await reserveMapsOp(kind === "text" ? "text-enterprise" : "details-enterprise")).allowed) return { mask, degraded: false };
    const stripped = stripEnterpriseFields(mask);
    if (!stripped) return null;
    const strippedTier = placesFieldTier(stripped);
    if (strippedTier === "ids") return { mask: stripped, degraded: true };
    return (await reserveMapsOp(kind === "text" ? "text-pro" : "details-pro")).allowed ? { mask: stripped, degraded: true } : null;
  }
  return (await reserveMapsOp(kind === "text" ? "text-pro" : "details-pro")).allowed ? { mask, degraded: false } : null;
}
