import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

const SIGNUP_TREND_DAYS = 14;
const RECENT_SIGNUPS_LIMIT = 10;

export interface AdminStats {
  totalUsers: number;
  newUsers: { today: number; last7: number; last30: number };
  activeUsers: { last1: number; last7: number; last30: number };
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
}

/** 관리자 대시보드 — 가입 추이·활성 사용자·서비스 이용량 요약. 관리자만. */
export const GET = withApiErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [totalsResult, trendResult, engagementResult, recentResult] = await Promise.all([
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

  const stats: AdminStats = {
    totalUsers: totals?.total ?? 0,
    newUsers: { today: totals?.today ?? 0, last7: totals?.last7 ?? 0, last30: totals?.last30 ?? 0 },
    activeUsers: { last1: totals?.active1 ?? 0, last7: totals?.active7 ?? 0, last30: totals?.active30 ?? 0 },
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
  };

  return NextResponse.json(stats);
});
