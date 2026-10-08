import { pool } from "./db";
import { COURSE_ALGO_VERSION, type CourseBrief, type CourseDays } from "./courseBrief";
import { judgeCourseBrief } from "./coursePageGate";
import { flatRegions } from "@/lib/discoverData";

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
}

const MAX_AGE_DAYS = 14;
const MEMO_TTL_MS = 10 * 60 * 1000;
let memo: { at: number; value: ConfirmedCoursePage[] } | null = null;

/** 사이트맵·내부 링크가 쓰는 확인된 조합 — 10분 메모(요청마다 수백 행 payload를 읽지 않는다). DB 장애면 빈 목록. */
export async function fetchConfirmedCoursePages(): Promise<ConfirmedCoursePage[]> {
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.value;
  try {
    // payload 전체 대신 판정에 필요한 필드만 SQL에서 뽑는다(spots 각 항목의 name·category·rating·beach).
    const result = await pool.query<{ region: string | null; days: string | null; created_at: Date; spots: unknown; dayTotals: unknown }>(
      `select payload->>'region' as region, payload->>'days' as days, created_at,
              (select coalesce(jsonb_agg(jsonb_build_object('name', s->'name', 'category', s->'category', 'rating', s->'rating', 'beach', s->'beach')), '[]'::jsonb)
                 from jsonb_array_elements(case when jsonb_typeof(payload->'spots') = 'array' then payload->'spots' else '[]'::jsonb end) s) as spots,
              payload->'dayTotals' as "dayTotals"
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
      value.push({ region: row.region, days: days as CourseDays, lastModified: new Date(row.created_at) });
    }
    memo = { at: Date.now(), value };
    return value;
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
 * 내부 링크 — 같은 지역의 다른 일수, 같은 나라(국내는 같은 광역) 다른 지역(가능하면 같은 일수, 지역당 1개).
 * 확인된 조합(confirmed)만 건다 — 404가 될 수 있는 페이지로 링크하지 않는다. parentOf는 지역 → 나라/광역.
 */
export function pickRelatedCourseLinks(
  current: { region: string; days: CourseDays },
  confirmed: readonly ConfirmedCoursePage[],
  parentOf: (region: string) => string | undefined,
  limits = { sameRegion: 6, sameCountry: 6 },
): RelatedCourseLinks {
  const sameRegion = confirmed.filter((p) => p.region === current.region && p.days !== current.days).sort((a, b) => a.days - b.days).slice(0, limits.sameRegion);
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

let parentMap: Map<string, string> | null = null;
/** 지역 → 나라(해외)·광역(국내). flatRegions의 parent. */
export function parentOfRegion(region: string): string | undefined {
  if (!parentMap) {
    parentMap = new Map();
    for (const scope of ["domestic", "overseas"] as const) for (const r of flatRegions(scope)) parentMap.set(r.name, r.parent);
  }
  return parentMap.get(region);
}

