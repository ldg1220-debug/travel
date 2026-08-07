import type { Metadata } from "next";
import { HomePage } from "./HomeClient";

export const metadata: Metadata = {
  title: "트레쥴 - 지도로 짜는 여행 일정",
  description: "지도와 타임라인으로 여행 일정을 계획하세요. AI 추천 코스, 실시간 장소 검색, 여행 보관함까지 한 곳에서.",
};

export default function Page() {
  return <HomePage />;
}
