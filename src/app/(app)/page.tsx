import type { Metadata } from "next";
import { HomePage } from "./HomeClient";

const TITLE = "트레쥴 - 지도로 짜는 여행 일정";
const DESCRIPTION = "지도와 타임라인으로 여행 일정을 계획하세요. AI 추천 코스, 실시간 장소 검색, 여행 보관함까지 한 곳에서.";

// 작업지시서(2026-08-24, "아고다 반려 진단 + 제휴 심사 공통 요건") 3항 —
// canonical·openGraph가 없었다.
//
// og:url·canonical의 트레일링 슬래시에 대해(작업지시서 2026-08-26, "네이버
// 소유확인 코드 + 메타 태그 보완" 3항 — "canonical엔 슬래시가 있는데
// og:url엔 없다") — 직접 실측한 결과 실제로는 **둘 다 슬래시 없이**
// 나간다("https://www.tradule.co.kr", origin만). Next의 URL 리졸버
// (resolve-url.js resolveAbsoluteUrlWithPathname)가 두 필드 모두 같은
// 함수를 거치는데, 해석된 pathname이 정확히 "/"인 경우(사이트 루트) 항상
// origin만 반환하도록 하드코딩돼 있다 — 절대 URL을 리터럴로 넣어도
// 똑같이 슬래시가 잘려나간다(직접 테스트로 확인, next.config.ts에
// trailingSlash도 설정돼 있지 않음). 즉 두 필드는 서로 다른 게 아니라
// 이미 일치하고, 그 값이 사이트의 다른 모든 canonical(예: "/discover")과
// 도 트레일링 슬래시 없는 스타일로 일관된다 — Next의 메타데이터 API로는
// 이 특수 케이스를 우회해 슬래시를 강제로 붙일 방법이 없다(우회하려면
// metadata export 밖에서 수동으로 <link>/<meta> 태그를 추가해야 하는데,
// Next가 자동 생성한 태그와 중복될 위험이 있어 하지 않는다).
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Tradule 트레쥴",
    locale: "ko_KR",
    type: "website",
    // openGraph는 이 페이지가 정의하는 순간 layout.tsx의 openGraph
    // 전체를 통째로 덮어쓴다(Next의 중첩 필드 얕은 병합 — 딥 머지
    // 아님, 작업지시서 2026-08-26 2항 원인 설명 그대로) — 그래서
    // images를 layout.tsx뿐 아니라 여기도 명시해야 홈에서 og:image가
    // 사라지지 않는다.
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Tradule 트레쥴" }],
  },
};

// 작업지시서 5항 — ld+json WebSite + Organization. 지어낸 값 없이 이미
// layout.tsx metadataBase·manifest.ts에 있는 실제 값만 그대로 옮긴다.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Tradule 트레쥴",
      url: "https://www.tradule.co.kr",
      inLanguage: "ko-KR",
    },
    {
      "@type": "Organization",
      name: "Tradule 트레쥴",
      url: "https://www.tradule.co.kr",
      logo: "https://www.tradule.co.kr/brand/tradule-logo.png",
    },
  ],
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <HomePage />
    </>
  );
}
