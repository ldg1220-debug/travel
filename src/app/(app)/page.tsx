import type { Metadata } from "next";
import { HomePage } from "./HomeClient";

const TITLE = "트레쥴 - 지도로 짜는 여행 일정";
const DESCRIPTION = "지도와 타임라인으로 여행 일정을 계획하세요. AI 추천 코스, 실시간 장소 검색, 여행 보관함까지 한 곳에서.";

// 작업지시서(2026-08-24, "아고다 반려 진단 + 제휴 심사 공통 요건") 3항 —
// canonical·openGraph가 없었다(og:image는 루트의 opengraph-image.tsx가
// 대신 공급). alternates.canonical은 layout.tsx의 metadataBase("https://
// www.tradule.co.kr")를 기준으로 절대 URL로 해석된다.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", siteName: "Tradule 트레쥴", locale: "ko_KR", type: "website" },
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
