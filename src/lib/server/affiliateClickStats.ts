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
  /** 코스 페이지 "내 일정 만들기" CTA(course_page_cta_click) placement(top/bottom) 별 오늘·7일 클릭 수 — 저장 흐름 진입 지표. */
  courseCta: { placement: string; today: number; last7d: number }[];
  /** 저장 흐름 단계별(코스 CTA → 복사 클릭 → 복사 완료 → 계획 저장) 오늘·7일 이벤트 수 — 어디서 막히는지 보는 지표. */
  saveFunnel: { event: string; today: number; last7d: number }[];
}

/** 저장 흐름 퍼널로 세는 feature_events 이벤트(순서 = 퍼널 순서). */
export const SAVE_FUNNEL_EVENTS = ["course_page_cta_click", "plan_copy_click", "plan_copy_completed", "plan_save"] as const;

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
    const c = await pool.query<{ placement: string | null; today: string; last7d: string }>(
      `select coalesce(props->>'placement', 'top') as placement,
              count(*) filter (where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) as today,
              count(*) as last7d
         from feature_events
        where event = 'course_page_cta_click' and created_at >= now() - interval '7 days'
        group by 1
        order by 1`,
    );
    const f = await pool.query<{ event: string; today: string; last7d: string }>(
      `select event,
              count(*) filter (where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) as today,
              count(*) as last7d
         from feature_events
        where event = any($1) and created_at >= now() - interval '7 days'
        group by 1`,
      [[...SAVE_FUNNEL_EVENTS]],
    );
    const saveFunnel = SAVE_FUNNEL_EVENTS.map((event) => {
      const x = f.rows.find((r2) => r2.event === event);
      return { event, today: Number(x?.today ?? 0), last7d: Number(x?.last7d ?? 0) };
    });
    const courseCta = c.rows.map((x) => ({ placement: x.placement ?? "top", today: Number(x.today), last7d: Number(x.last7d) }));
    const rows = r.rows.map((x) => ({ event: x.event, provider: x.provider ?? "unknown", today: Number(x.today), last7d: Number(x.last7d) }));
    return { rows, today: rows.reduce((s, x) => s + x.today, 0), last7d: rows.reduce((s, x) => s + x.last7d, 0), courseCta, saveFunnel };
  } catch (err) {
    console.error("[affiliateClickStats] failed:", err);
    return null;
  }
}
