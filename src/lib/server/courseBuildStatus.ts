import { pool } from "./db";
import { ptDateString } from "./mapsBudget";

/**
 * 코스 생성(재생성) 상태 — 작업지시서 2026-10-21 "긴급: 새 버전(v44) 코스가 만들어지지 않음" §2④⑤. Cowork 이 `/api/health` 의 `courseBuild` 만 보고 "재생성이 예약됐는지 ·
 * 시작됐는지 · 끝났는지 · 실패했는지"를 알 수 있게 DB(place_candidate_cache)에 마지막 사건과 하루 카운터를 남긴다. 비밀 값은 없다(키·지역·일수·결과 문구뿐).
 * 모든 쓰기는 실패해도 코스 생성을 막지 않는다(조용히 로그만).
 */
const STATUS_KEY = "course-build:status";

/** human/bot=방문, stale=직전 버전 서빙, sync=직전 버전이 없어 사용자 요청이 동기로 새 버전을 만든 횟수, botRebuild=검색 로봇 요청이 재생성을 일으킨 횟수(설계상 항상 0). */
export type CourseCounterKind = "human" | "bot" | "internal" | "api" | "stale" | "sync" | "botRebuild";
export function courseCounterKey(kind: CourseCounterKind, now = new Date()): string {
  return `course-build-day:${kind}:${ptDateString(now)}`;
}

/** 오늘(태평양 시간 날짜 — mapsBudget 의 오늘과 같다) 카운터를 1 올린다. */
export async function bumpCourseCounter(kind: CourseCounterKind, now = new Date()): Promise<void> {
  try {
    await pool.query(
      `insert into place_candidate_cache (cache_key, payload) values ($1, jsonb_build_object('count', 1))
       on conflict (cache_key) do update
         set payload = jsonb_build_object('count', coalesce((place_candidate_cache.payload->>'count')::int, 0) + 1), created_at = now()`,
      [courseCounterKey(kind, now)],
    );
  } catch (err) {
    console.error("[courseBuildStatus] counter failed:", err);
  }
}

const UA_PREFIX_LEN = 60;
export function userAgentKey(userAgent: string | null | undefined, now = new Date()): string {
  return `course-ua:${ptDateString(now)}:${(userAgent ?? "(none)").trim().slice(0, UA_PREFIX_LEN) || "(none)"}`;
}

/** 오늘 코스 요청의 User-Agent(앞 60자)별 횟수를 센다 — 봇 목록에 없는 수집기를 찾는 용도. */
export async function recordUserAgent(userAgent: string | null | undefined, now = new Date()): Promise<void> {
  try {
    await pool.query(
      `insert into place_candidate_cache (cache_key, payload) values ($1, jsonb_build_object('count', 1))
       on conflict (cache_key) do update
         set payload = jsonb_build_object('count', coalesce((place_candidate_cache.payload->>'count')::int, 0) + 1), created_at = now()`,
      [userAgentKey(userAgent, now)],
    );
  } catch (err) {
    console.error("[courseBuildStatus] ua counter failed:", err);
  }
}

/** 이틀 넘은 User-Agent 카운터를 지운다(워밍 크론이 부른다). */
export async function purgeOldUserAgents(): Promise<void> {
  try {
    await pool.query(`delete from place_candidate_cache where cache_key like 'course-ua:%' and created_at < now() - interval '2 days'`);
  } catch (err) {
    console.error("[courseBuildStatus] ua purge failed:", err);
  }
}

export type RebuildResult = "scheduled" | "started" | "ok" | "fail" | "skipped-lock" | "deferred" | "thin-rejected";
export interface RebuildEvent {
  key: string;
  result: RebuildResult;
  /** 실패 사유·완료 요약(스팟 수 등) — 짧은 문구. */
  detail?: string;
}

/** 재생성 사건을 상태 행에 합친다(마지막 값만 남는다). scheduled → started → ok|fail 순서로 갱신되므로 "started 에서 멈춤"이면 중간에 함수가 끊긴 것이다. */
export async function recordRebuildEvent(event: RebuildEvent, now = new Date()): Promise<void> {
  const at = now.toISOString();
  const patch: Record<string, unknown> = {
    lastRebuildAt: at,
    lastRebuildKey: event.key,
    lastRebuildResult: event.detail ? `${event.result}: ${event.detail}`.slice(0, 200) : event.result,
    ...(event.result === "started" ? { lastRebuildStartedAt: at } : {}),
    ...(event.result === "ok" ? { lastRebuildOkAt: at } : {}),
  };
  await mergeStatus(patch);
}

/** 워밍 크론 실행 결과를 상태 행에 합친다. */
/** 워밍 호출 출처 — Vercel 크론(05:00 UTC, UA `vercel-cron/…`) · GitHub Actions(17:00 UTC, `X-Warm-Source: gh-actions`) · 그 밖의 수동 호출. */
export type WarmSource = "vercel-cron" | "gh-actions" | "manual";
export function warmSourceFrom(userAgent: string | null | undefined, warmSourceHeader: string | null | undefined): WarmSource {
  if (/^vercel-cron\//i.test(userAgent ?? "")) return "vercel-cron";
  if (warmSourceHeader === "gh-actions") return "gh-actions";
  return "manual";
}

/** 마지막 색인 코스 재생성의 대표 명소 보고(추적 대상 · 최종 코스에 있는 것 · 사라진 것과 단계·사유) — `/api/health` courseBuild.lastAnchorReport. */
export interface AnchorReportRecord {
  region: string;
  days: number;
  accepted: string[];
  placed: string[];
  dropped: Array<{ name: string; stage: string; reason: string }>;
}
export async function recordAnchorReport(report: AnchorReportRecord): Promise<void> {
  await mergeStatus({ lastAnchorReport: report });
}

export async function recordWarmRun(summary: string, now = new Date(), source: WarmSource = "manual"): Promise<void> {
  await mergeStatus({ lastWarmAt: now.toISOString(), lastWarmResult: summary.slice(0, 200), lastWarmSource: source });
}

async function mergeStatus(patch: Record<string, unknown>): Promise<void> {
  try {
    await pool.query(
      `insert into place_candidate_cache (cache_key, payload) values ($1, $2::jsonb)
       on conflict (cache_key) do update set payload = place_candidate_cache.payload || excluded.payload, created_at = now()`,
      [STATUS_KEY, JSON.stringify(patch)],
    );
  } catch (err) {
    console.error("[courseBuildStatus] status write failed:", err);
  }
}

/** 색인 대상(indexedCourses.json) 코스 한 건 — currentKey 는 현재 버전 브리프 캐시 키(`content-brief:{scope}:{지역}:{일수}:v{N}`). */
export interface IndexedCourseKey {
  region: string;
  days: number;
  currentKey: string;
}

/** 버전 전환 진행률 — 색인 대상 코스 가운데 현재 버전 캐시가 있는 것 / 직전 버전만 있는 것 / 둘 다 없는 것. */
export interface VersionProgress {
  total: number;
  onCurrent: number;
  onPrevious: number;
  missing: number;
  /** 현재 버전 브리프가 없는 색인 대상 상위 10. */
  missingList: Array<{ region: string; days: number }>;
}

export async function getVersionProgress(ttlMs: number, indexed: readonly IndexedCourseKey[]): Promise<VersionProgress | null> {
  try {
    const briefs = await pool.query<{ cache_key: string }>(
      `select cache_key from place_candidate_cache where cache_key like 'content-brief:%' and created_at > now() - ($1 || ' milliseconds')::interval`,
      [String(ttlMs)],
    );
    const keys = new Set(briefs.rows.map((r) => r.cache_key));
    let onCurrent = 0;
    let onPrevious = 0;
    const missingList: Array<{ region: string; days: number }> = [];
    for (const c of indexed) {
      if (keys.has(c.currentKey)) {
        onCurrent++;
        continue;
      }
      const prefix = c.currentKey.slice(0, c.currentKey.lastIndexOf(":v") + 2);
      if ([...keys].some((k) => k.startsWith(prefix))) onPrevious++;
      else if (missingList.length < 10) missingList.push({ region: c.region, days: c.days });
    }
    const missing = indexed.length - onCurrent - onPrevious;
    return { total: indexed.length, onCurrent, onPrevious, missing, missingList };
  } catch (err) {
    console.error("[courseBuildStatus] version progress failed:", err);
    return null;
  }
}

export interface CourseBuildHealth {
  currentVersion: number;
  lastRebuildAt: string | null;
  lastRebuildKey: string | null;
  lastRebuildResult: string | null;
  lastRebuildStartedAt: string | null;
  lastRebuildOkAt: string | null;
  lastWarmAt: string | null;
  lastWarmResult: string | null;
  /** 마지막 워밍을 부른 쪽 — "vercel-cron"(05:00 UTC) · "gh-actions"(17:00 UTC) · "manual". */
  lastWarmSource: WarmSource | null;
  lastAnchorReport: AnchorReportRecord | null;
  /** 오늘(태평양 시간) 직전 버전을 내보낸 요청 수. */
  staleServedToday: number | null;
  /** 오늘 사람 방문(검색 로봇 제외)과 로봇 요청 수 — course-brief · 코스 페이지 · 지도 · 열기 요청의 getCourseBrief 호출 기준. */
  visitsHumanToday: number | null;
  visitsBotToday: number | null;
  /** 오늘 직전 버전이 없어 사용자 요청이 동기로 새 버전을 만든 횟수(text-pro todayBySource.user 의 일부). */
  syncBuildsToday: number | null;
  /** 오늘 검색 로봇 요청이 재생성을 일으킨 횟수 — 0 이어야 한다. */
  rebuildTriggeredByBotToday: number | null;
  versionProgress: VersionProgress | null;
  /** 색인 대상 코스 요약 — fresh = 현재 버전 캐시가 있는 것, missing = 그 밖(직전 버전만·없음). */
  indexed: { total: number; fresh: number; missing: number } | null;
  /** 오늘 코스 요청의 출처 분포 — human=사람(브라우저+Accept-Language+화면), bot=수집기, internal=TraduleAutoPipeline 등 우리 서버, api=브라우저가 아닌 직접 호출. */
  visitsBySource: { human: number | null; bot: number | null; internal: number | null; api: number | null };
  /** 오늘 User-Agent(앞 60자) 상위 10. */
  topUserAgents: Array<{ userAgent: string; count: number }> | null;
}

export async function getCourseBuildStatus(currentVersion: number, now = new Date(), ttlMs = 26 * 60 * 60 * 1000, indexed: readonly IndexedCourseKey[] = []): Promise<CourseBuildHealth> {
  const read = async (key: string): Promise<Record<string, unknown> | null> => {
    try {
      const r = await pool.query<{ payload: Record<string, unknown> }>(`select payload from place_candidate_cache where cache_key = $1`, [key]);
      return r.rows[0]?.payload ?? {};
    } catch (err) {
      console.error("[courseBuildStatus] read failed:", err);
      return null;
    }
  };
  const topUa = async (): Promise<Array<{ userAgent: string; count: number }> | null> => {
    try {
      const prefix = `course-ua:${ptDateString(now)}:`;
      const r = await pool.query<{ cache_key: string; n: number | null }>(
        `select cache_key, (payload->>'count')::int as n from place_candidate_cache where left(cache_key, $1) = $2 order by n desc nulls last limit 10`,
        [prefix.length, prefix],
      );
      return r.rows.map((row) => ({ userAgent: row.cache_key.slice(prefix.length), count: row.n ?? 0 }));
    } catch (err) {
      console.error("[courseBuildStatus] top ua failed:", err);
      return null;
    }
  };
  const [status, stale, human, bot, sync, botRebuild, versionProgress, internal, api, topUserAgents] = await Promise.all([
    read(STATUS_KEY),
    read(courseCounterKey("stale", now)),
    read(courseCounterKey("human", now)),
    read(courseCounterKey("bot", now)),
    read(courseCounterKey("sync", now)),
    read(courseCounterKey("botRebuild", now)),
    getVersionProgress(ttlMs, indexed),
    read(courseCounterKey("internal", now)),
    read(courseCounterKey("api", now)),
    topUa(),
  ]);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const count = (p: Record<string, unknown> | null) => (p == null ? null : typeof p.count === "number" ? p.count : 0);
  return {
    currentVersion,
    lastRebuildAt: str(status?.lastRebuildAt),
    lastRebuildKey: str(status?.lastRebuildKey),
    lastRebuildResult: str(status?.lastRebuildResult),
    lastRebuildStartedAt: str(status?.lastRebuildStartedAt),
    lastRebuildOkAt: str(status?.lastRebuildOkAt),
    lastWarmAt: str(status?.lastWarmAt),
    lastWarmResult: str(status?.lastWarmResult),
    lastAnchorReport: ((v) => (v && typeof v === "object" ? (v as AnchorReportRecord) : null))(status?.lastAnchorReport),
    lastWarmSource: ((v) => (v === "vercel-cron" || v === "gh-actions" || v === "manual" ? v : null))(status?.lastWarmSource),
    staleServedToday: count(stale),
    visitsHumanToday: count(human),
    visitsBotToday: count(bot),
    syncBuildsToday: count(sync),
    rebuildTriggeredByBotToday: count(botRebuild),
    versionProgress,
    indexed: versionProgress ? { total: versionProgress.total, fresh: versionProgress.onCurrent, missing: versionProgress.total - versionProgress.onCurrent } : null,
    visitsBySource: { human: count(human), bot: count(bot), internal: count(internal), api: count(api) },
    topUserAgents,
  };
}
