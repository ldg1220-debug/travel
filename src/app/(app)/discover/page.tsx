import type { Metadata } from "next";
import { DiscoverPage } from "./DiscoverClient";

export const metadata: Metadata = {
  title: "여행지 탐색 - 트레쥴",
  description: "인기 스팟과 실시간 맛집·명소를 검색하고, AI 추천 코스로 다음 여행지를 찾아보세요.",
};

export default function Page() {
  return <DiscoverPage />;
}
