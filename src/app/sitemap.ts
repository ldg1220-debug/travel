import type { MetadataRoute } from "next";
import { pool } from "@/lib/server/db";
import { daysToLabel, ENABLED_COURSE_PAGE_DAYS, ENABLED_COURSE_PAGE_REGIONS } from "@/lib/coursePages";

/**
 * 작업지시서(2026-08-24, "아고다 반려 진단 + 제휴 심사 공통 요건") 2항 —
 * `/sitemap.xml`이 404였다. 로그인 없이 실제로 열리는 7개 라우트만
 * 우선 등록한다(작업지시서가 실측으로 확인한 목록 그대로) — 존재하지
 * 않거나 로그인 뒤에서만 의미 있는 URL을 지어내 넣지 않는다.
 *
 * 작업지시서 2026-09-18 "트레쥴이 구글에 7페이지만 올라가 있습니다" §3/§4/§6:
 * 실측 — sitemap에 7개뿐이라 구글이 색인할 페이지 자체가 없었다. 두 종류를
 * 추가한다.
 *  · 전체공개 후기(/trip/{id}) — 이미 SSR 메타(fetchPublicTripPostMeta)가
 *    있는데 sitemap에 없어서 안 올라가고 있었다("색인만 안 되고 있다").
 *    lastmod = updated_at, 비공개/친구공개/특정인공개는 애초에 쿼리에서
 *    제외한다.
 *  · 공개된 코스 페이지(/course/{지역}/{일수}) — 1단계 허용목록
 *    (coursePages.ts) 그대로. 이 파일이 매 요청/재생성 시점에 그 목록을
 *    그대로 반영하므로, 별도의 "sitemap 재생성" 크론 없이 §6의 "sitemap
 *    재생성" 요구를 충족한다 — 목록을 넓히는 2·3단계도 이 배열만 늘리면
 *    자동으로 sitemap에 반영된다. lastmod는 "지금"으로 둔다 — course-brief
 *    자체 캐시 TTL(약 26시간)이 있어 실제 변경 시점을 별도로 추적하는
 *    장치까진 이번엔 만들지 않았다.
 *
 * 후기 목록은 DB를 매번 조회해야 의미가 있다(§3 "후기가 늘어날 때
 * 자동으로 들어가게 하세요") — 이 파일이 async가 됐다고 자동으로
 * 매 요청 실행되는 건 아니라, 명시적으로 강제하지 않으면 Next.js가
 * 빌드 시점 스냅샷으로 정적 캐싱한다(새 후기가 다음 배포 전까지
 * sitemap에 안 잡힘).
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://www.tradule.co.kr";
  const now = new Date();
  const routes: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/discover", changeFrequency: "daily", priority: 0.9 },
    { path: "/course", changeFrequency: "weekly", priority: 0.8 },
    { path: "/community", changeFrequency: "daily", priority: 0.7 },
    { path: "/scrapbook", changeFrequency: "weekly", priority: 0.5 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  ];
  const staticEntries: MetadataRoute.Sitemap = routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const coursePageEntries: MetadataRoute.Sitemap = ENABLED_COURSE_PAGE_REGIONS.flatMap((region) =>
    ENABLED_COURSE_PAGE_DAYS.map((days) => ({
      url: `${base}/course/${encodeURIComponent(region)}/${encodeURIComponent(daysToLabel(days))}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  );

  let tripPostEntries: MetadataRoute.Sitemap = [];
  try {
    const result = await pool.query<{ id: number; updatedAt: Date }>(
      `select id, updated_at as "updatedAt" from trip_posts where visibility = 'public' order by updated_at desc`,
    );
    tripPostEntries = result.rows.map((row) => ({
      url: `${base}/trip/${row.id}`,
      lastModified: row.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    // sitemap 전체가 죽는 것보다, 후기 부분만 빠지고 나머지(정적 라우트+
    // 코스 페이지)라도 나가는 게 낫다 — DB 순간 장애가 sitemap 자체를
    // 지워버리면 이미 색인된 페이지들의 재크롤 신호까지 끊긴다.
    console.error("[sitemap] failed to load public trip posts:", err);
  }

  return [...staticEntries, ...coursePageEntries, ...tripPostEntries];
}
