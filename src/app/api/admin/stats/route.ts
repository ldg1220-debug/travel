import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { FEATURE_EVENT_NAMES } from "@/lib/featureEvents";

const SIGNUP_TREND_DAYS = 14;
const RECENT_SIGNUPS_LIMIT = 10;

export interface AdminStats {
  totalUsers: number;
  newUsers: { today: number; last7: number; last30: number };
  activeUsers: { last1: number; last7: number; last30: number };
  /** 비로그인 방문(집계, 개인 식별 정보 없음) — src/app/api/track/visit. */
  anonymousVisits: { today: number; last7: number; last30: number };
  /** 최근 14일간 일별 신규가입자 수 — 가입이 없던 날도 0으로 채워서 넘긴다. */
  signupTrend: { date: string; count: number }[];
  engagement: {
    savedPlans: number;
    tripPosts: number;
    reviews: number;
    messages: number;
    mateConnections: number;
  };
  recentSignups: { id: number; name: string; image: string | null; createdAt: string }[];
  /** 기능 사용 이벤트(#168) — feature_events 테이블 집계. 이벤트별 최근 7/30일 발생 수 + 고유 세션 수(퍼널/재사용 지표용). */
  featureEvents: { event: string; last7: number; last30: number; uniqueSessions7: number; uniqueSessions30: number }[];
  /** place_search 중 결과 0건이었던 검색어 상위 10 (최근 30일) — 검색 데이터/카테고리 보강 우선순위 파악용. */
  emptySearchQueries: { query: string; count: number }[];
}

/** 관리자 대시보드 — 가입 추이·활성 사용자·서비스 이용량 요약. 관리자만. */
export const GET = withApiErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [totalsResult, trendResult, engagementResult, recentResult, visitsResult, featureEventsResult, emptySearchResult] = await Promise.all([
    pool.query<{
      total: number;
      today: number;
      last7: number;
      last30: number;
      active1: number;
      active7: number;
      active30: number;
    }>(
      `select
         count(*)::int as total,
         count(*) filter (where "createdAt" >= now() - interval '1 day')::int as today,
         count(*) filter (where "createdAt" >= now() - interval '7 days')::int as last7,
         count(*) filter (where "createdAt" >= now() - interval '30 days')::int as last30,
         count(*) filter (where "lastActiveAt" >= now() - interval '1 day')::int as active1,
         count(*) filter (where "lastActiveAt" >= now() - interval '7 days')::int as active7,
         count(*) filter (where "lastActiveAt" >= now() - interval '30 days')::int as active30
       from users`,
    ),
    pool.query<{ day: string; count: number }>(
      `select to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, count(*)::int as count
       from users
       where "createdAt" >= now() - interval '${SIGNUP_TREND_DAYS} days'
       group by 1
       order by 1`,
    ),
    pool.query<{
      savedplans: number;
      tripposts: number;
      reviews: number;
      messages: number;
      mateconnections: number;
    }>(
      `select
         (select count(*)::int from itineraries where "isDraft" = false) as savedplans,
         (select count(*)::int from trip_posts) as tripposts,
         (select count(*)::int from reviews) as reviews,
         (select count(*)::int from messages where deleted = false) as messages,
         (select count(*)::int from follows where status = 'accepted') as mateconnections`,
    ),
    pool.query<{ id: number; name: string | null; nickname: string | null; image: string | null; createdAt: string }>(
      `select id, name, nickname, image, "createdAt" from users order by "createdAt" desc limit ${RECENT_SIGNUPS_LIMIT}`,
    ),
    pool.query<{ today: number; last7: number; last30: number }>(
      `select
         coalesce(sum(count) filter (where day = current_date), 0)::int as today,
         coalesce(sum(count) filter (where day >= current_date - interval '6 days'), 0)::int as last7,
         coalesce(sum(count) filter (where day >= current_date - interval '29 days'), 0)::int as last30
       from visitor_counts`,
    ),
    pool.query<{ event: string; last7: number; last30: number; uniquesessions7: number; uniquesessions30: number }>(
      `select
         event,
         count(*) filter (where created_at >= now() - interval '7 days')::int as last7,
         count(*) filter (where created_at >= now() - interval '30 days')::int as last30,
         count(distinct session_id) filter (where created_at >= now() - interval '7 days')::int as uniquesessions7,
         count(distinct session_id) filter (where created_at >= now() - interval '30 days')::int as uniquesessions30
       from feature_events
       where created_at >= now() - interval '30 days'
       group by event`,
    ),
    // 검색은 됐지만 결과가 하나도 없었던 검색어 — 콘텐츠/카테고리 보강
    // 우선순위를 정하는 데 쓰인다. props는 자유 형식 JSONB라 place_search가
    // 아닌 이벤트나 query가 없는 옛 이벤트가 섞여도 where절에서 걸러진다.
    pool.query<{ query: string; count: number }>(
      `select props->>'query' as query, count(*)::int as count
       from feature_events
       where event = 'place_search'
         and created_at >= now() - interval '30 days'
         and props->>'empty' = 'true'
         and coalesce(props->>'query', '') <> ''
       group by 1
       order by count(*) desc
       limit 10`,
    ),
  ]);

  const totals = totalsResult.rows[0];

  // SQL만으로는 가입자가 0명인 날짜가 결과에서 통째로 빠지므로, 최근 14일을
  // 전부 순회하며 0으로 채운 뒤 실제 집계값으로 덮어써서 그래프에 빈 날짜가
  // 생기지 않게 한다.
  const trendByDay = new Map(trendResult.rows.map((r) => [r.day, r.count]));
  const signupTrend: AdminStats["signupTrend"] = [];
  for (let i = SIGNUP_TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    signupTrend.push({ date: key, count: trendByDay.get(key) ?? 0 });
  }

  const engagementRow = engagementResult.rows[0];
  const visits = visitsResult.rows[0];

  // signupTrend와 같은 이유 — 아직 한 번도 안 일어난 이벤트는 SQL 결과에서
  // 통째로 빠지므로, 알려진 이벤트 목록(FEATURE_EVENT_NAMES) 전체를 0으로
  // 먼저 채운 뒤 실제 집계값으로 덮어써서 대시보드에 항목 자체가
  // 안 보이는 일이 없게 한다.
  const featureEventsByName = new Map(featureEventsResult.rows.map((r) => [r.event, r]));
  const featureEvents: AdminStats["featureEvents"] = FEATURE_EVENT_NAMES.map((event) => {
    const row = featureEventsByName.get(event);
    return {
      event,
      last7: row?.last7 ?? 0,
      last30: row?.last30 ?? 0,
      uniqueSessions7: row?.uniquesessions7 ?? 0,
      uniqueSessions30: row?.uniquesessions30 ?? 0,
    };
  });

  const stats: AdminStats = {
    totalUsers: totals?.total ?? 0,
    newUsers: { today: totals?.today ?? 0, last7: totals?.last7 ?? 0, last30: totals?.last30 ?? 0 },
    activeUsers: { last1: totals?.active1 ?? 0, last7: totals?.active7 ?? 0, last30: totals?.active30 ?? 0 },
    anonymousVisits: { today: visits?.today ?? 0, last7: visits?.last7 ?? 0, last30: visits?.last30 ?? 0 },
    signupTrend,
    engagement: {
      savedPlans: engagementRow?.savedplans ?? 0,
      tripPosts: engagementRow?.tripposts ?? 0,
      reviews: engagementRow?.reviews ?? 0,
      messages: engagementRow?.messages ?? 0,
      mateConnections: engagementRow?.mateconnections ?? 0,
    },
    recentSignups: recentResult.rows.map((r) => ({
      id: r.id,
      name: r.nickname || r.name || "이름 없음",
      image: r.image,
      createdAt: r.createdAt,
    })),
    featureEvents,
    emptySearchQueries: emptySearchResult.rows,
  };

  return NextResponse.json(stats);
});
