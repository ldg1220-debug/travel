import type { Metadata } from "next";
import { PlannerBoard } from "./PlannerBoard";

export const metadata: Metadata = {
  title: "일정 계획 - 트레쥴",
  description: "지도와 타임라인으로 여행 일정을 짜고, 드래그로 바로 스케줄을 채워보세요.",
};

export default function PlannerPage() {
  return <PlannerBoard />;
}
