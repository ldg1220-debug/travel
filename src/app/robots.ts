import type { MetadataRoute } from "next";

/**
 * 작업지시서(2026-08-24, "아고다 반려 진단 + 제휴 심사 공통 요건") 1항 —
 * `/robots.txt`가 404였다. 로그인 뒤에서만 의미 있는 화면(플래너·내 정보·
 * 메시지 등)과 API 라우트는 크롤링해도 색인할 콘텐츠가 없어 명시적으로
 * 막고, 그 외(홈·discover·course·community·scrapbook·privacy·terms 등
 * 로그인 없이 열리는 화면)는 전부 허용한다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/planner", "/my", "/messages", "/saved-places", "/admin", "/account-deletion", "/delete-account"],
    },
    sitemap: "https://www.tradule.co.kr/sitemap.xml",
  };
}
