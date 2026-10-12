import { pool } from "./db";
import { COURSE_ALGO_VERSION, isSupportedRegion, resolveScope, type CourseBrief, type CourseDays } from "./courseBrief";
import { judgeCourseBrief } from "./coursePageGate";
import { flatRegions } from "@/lib/discoverData";
import { pickRepresentativeSpots } from "@/lib/coursePages";
import { typicalDayRank } from "@/lib/regionTypicalDays";

/**
 * "크론이 200 확인한 코스 조합" 목록 — 작업지시서 2026-10-08 "코스 페이지가 전부 404입니다" §2.
 * 사이트맵과 코스 페이지 내부 링크가 같은 목록을 쓴다. 빌드 때 전부 호출하지 않고, 이미 최종 브리프
 * 캐시(place_candidate_cache, 키 `content-brief:…:v{COURSE_ALGO_VERSION}`)에 들어 있는 것만 본다 —
 * 브리프는 isCacheableBrief(= API 200 기준)를 통과한 것만 캐시에 쓰이고, 거기에 페이지 기준(judgeCourseBrief)
 * 을 한 번 더 건다. 422 조합은 캐시에 없어 자연히 빠진다. lastmod는 브리프 생성 시각(created_at).
 *
 * 한계: 크론이 하루 1회·12건(Hobby 플랜)이라 목록은 며칠에 걸쳐 자란다. 캐시 TTL(26시간)이 지난 행도
 * 14일 안이면 "한 번 200을 확인한 조합"으로 보고 남긴다(페이지는 요청 시 다시 만들 수 있다).
 */
export interface ConfirmedCoursePage {
  region: string;
  days: CourseDays;
  lastModified: Date;
  /** 허브 카드용 요약 — 현재 버전 브리프 캐시에서 판정한 조합에만 있다(버전 무관 기록만 있는 조합은 링크만). */
  info?: { spotCount: number; totalDistanceKm: number | null; imageUrl: string | null; reps: string[] };
}

const MAX_AGE_DAYS = 14;
const MEMO_TTL_MS = 10 * 60 * 1000;
let memo: { at: number; value: ConfirmedCoursePage[] } | null = null;

/** 사이트맵·내부 링크가 쓰는 확인된 조합 — 10분 메모(요청마다 수백 행 payload를 읽지 않는다). DB 장애면 빈 목록. */
export async function fetchConfirmedCoursePages(): Promise<ConfirmedCoursePage[]> {
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.value;
  try {
    // payload 전체 대신 판정에 필요한 필드만 SQL에서 뽑는다(spots 각 항목의 name·category·rating·beach).
    const result = await pool.query<{ region: string | null; days: string | null; created_at: Date; spots: unknown; totalDistanceKm: string | null; imageUrl: string | null }>(
      `select payload->>'region' as region, payload->>'days' as days, created_at,
              (select coalesce(jsonb_agg(jsonb_build_object('name', s->'name', 'category', s->'category', 'rating', s->'rating', 'reviewCount', s->'reviewCount', 'beach', s->'beach', 'lodging', s->'lodging')), '[]'::jsonb)
                 from jsonb_array_elements(case when jsonb_typeof(payload->'spots') = 'array' then payload->'spots' else '[]'::jsonb end) s) as spots,
              payload->>'totalDistanceKm' as "totalDistanceKm", payload->>'imageUrl' as "imageUrl"
         from place_candidate_cache
        where cache_key like $1 and created_at > now() - ($2 || ' days')::interval`,
      [`content-brief:%:v${COURSE_ALGO_VERSION}`, String(MAX_AGE_DAYS)],
    );
    const value: ConfirmedCoursePage[] = [];
    for (const row of result.rows) {
      const days = Number(row.days);
      if (!row.region || !Number.isInteger(days) || days < 1 || days > 7 || !Array.isArray(row.spots)) continue;
      const spots = row.spots as CourseBrief["spots"];
      if (judgeCourseBrief({ spots }, row.region, days as CourseDays) != null) continue;
      const km = row.totalDistanceKm != null ? Number(row.totalDistanceKm) : null;
      value.push({
        region: row.region,
        days: days as CourseDays,
        lastModified: new Date(row.created_at),
        info: { spotCount: spots.length, totalDistanceKm: km != null && Number.isFinite(km) ? km : null, imageUrl: row.imageUrl || null, reps: pickRepresentativeSpots(spots, 2) },
      });
    }
    // 버전과 무관한 기록(courseSitemapKey) — 캐시 버전이 올라가 위 목록이 비어도 사이트맵에서 빠지지 않는다.
    // 같은 (지역, 일수)는 더 최근 시각을 쓴다. 작업지시서 2026-10-08 "#300 검증" §3①.
    const recorded = await pool.query<{ region: string | null; days: string | null; created_at: Date }>(
      `select payload->>'region' as region, payload->>'days' as days, created_at
         from place_candidate_cache
        where cache_key like 'course-sitemap:%' and created_at > now() - interval '30 days'`,
    );
    const byKey = new Map(value.map((p) => [`${p.region}/${p.days}`, p]));
    for (const row of recorded.rows) {
      const days = Number(row.days);
      if (!row.region || !Number.isInteger(days) || days < 1 || days > 7) continue;
      const key = `${row.region}/${days}`;
      const at = new Date(row.created_at);
      const prev = byKey.get(key);
      if (!prev) byKey.set(key, { region: row.region, days: days as CourseDays, lastModified: at });
      else if (prev.lastModified < at) byKey.set(key, { ...prev, lastModified: at }); // 요약(info)은 유지
    }
    const merged = [...byKey.values()];
    memo = { at: Date.now(), value: merged };
    return merged;
  } catch (err) {
    console.error("[course-index] failed to load confirmed course pages:", err);
    return [];
  }
}

/** 테스트용 — 메모를 비운다. */
export function resetConfirmedCoursePagesMemo(): void {
  memo = null;
}

export interface RelatedCourseLinks {
  sameRegion: ConfirmedCoursePage[];
  sameCountry: ConfirmedCoursePage[];
}

/**
 * 내부 링크 — 같은 지역의 다른 일수(대표 일수 순), 같은 나라(국내는 같은 광역) 다른 지역(가능하면 같은 일수, 지역당 1개).
 * 확인된 조합(confirmed)만 건다 — 404가 될 수 있는 페이지로 링크하지 않는다. parentOf는 지역 → 나라/광역.
 */
export function pickRelatedCourseLinks(
  current: { region: string; days: CourseDays },
  confirmed: readonly ConfirmedCoursePage[],
  parentOf: (region: string) => string | undefined,
  limits = { sameRegion: 6, sameCountry: 6 },
): RelatedCourseLinks {
  const sameRegion = confirmed.filter((p) => p.region === current.region && p.days !== current.days)
    .sort((a, b) => typicalDayRank(a.region, a.days) - typicalDayRank(b.region, b.days))
    .slice(0, limits.sameRegion);
  const parent = parentOf(current.region);
  const byRegion = new Map<string, ConfirmedCoursePage>();
  if (parent) {
    for (const p of confirmed) {
      if (p.region === current.region || parentOf(p.region) !== parent) continue;
      const prev = byRegion.get(p.region);
      // 같은 일수를 우선, 없으면 가장 가까운 일수
      if (!prev || Math.abs(p.days - current.days) < Math.abs(prev.days - current.days)) byRegion.set(p.region, p);
    }
  }
  return { sameRegion, sameCountry: [...byRegion.values()].sort((a, b) => a.region.localeCompare(b.region, "ko")).slice(0, limits.sameCountry) };
}

interface RegionMeta {
  parent: string;
  scope: "domestic" | "overseas";
  /** 해외만 — 나라 인기 순위(작을수록 인기). */
  popularity?: number;
}
let regionMetaMap: Map<string, RegionMeta> | null = null;
/** 지역 → 나라(해외)·광역(국내), 범위, 인기 순위. flatRegions 기준. */
export function regionMeta(region: string): RegionMeta | undefined {
  if (!regionMetaMap) {
    regionMetaMap = new Map();
    for (const scope of ["domestic", "overseas"] as const) for (const r of flatRegions(scope)) regionMetaMap.set(r.name, { parent: r.parent, scope, popularity: r.popularity });
  }
  const meta = regionMetaMap.get(region);
  if (meta) return meta;
  // flatRegions의 도시 이름이 아닌 지원 지역(서울·부산·제주·인천 같은 광역명 등)은 자기 자신을 묶음으로 삼는다 — 허브에서 빠지지 않게.
  return isSupportedRegion(region) ? { parent: region, scope: resolveScope(region) } : undefined;
}

/** 지역 → 나라(해외)·광역(국내). flatRegions의 parent. */
export function parentOfRegion(region: string): string | undefined {
  return regionMeta(region)?.parent;
}

// ------------------------------------------------------------------------------------------------
// 코스 허브 — 작업지시서 2026-10-12 "코스 페이지가 고아입니다" §2.

export interface HubRegion {
  region: string;
  pages: ConfirmedCoursePage[]; // 일수 오름차순
  reps: string[];
  imageUrl: string | null;
}
export interface HubGroup {
  scope: "domestic" | "overseas";
  parent: string;
  regions: HubRegion[];
}

/** 확인된 조합을 범위(국내 → 해외) → 나라·광역 → 지역으로 묶는다. 같은 지역은 일수 오름차순, 해외는 인기 순위 → 이름 순. */
export function groupConfirmedForHub(confirmed: readonly ConfirmedCoursePage[]): HubGroup[] {
  const byRegion = new Map<string, ConfirmedCoursePage[]>();
  for (const p of confirmed) byRegion.set(p.region, [...(byRegion.get(p.region) ?? []), p]);
  const groups = new Map<string, HubGroup>();
  for (const [region, pages] of byRegion) {
    const meta = regionMeta(region);
    if (!meta) continue; // 목록에 없는 지역(별칭 등)은 허브에 올리지 않는다
    const sorted = [...pages].sort((a, b) => a.days - b.days);
    const withInfo = sorted.filter((p) => p.info).sort((a, b) => typicalDayRank(a.region, a.days) - typicalDayRank(b.region, b.days)); // 대표 일수 코스의 장소·지도를 카드에 쓴다
    const hubRegion: HubRegion = {
      region,
      pages: sorted,
      reps: withInfo.find((p) => p.info!.reps.length > 0)?.info!.reps ?? [],
      imageUrl: withInfo.find((p) => p.info!.imageUrl)?.info!.imageUrl ?? null,
    };
    const key = `${meta.scope}:${meta.parent}`;
    const group = groups.get(key) ?? { scope: meta.scope, parent: meta.parent, regions: [] };
    group.regions.push(hubRegion);
    groups.set(key, group);
  }
  const popularityOf = (g: HubGroup) => regionMeta(g.regions[0].region)?.popularity ?? 99;
  return [...groups.values()]
    .map((g) => ({ ...g, regions: g.regions.sort((a, b) => a.region.localeCompare(b.region, "ko")) }))
    .sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "domestic" ? -1 : 1) || popularityOf(a) - popularityOf(b) || a.parent.localeCompare(b.parent, "ko"));
}

/**
 * 홈·탐색·코스 화면의 "인기 여행 코스" — 지역당 1개(그 지역의 대표 일수 중 가장 앞, 없으면 가장 가까운 일수), 인기 나라 순 → 국내 → 이름 순으로 limit개.
 * 확인된 조합만 건다(사이트맵과 같은 소스).
 */
export function pickPopularCourses(confirmed: readonly ConfirmedCoursePage[], limit = 12): ConfirmedCoursePage[] {
  const bestByRegion = new Map<string, ConfirmedCoursePage>();
  for (const p of confirmed) {
    const prev = bestByRegion.get(p.region);
    if (!prev || typicalDayRank(p.region, p.days) < typicalDayRank(prev.region, prev.days)) bestByRegion.set(p.region, p);
  }
  const rank = (p: ConfirmedCoursePage) => regionMeta(p.region)?.popularity ?? 50; // 국내는 해외 인기국 뒤
  return [...bestByRegion.values()].sort((a, b) => rank(a) - rank(b) || a.region.localeCompare(b.region, "ko")).slice(0, limit);
}
