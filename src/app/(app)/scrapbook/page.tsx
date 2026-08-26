import type { Metadata } from "next";
import { ScrapbookPage } from "./ScrapbookClient";

// 작업지시서(2026-08-26, "네이버 소유확인 코드 + 메타 태그 보완") 4항.
export const metadata: Metadata = {
  title: "여행 보관함 - 트레쥴",
  description: "저장한 여행 계획과 관심 장소를 한눈에 모아보세요.",
  alternates: { canonical: "/scrapbook" },
};

export default function Page() {
  return <ScrapbookPage />;
}
