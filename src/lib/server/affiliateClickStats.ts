import { pool } from "./db";

/** 제휴 링크 클릭으로 세는 feature_events 이벤트 이름 — 수익 판단 지표(DIRECTION.md). */
export const AFFILIATE_CLICK_EVENTS = ["lodging_click", "esim_click", "ticket_click"] as const;

export interface AffiliateClickRow {
  event: string;
  provider: string;
  today: number;
  last7d: number;
}

export interface AffiliateClickStats {
  /** 이벤트·provider 별 오늘(KST)·최근 7일 클릭 수. */
  rows: AffiliateClickRow[];
  today: number;
  last7d: number;
}

/** /api/health 용 — 읽기 전용 집계 1쿼리. 실패하면 null(health 자체는 막지 않는다). */
export async function getAffiliateClickStats(): Promise<AffiliateClickStats | null> {
  try {
    const r = await pool.query<{ event: string; provider: string | null; today: string; last7d: string }>(
      `select event,
              coalesce(props->>'provider', 'unknown') as provider,
              count(*) filter (where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) as today,
              count(*) as last7d
         from feature_events
        where event = any($1) and created_at >= now() - interval '7 days'
        group by 1, 2
        order by 1, 2`,
      [[...AFFILIATE_CLICK_EVENTS]],
    );
    const rows = r.rows.map((x) => ({ event: x.event, provider: x.provider ?? "unknown", today: Number(x.today), last7d: Number(x.last7d) }));
    return { rows, today: rows.reduce((s, x) => s + x.today, 0), last7d: rows.reduce((s, x) => s + x.last7d, 0) };
  } catch (err) {
    console.error("[affiliateClickStats] failed:", err);
    return null;
  }
}
