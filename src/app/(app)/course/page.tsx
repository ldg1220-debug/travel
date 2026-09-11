import type { Metadata } from "next";
import { CourseBuilderPage } from "./CourseClient";
import { TravelpayoutsDriveScript } from "@/components/TravelpayoutsDriveScript";

// 작업지시서(2026-08-26, "네이버 소유확인 코드 + 메타 태그 보완") 4항.
export const metadata: Metadata = {
  title: "AI 추천 코스 만들기 - 트레쥴",
  description: "지역만 고르면 관광지·맛집·카페·야경까지 하루 코스를 AI가 자동으로 구성해드려요.",
  alternates: { canonical: "/course" },
};

export default function Page() {
  return (
    <>
      {/* eSIM 등 제휴 링크가 항상 있는 페이지 — 작업지시서 2026-09-11
          "계획 탭 동선을 실제 경로로" §4, travelpayoutsDrive.ts 참고. */}
      <TravelpayoutsDriveScript />
      <CourseBuilderPage />
    </>
  );
}
