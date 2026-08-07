import type { Metadata } from "next";
import { ScrapbookPage } from "./ScrapbookClient";

export const metadata: Metadata = {
  title: "여행 보관함 - 트레쥴",
  description: "저장한 여행 계획과 관심 장소를 한눈에 모아보세요.",
};

export default function Page() {
  return <ScrapbookPage />;
}
