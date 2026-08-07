import type { Metadata } from "next";
import { CommunityPage } from "./CommunityClient";

export const metadata: Metadata = {
  title: "커뮤니티 - 트레쥴",
  description: "여행 동행 구하기, 질문답변, 여행 꿀팁까지 여행자들과 나눠보세요.",
};

export default function Page() {
  return <CommunityPage />;
}
