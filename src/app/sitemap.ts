import type { MetadataRoute } from "next";

/**
 * 작업지시서(2026-08-24, "아고다 반려 진단 + 제휴 심사 공통 요건") 2항 —
 * `/sitemap.xml`이 404였다. 로그인 없이 실제로 열리는 7개 라우트만
 * 우선 등록한다(작업지시서가 실측으로 확인한 목록 그대로) — 존재하지
 * 않거나 로그인 뒤에서만 의미 있는 URL을 지어내 넣지 않는다. 지역별
 * 공개 페이지(`/discover/[region]`)가 생기면 그때 이 목록에 자동으로
 * 합류하도록 확장할 것(작업지시서 5항 6번, 별도 작업).
 */
export default function sitemap(): MetadataRoute.Sitemap {
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
  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
