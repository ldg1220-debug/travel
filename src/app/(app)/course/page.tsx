import type { Metadata } from "next";
import { CourseBuilderPage } from "./CourseClient";

// 작업지시서(2026-08-26, "네이버 소유확인 코드 + 메타 태그 보완") 4항.
export const metadata: Metadata = {
  title: "AI 추천 코스 만들기 - 트레쥴",
  description: "지역만 고르면 관광지·맛집·카페·야경까지 하루 코스를 AI가 자동으로 구성해드려요.",
  alternates: { canonical: "/course" },
};

export default function Page() {
  return <CourseBuilderPage />;
}
