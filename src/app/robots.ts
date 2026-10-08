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
      // 작업지시서 2026-10-08 "#300 검증" §3-1 — 코스 지도 이미지(/api/blob/course-maps/…)는 코스 페이지·블로그의
      // 핵심 이미지인데 "/api/" 차단에 같이 막혀 있었다(이미지 검색 유입 손실). 구글은 더 구체적인(긴) 규칙을
      // 우선하므로 "/api/" 차단은 그대로 두고 이 경로만 연다. 후기 사진 등 다른 /api/blob/은 계속 막힌다.
      allow: ["/", "/api/blob/course-maps/"],
      disallow: ["/api/", "/planner", "/my", "/messages", "/saved-places", "/admin", "/account-deletion", "/delete-account"],
    },
    sitemap: "https://www.tradule.co.kr/sitemap.xml",
  };
}
