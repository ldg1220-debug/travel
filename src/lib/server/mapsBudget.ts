import { AsyncLocalStorage } from "node:async_hooks";
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

// ------------------------------------------------------------------------------------------------
// 일 단위 페이싱 · 호출 출처 — 작업지시서 2026-10-15 "긴급: 평점 검색(Enterprise) 하루 만에 243/900" §2①③.

/** 일 단위 페이싱을 거는 SKU — 평점(Enterprise)을 월중 내내 쓰도록 월 예산을 날짜에 나눠 쓴다. */
export const PACED_SKUS: ReadonlySet<MapsSku> = new Set<MapsSku>(["text-enterprise", "details-enterprise"]);
/** 오늘 상한의 최소값 — 월 예산이 거의 바닥이어도 하루 이만큼은 쓴다. */
export const DAILY_PACING_MIN = 10;
/** 워밍 크론이 쓸 수 있는 오늘 상한의 비율 — 나머지는 사용자 요청용으로 남긴다. */
export const WARM_SHARE_OF_DAILY = 0.5;

export type MapsCallSource = "user" | "warm";
const sourceContext = new AsyncLocalStorage<MapsCallSource>();
/** fn 안에서 일어나는 모든 Places/Maps 호출을 source 로 센다(워밍 크론은 "warm"). */
export function runWithMapsSource<T>(source: MapsCallSource, fn: () => Promise<T>): Promise<T> {
  return sourceContext.run(source, fn);
}

export function mapsDayKey(sku: MapsSku, now = new Date()): string {
  return `maps-ops-day:${sku}:${now.toISOString().slice(0, 10)}`;
}
export function mapsQuota429Key(sku: MapsSku, now = new Date()): string {
  return `maps-429:${sku}:${now.toISOString().slice(0, 10)}`;
}

/** 오늘을 포함해 이번 달(UTC)에 남은 날 수. */
export function daysRemainingInMonth(now = new Date()): number {
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return last - now.getUTCDate() + 1;
}

/**
 * 오늘 상한 = floor((월 상한 − 오늘 이전까지의 이번 달 사용) / 남은 날수), 최소 DAILY_PACING_MIN.
 * 예: 10/15 → (900 − 243) / 17 ≈ 38.
 */
export function dailyPacingLimit(monthLimit: number, usedBeforeToday: number, daysRemaining: number): number {
  return Math.max(DAILY_PACING_MIN, Math.floor((monthLimit - usedBeforeToday) / Math.max(1, daysRemaining)));
}

async function readCounter(key: string): Promise<number | null> {
  try {
    const r = await pool.query<{ n: number | null }>(`select (payload->>'count')::int as n from place_candidate_cache where cache_key = $1`, [key]);
    return r.rows[0]?.n ?? 0;
  } catch (err) {
    console.error("[mapsBudget] read failed:", err);
    return null;
  }
}

/** 이번 달 호출 수(없으면 0, 조회 실패면 null). */
export async function readMapsOps(sku: MapsSku, now = new Date()): Promise<number | null> {
  return readCounter(mapsOpsKey(sku, now));
}

/** 오늘 호출 수(없으면 0, 조회 실패면 null). */
export async function readMapsOpsToday(sku: MapsSku, now = new Date()): Promise<number | null> {
  return readCounter(mapsDayKey(sku, now));
}

/** 오늘 이 SKU 의 상한(페이싱 SKU 만; 그 외는 null). 월 한도가 0 이면 0. */
export async function todayLimitFor(sku: MapsSku, now = new Date()): Promise<number | null> {
  if (!PACED_SKUS.has(sku)) return null;
  const monthLimit = mapsBudgetLimit(sku);
  if (monthLimit <= 0) return 0;
  const [month, today] = await Promise.all([readMapsOps(sku, now), readMapsOpsToday(sku, now)]);
  if (month == null) return null;
  return dailyPacingLimit(monthLimit, month - (today ?? 0), daysRemainingInMonth(now));
}

async function bump(key: string, delta: 1 | -1): Promise<void> {
  await pool.query(
    `insert into place_candidate_cache (cache_key, payload) values ($1, jsonb_build_object('count', greatest($2::int, 0)))
     on conflict (cache_key) do update
       set payload = jsonb_build_object('count', greatest(coalesce((place_candidate_cache.payload->>'count')::int, 0) + $2::int, 0)), created_at = now()`,
    [key, delta],
  );
}

/**
 * 호출 직전에 부른다. 거절 사유 세 가지:
 *  ① quota429 — 오늘 Google 이 이 SKU 를 429(RESOURCE_EXHAUSTED, 콘솔 하루 상한 도달)로 거절했다 → 그날 남은 호출 skip
 *  ② pacing — (Enterprise) 오늘 상한을 넘었다. 사용자 요청은 오늘 상한까지, 워밍 크론은 오늘 상한의 50%까지
 *  ③ 월 한도(무료 한도의 90%)
 * 허용이면 월·일 카운터를 +1 한다 — Google 이 실제로 처리하지 못한 호출(429/5xx/타임아웃)은 settleGuarded 가 되돌린다.
 * 거절하면 로그 `[mapsBudget] sku= count= limit= action=skip|pacing|quota429`.
 */
export async function reserveMapsOp(sku: MapsSku, now = new Date()): Promise<{ allowed: boolean; count: number | null; limit: number }> {
  const limit = mapsBudgetLimit(sku);
  if (limit <= 0) {
    console.warn(`[mapsBudget] sku=${sku} count=0 limit=0 action=skip`);
    return { allowed: false, count: 0, limit };
  }
  try {
    if (((await readCounter(mapsQuota429Key(sku, now))) ?? 0) > 0) {
      console.warn(`[mapsBudget] sku=${sku} count=? limit=${limit} action=quota429`);
      return { allowed: false, count: null, limit };
    }
    if (PACED_SKUS.has(sku)) {
      const [month, today] = await Promise.all([readMapsOps(sku, now), readMapsOpsToday(sku, now)]);
      if (month != null && today != null) {
        const todayLimit = dailyPacingLimit(limit, month - today, daysRemainingInMonth(now));
        const cap = sourceContext.getStore() === "warm" ? Math.floor(todayLimit * WARM_SHARE_OF_DAILY) : todayLimit;
        if (today >= cap) {
          console.warn(`[mapsBudget] sku=${sku} today=${today} todayLimit=${todayLimit} cap=${cap} source=${sourceContext.getStore() ?? "user"} action=pacing`);
          return { allowed: false, count: month, limit };
        }
      }
    }
    const r = await pool.query<{ n: number }>(
      `insert into place_candidate_cache (cache_key, payload) values ($1, jsonb_build_object('count', 1))
       on conflict (cache_key) do update
         set payload = jsonb_build_object('count', coalesce((place_candidate_cache.payload->>'count')::int, 0) + 1), created_at = now()
         where coalesce((place_candidate_cache.payload->>'count')::int, 0) < $2
       returning (payload->>'count')::int as n`,
      [mapsOpsKey(sku, now), limit],
    );
    if (r.rows.length > 0) {
      await bump(mapsDayKey(sku, now), 1);
      return { allowed: true, count: r.rows[0].n, limit };
    }
    const count = await readMapsOps(sku, now);
    console.warn(`[mapsBudget] sku=${sku} count=${count ?? "?"} limit=${limit} action=skip`);
    return { allowed: false, count, limit };
  } catch (err) {
    console.error("[mapsBudget] reserve failed:", err);
    return { allowed: true, count: null, limit };
  }
}

/** 예약했지만 Google 이 처리하지 않은 호출(429/5xx/타임아웃)의 카운트를 되돌린다. */
export async function releaseMapsOp(sku: MapsSku, now = new Date()): Promise<void> {
  try {
    await bump(mapsOpsKey(sku, now), -1);
    await bump(mapsDayKey(sku, now), -1);
  } catch (err) {
    console.error("[mapsBudget] release failed:", err);
  }
}

/** Google 이 429 로 거절 = 콘솔 하루 상한 도달 → 오늘 남은 호출을 skip 하도록 표시한다. */
export async function markQuota429(sku: MapsSku, now = new Date()): Promise<void> {
  try {
    await pool.query(
      `insert into place_candidate_cache (cache_key, payload) values ($1, jsonb_build_object('count', 1))
       on conflict (cache_key) do update set created_at = now()`,
      [mapsQuota429Key(sku, now)],
    );
    console.warn(`[mapsBudget] sku=${sku} action=quota429-mark (Google 429 RESOURCE_EXHAUSTED — 오늘 남은 호출 skip)`);
  } catch (err) {
    console.error("[mapsBudget] mark429 failed:", err);
  }
}

/**
 * 가드를 통과한 호출의 결과를 정산한다 — status 가 200 대(처리됨)면 그대로 두고, 429 면 오늘 상한 도달로 표시하고 되돌리며,
 * 그 밖의 실패(5xx · 타임아웃 = null)는 되돌리기만 한다. 4xx(400/403/404)도 Google 이 과금하지 않으므로 되돌린다.
 */
export async function settleGuarded(guarded: { sku?: MapsSku } | null, status: number | null): Promise<void> {
  const sku = guarded?.sku;
  if (!sku) return;
  if (status != null && status >= 200 && status < 300) return;
  if (status === 429) await markQuota429(sku);
  await releaseMapsOp(sku);
}

/** 이번 달 호출 수를 올리지 않고 한도에 닿았는가(읽기 전용). 조회 실패면 false. */
export async function isMapsBudgetExhausted(sku: MapsSku, now = new Date()): Promise<boolean> {
  const limit = mapsBudgetLimit(sku);
  if (limit <= 0) return true;
  const count = await readMapsOps(sku, now);
  return count != null && count >= limit;
}

/** SKU 별 이번 달 사용량·상한, (페이싱 SKU 는) 오늘 사용량·오늘 상한 — /api/health. */
export async function getMapsUsage(now = new Date()): Promise<
  Record<MapsSku, { count: number | null; limit: number; freeLimit: number; todayCount: number | null; todayLimit: number | null }>
> {
  const skus = Object.keys(MAPS_FREE_LIMITS) as MapsSku[];
  const rows = await Promise.all(
    skus.map(async (s) => {
      const [count, todayCount, todayLimit] = await Promise.all([readMapsOps(s, now), readMapsOpsToday(s, now), todayLimitFor(s, now)]);
      return { count, limit: mapsBudgetLimit(s), freeLimit: MAPS_FREE_LIMITS[s], todayCount, todayLimit };
    }),
  );
  return Object.fromEntries(skus.map((s, i) => [s, rows[i]])) as Record<MapsSku, { count: number | null; limit: number; freeLimit: number; todayCount: number | null; todayLimit: number | null }>;
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
export async function chooseGuardedMask(kind: PlacesCallKind, mask: string): Promise<{ mask: string; degraded: boolean; sku?: MapsSku } | null> {
  const tier = placesFieldTier(mask);
  const enterpriseSku: MapsSku = kind === "text" ? "text-enterprise" : "details-enterprise";
  const proSku: MapsSku = kind === "text" ? "text-pro" : "details-pro";
  if (tier === "ids") return { mask, degraded: false };
  if (tier === "enterprise") {
    if ((await reserveMapsOp(enterpriseSku)).allowed) return { mask, degraded: false, sku: enterpriseSku };
    const stripped = stripEnterpriseFields(mask);
    if (!stripped) return null;
    const strippedTier = placesFieldTier(stripped);
    if (strippedTier === "ids") return { mask: stripped, degraded: true };
    return (await reserveMapsOp(proSku)).allowed ? { mask: stripped, degraded: true, sku: proSku } : null;
  }
  return (await reserveMapsOp(proSku)).allowed ? { mask, degraded: false, sku: proSku } : null;
}
