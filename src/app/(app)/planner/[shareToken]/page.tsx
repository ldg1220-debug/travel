import type { Metadata } from "next";
import { pool } from "@/lib/server/db";
import { PlannerBoard } from "../PlannerBoard";
import type { ItineraryItem } from "@/lib/types";

/**
 * 카카오톡 공유 카드용 설명 — 작업지시서 2026-09-15 "공유 품질 4건" §1:
 * "해외 여행 일정 · 트레쥴에서 함께 계획한 여행을 확인하세요" 같은 일반
 * 문구는 정보가 0이라 카톡에서 클릭을 못 이끈다. "4박 5일 · 19곳 ·
 * 캐널시티 하카타, 다자이후 텐만구 외"처럼 이 계획만의 구체적인 내용을
 * 보여준다.
 */
export function buildOgDescription(items: ItineraryItem[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    return "트레쥴에서 함께 계획한 여행을 확인하세요.";
  }
  const sorted = [...items].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const dayCount = new Set(sorted.map((i) => i.date)).size;
  const daysLabel = dayCount <= 1 ? "당일치기" : `${dayCount - 1}박 ${dayCount}일`;
  const sampleNames = sorted.slice(0, 2).map((i) => i.name);
  const namesLabel = sampleNames.length === 0 ? "" : sampleNames.length < items.length ? `${sampleNames.join(", ")} 외` : sampleNames.join(", ");
  return [daysLabel, `${items.length}곳`, namesLabel].filter(Boolean).join(" · ");
}

export async function generateMetadata({ params }: { params: Promise<{ shareToken: string }> }): Promise<Metadata> {
  const { shareToken } = await params;
  const result = await pool.query<{ title: string; region: string; placesData: ItineraryItem[] }>(
    `select title, region, "placesData" from itineraries where "shareToken" = $1`,
    [shareToken],
  );
  const row = result.rows[0];
  if (!row) return { title: "공유된 일정 - 트레쥴" };
  const title = `${row.title} - 트레쥴`;
  const description = buildOgDescription(row.placesData);
  // §1: /api/og/plan/{shareToken}.png — course-brief의 정적 지도 생성기를
  // 재사용한 썸네일(src/lib/server/planMapImage.ts). 카카오톡은 og:image를
  // 캐시하므로, 이미 공유해둔 링크의 카드를 새로고침하려면 카카오
  // 디버거(https://developers.kakao.com/tool/clear/og)에서 초기화해야 한다.
  const imageUrl = `https://www.tradule.co.kr/api/og/plan/${encodeURIComponent(shareToken)}.png`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: [{ url: imageUrl, width: 1600, height: 1000 }],
    },
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
