import type { Metadata } from "next";
import { CommunityPage } from "./CommunityClient";

// 작업지시서(2026-08-26, "네이버 소유확인 코드 + 메타 태그 보완") 4항.
export const metadata: Metadata = {
  title: "커뮤니티 - 트레쥴",
  description: "여행 동행 구하기, 질문답변, 여행 꿀팁까지 여행자들과 나눠보세요.",
  alternates: { canonical: "/community" },
};

export default function Page() {
  return <CommunityPage />;
}
