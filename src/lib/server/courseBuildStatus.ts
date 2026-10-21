import { pool } from "./db";
import { ptDateString } from "./mapsBudget";

/**
 * 코스 생성(재생성) 상태 — 작업지시서 2026-10-21 "긴급: 새 버전(v44) 코스가 만들어지지 않음" §2④⑤. Cowork 이 `/api/health` 의 `courseBuild` 만 보고 "재생성이 예약됐는지 ·
 * 시작됐는지 · 끝났는지 · 실패했는지"를 알 수 있게 DB(place_candidate_cache)에 마지막 사건과 하루 카운터를 남긴다. 비밀 값은 없다(키·지역·일수·결과 문구뿐).
 * 모든 쓰기는 실패해도 코스 생성을 막지 않는다(조용히 로그만).
 */
const STATUS_KEY = "course-build:status";

export type CourseCounterKind = "human" | "bot" | "stale";
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

export type RebuildResult = "scheduled" | "started" | "ok" | "fail" | "skipped-lock";
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
export async function recordWarmRun(summary: string, now = new Date()): Promise<void> {
  await mergeStatus({ lastWarmAt: now.toISOString(), lastWarmResult: summary.slice(0, 200) });
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

export interface CourseBuildHealth {
  currentVersion: number;
  lastRebuildAt: string | null;
  lastRebuildKey: string | null;
  lastRebuildResult: string | null;
  lastRebuildStartedAt: string | null;
  lastRebuildOkAt: string | null;
  lastWarmAt: string | null;
  lastWarmResult: string | null;
  /** 오늘(태평양 시간) 직전 버전을 내보낸 요청 수. */
  staleServedToday: number | null;
  /** 오늘 사람 방문(검색 로봇 제외)과 로봇 요청 수 — course-brief · 코스 페이지 · 지도 · 열기 요청의 getCourseBrief 호출 기준. */
  visitsHumanToday: number | null;
  visitsBotToday: number | null;
}

export async function getCourseBuildStatus(currentVersion: number, now = new Date()): Promise<CourseBuildHealth> {
  const read = async (key: string): Promise<Record<string, unknown> | null> => {
    try {
      const r = await pool.query<{ payload: Record<string, unknown> }>(`select payload from place_candidate_cache where cache_key = $1`, [key]);
      return r.rows[0]?.payload ?? {};
    } catch (err) {
      console.error("[courseBuildStatus] read failed:", err);
      return null;
    }
  };
  const [status, stale, human, bot] = await Promise.all([
    read(STATUS_KEY),
    read(courseCounterKey("stale", now)),
    read(courseCounterKey("human", now)),
    read(courseCounterKey("bot", now)),
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
    staleServedToday: count(stale),
    visitsHumanToday: count(human),
    visitsBotToday: count(bot),
  };
}
