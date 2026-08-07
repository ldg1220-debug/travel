import type { Metadata } from "next";
import { FeedPage } from "./FeedClient";

export const metadata: Metadata = {
  title: "여행 후기 피드 - 트레쥴",
  description: "다른 여행자들이 남긴 생생한 여행 후기와 사진을 둘러보세요.",
};

export default function Page() {
  return <FeedPage />;
}
