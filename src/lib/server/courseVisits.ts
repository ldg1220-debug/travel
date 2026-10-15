import { pool } from "./db";
import { resolveRegionAlias } from "@/lib/discoverData";
import type { CourseDays, WarmTask } from "./courseBrief";

/**
 * 코스 방문 기록 — 작업지시서 2026-10-14 "긴급: #319 이후 Places 호출 비용" §2③. 워밍 크론이 모든 지역을 매일 갱신하면 Places 무료 한도를 넘으므로,
 * "최근 26시간 안에 방문(코스 페이지 · course-brief 요청)된 (지역, 일수)"만 갱신한다. 방문은 `course-visit:{지역}:{일수}` 한 줄(place_candidate_cache,
 * 지역·일수만 — Places 값 없음)에 마지막 방문 시각(created_at)으로 남긴다. 같은 인스턴스에선 10분에 한 번만 쓴다.
 */
export const VISIT_WINDOW_MS = 26 * 60 * 60 * 1000;
const WRITE_THROTTLE_MS = 10 * 60 * 1000;
const lastWrite = new Map<string, number>();

export function courseVisitKey(region: string, days: number): string {
  return `course-visit:${resolveRegionAlias(region)}:${days}`;
}

/** 방문을 기록한다(응답을 기다리지 않는다 — 실패해도 조용히 넘어간다). */
export function recordCourseVisit(region: string, days: number, now = Date.now()): void {
  const key = courseVisitKey(region, days);
  const prev = lastWrite.get(key);
  if (prev != null && now - prev < WRITE_THROTTLE_MS) return;
  lastWrite.set(key, now);
  pool
    .query(
      `insert into place_candidate_cache (cache_key, payload) values ($1, $2)
       on conflict (cache_key) do update set created_at = now()`,
      [key, JSON.stringify({ region: resolveRegionAlias(region), days })],
    )
    .catch((err) => {
      lastWrite.delete(key);
      console.error("[courseVisits] record failed:", err);
    });
}

/**
 * 갱신할 조합(오래된 것부터 정렬돼 있다)을 지역 단위로 묶고, 처음 나온 순서대로 최대 maxRegions 개 지역만 남긴다 — 한 지역의 방문된 일수는 전부 같은 후보 풀로 만든다.
 * 지역 안의 일수는 오름차순. (작업지시서 2026-10-15 "긴급: 평점 검색(Enterprise) 하루 만에 243/900" §2④)
 */
export function groupTasksByRegion(tasks: readonly WarmTask[], maxRegions: number): WarmTask[][] {
  const order: string[] = [];
  const byRegion = new Map<string, WarmTask[]>();
  for (const t of tasks) {
    if (!byRegion.has(t.region)) {
      if (order.length >= maxRegions) continue;
      order.push(t.region);
      byRegion.set(t.region, []);
    }
    byRegion.get(t.region)!.push(t);
  }
  return order.map((r) => byRegion.get(r)!.sort((a, b) => a.days - b.days));
}

/** 최근 windowMs 안에 방문된 (지역, 일수) — 가장 최근 방문순. DB 오류면 빈 목록. */
export async function fetchRecentlyVisitedTasks(windowMs = VISIT_WINDOW_MS): Promise<WarmTask[]> {
  try {
    const r = await pool.query<{ region: string | null; days: string | null }>(
      `select payload->>'region' as region, payload->>'days' as days
         from place_candidate_cache
        where cache_key like 'course-visit:%' and created_at > now() - ($1 || ' milliseconds')::interval
        order by created_at desc`,
      [String(windowMs)],
    );
    const out: WarmTask[] = [];
    for (const row of r.rows) {
      const days = Number(row.days);
      if (!row.region || !Number.isInteger(days) || days < 1 || days > 7) continue;
      out.push({ region: row.region, days: days as CourseDays });
    }
    return out;
  } catch (err) {
    console.error("[courseVisits] fetch failed:", err);
    return [];
  }
}
