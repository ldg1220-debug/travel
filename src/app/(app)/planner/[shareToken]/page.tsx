import type { Metadata } from "next";
import { pool } from "@/lib/server/db";
import { PlannerBoard } from "../PlannerBoard";

export async function generateMetadata({ params }: { params: Promise<{ shareToken: string }> }): Promise<Metadata> {
  const { shareToken } = await params;
  const result = await pool.query<{ title: string; region: string }>(
    `select title, region from itineraries where "shareToken" = $1`,
    [shareToken],
  );
  const row = result.rows[0];
  if (!row) return { title: "공유된 일정 - 트레쥴" };
  const title = `${row.title} - 트레쥴`;
  return {
    title,
    description: `${row.region === "domestic" ? "국내" : "해외"} 여행 일정 · 트레쥴에서 함께 계획한 여행을 확인하세요.`,
    openGraph: { title },
  };
}

export default async function SharedPlannerPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  return <PlannerBoard shareToken={shareToken} />;
}
