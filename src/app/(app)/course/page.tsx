import type { Metadata } from "next";
import { CourseBuilderPage } from "./CourseClient";

export const metadata: Metadata = {
  title: "AI 추천 코스 만들기 - 트레쥴",
  description: "지역만 고르면 관광지·맛집·카페·야경까지 하루 코스를 AI가 자동으로 구성해드려요.",
};

export default function Page() {
  return <CourseBuilderPage />;
}
