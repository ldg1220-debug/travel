import type { Metadata } from "next";
import { DiscoverPage } from "./DiscoverClient";
import { TravelpayoutsDriveScript } from "@/components/TravelpayoutsDriveScript";

// 작업지시서(2026-08-26, "네이버 소유확인 코드 + 메타 태그 보완") 4항.
export const metadata: Metadata = {
  title: "여행지 탐색 - 트레쥴",
  description: "인기 스팟과 실시간 맛집·명소를 검색하고, AI 추천 코스로 다음 여행지를 찾아보세요.",
  alternates: { canonical: "/discover" },
};

export default function Page() {
  return (
    <>
      {/* 숙소 등 제휴 링크가 항상 있는 페이지 — 작업지시서 2026-09-11
          "계획 탭 동선을 실제 경로로" §4, travelpayoutsDrive.ts 참고. */}
      <TravelpayoutsDriveScript />
      <DiscoverPage />
    </>
  );
}
